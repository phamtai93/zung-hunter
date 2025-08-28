// src/background/background.ts
import { ScheduleRepository, LinkRepository, HistoryRepository } from '../storage/repositories';
import { Logger } from '../utils/logger';
import { SchedulerEngine } from '../utils/scheduler-engine';
import { Schedule, Link } from '../types';
import { TRACKING_STOCK_LINK, ALTERNATIVE_TRACKING_PATTERNS, TAB_CLOSE_TIMEOUT_MS } from '../utils/default-system-settings';

interface ActiveTab {
  tabId: number;
  linkId: string;
  scheduleId: string;
  startTime: Date;
  historyId: string;
}

class BackgroundManager {
  private isRunning = false;
  private checkInterval: number | null = null;
  private activeTabs: Map<number, ActiveTab> = new Map();
  
  constructor() {
    this.init();
  }

  private async init() {
    // Initialize logger first
    await Logger.loadStoredLogs();
    Logger.info('🚀 Background script initialized', {}, 'BACKGROUND');
    
    // Setup message listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('🔍 Background received message:', message.type, message.data);
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Setup alarm listener for scheduled tasks
    chrome.alarms.onAlarm.addListener((alarm) => {
      this.handleAlarm(alarm);
    });

    // Setup tab removal listener to handle manual tab closes
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
      this.handleTabRemoved(tabId, removeInfo);
    });

    // Setup webRequest listener FIRST - this is critical
    this.setupWebRequestListener();

    // Auto-start scheduler
    this.startScheduler();
    
    // Send periodic heartbeat logs for real-time testing
    setInterval(() => {
      if (this.isRunning) {
        Logger.info('Scheduler heartbeat', { 
          activeTabsCount: this.activeTabs.size,
          trackingMethods: 'webRequest (primary) + contentScript (backup)',
          timestamp: new Date().toISOString()
        }, 'SCHEDULER');
      }
    }, 30000); // Every 30 seconds
    
    // Send a test log to verify real-time communication
    setTimeout(() => {
      Logger.info('Background script ready - Dual tracking method active', { 
        primary: 'webRequest API (immediate)',
        backup: 'content script (full data)',
        trackingPatterns: [TRACKING_STOCK_LINK, ...ALTERNATIVE_TRACKING_PATTERNS],
        timestamp: new Date().toISOString() 
      }, 'BACKGROUND');
      
      // Test URL pattern matching
      const testUrls = [
        'https://shopee.vn/api/v4/pdp/get_pc?item_id=123',
        'https://example.com/api/v4/pdp/get_pc',
        'https://test.com/api/v4/item/get',
        'https://random.com/not/matching/url'
      ];
      
      console.log('🧪 Testing URL pattern matching:');
      testUrls.forEach(url => {
        const matches = this.shouldTrackUrl(url);
        console.log(`  ${matches ? '✅' : '❌'} ${url}`);
      });
    }, 2000);
  }

  private async handleMessage(message: any, sender: any, sendResponse: any) {
    try {
      console.log(`🔍 Processing message: ${message.type}`, {
        type: message.type,
        hasData: !!message.data,
        senderTabId: sender.tab?.id,
        senderUrl: sender.tab?.url
      });

      switch (message.type) {
        case 'START_SCHEDULER':
          this.startScheduler();
          sendResponse({ success: true });
          break;

        case 'STOP_SCHEDULER':
          this.stopScheduler();
          sendResponse({ success: true });
          break;

        case 'GET_SCHEDULER_STATUS':
          sendResponse({ isRunning: this.isRunning });
          
          // Also send status to dashboard
          chrome.runtime.sendMessage({
            type: 'SCHEDULER_STATUS',
            data: { isRunning: this.isRunning }
          }).catch(() => {});
          break;

        case 'GET_ACTIVE_TABS':
          const tabs = Array.from(this.activeTabs.values()).map(tab => ({
            id: tab.tabId.toString(),
            linkName: 'Loading...', // Will be updated from actual link data
            url: '',
            startTime: tab.startTime.toISOString(),
            status: 'loading',
            requestCount: 0
          }));
          sendResponse({ tabs });
          break;

        case 'API_REQUEST_TRACKED':
          console.log('📥 API_REQUEST_TRACKED received from content script:', {
            tabId: message.data?.tabId,
            url: message.data?.url,
            method: message.data?.method,
            hasModels: !!message.data?.modelsJson,
            source: message.data?.source
          });
          await this.handleApiTracked(message.data);
          sendResponse({ success: true });
          break;

        case 'GET_CURRENT_TAB_ID':
          // Get tab ID from sender
          const tabId = sender.tab?.id || 0;
          console.log('📋 GET_CURRENT_TAB_ID request:', { tabId, url: sender.tab?.url });
          sendResponse({ tabId });
          break;

        case 'CONTENT_SCRIPT_READY':
          console.log('✅ CONTENT_SCRIPT_READY from tab:', sender.tab?.id, message.data);
          await this.handleContentScriptReady(message.data, sender);
          sendResponse({ success: true });
          break;

        default:
          console.log('❓ Unknown message type:', message.type);
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error handling message:', errorMessage, error);
      Logger.error('Error handling message', error, 'BACKGROUND');
      sendResponse({ error: errorMessage });
    }
  }

  private async handleAlarm(alarm: chrome.alarms.Alarm) {
    if (alarm.name.startsWith('schedule_')) {
      const scheduleId = alarm.name.replace('schedule_', '');
      await this.executeSchedule(scheduleId);
    }
  }

  private startScheduler() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    Logger.info('Scheduler started', { timestamp: new Date().toISOString() }, 'SCHEDULER');
    
    // Notify dashboard about status change
    chrome.runtime.sendMessage({
      type: 'SCHEDULER_STATUS',
      data: { isRunning: true }
    }).catch(() => {});
    
    // Check for schedules every minute
    this.checkInterval = setInterval(() => {
      this.checkDueSchedules();
    }, 60000) as any;

    // Initial check
    this.checkDueSchedules();
  }

  private stopScheduler() {
    this.isRunning = false;
    Logger.info('Scheduler stopped', { timestamp: new Date().toISOString() }, 'SCHEDULER');
    
    // Notify dashboard about status change
    chrome.runtime.sendMessage({
      type: 'SCHEDULER_STATUS',
      data: { isRunning: false }
    }).catch(() => {});
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear all alarms
    chrome.alarms.clearAll();

    // Close active tabs
    this.activeTabs.forEach(async (activeTab) => {
      try {
        await chrome.tabs.remove(activeTab.tabId);
      } catch (error) {
        // Tab might already be closed
      }
    });
    this.activeTabs.clear();
  }

  private async checkDueSchedules() {
    if (!this.isRunning) return;

    try {
      const activeSchedules = await ScheduleRepository.getActiveSchedules();
      const now = new Date();

      for (const schedule of activeSchedules) {
        if (schedule.nextRun <= now) {
          Logger.info(`Schedule due: ${schedule.name}`, { 
            scheduleId: schedule.id 
          }, 'SCHEDULER');
          await this.executeSchedule(schedule.id);
        } else {
          // Set alarm for future execution
          const alarmTime = schedule.nextRun.getTime();
          chrome.alarms.create(`schedule_${schedule.id}`, {
            when: alarmTime
          });
        }
      }
    } catch (error) {
      Logger.error('Error checking due schedules', error, 'SCHEDULER');
    }
  }

  private async executeSchedule(scheduleId: string) {
    try {
      const schedule = await ScheduleRepository.getById(scheduleId);
      if (!schedule || !schedule.enabled) return;

      const link = await LinkRepository.getById(schedule.linkId);
      if (!link || !link.enabled) return;

      Logger.info(`Executing schedule: ${schedule.name}`, {
        scheduleId,
        linkId: link.id,
        url: link.url
      }, 'SCHEDULER');

      // Create execution history
      const historyData = await HistoryRepository.create({
        linkId: link.id,
        scheduleId: schedule.id,
        startTime: new Date(),
        success: false,
        logs: [`Started execution for ${link.name}`]
      });

      // Open tabs (based on quantity)
      for (let i = 0; i < schedule.quantity; i++) {
        await this.openTrackedTab(link, schedule, historyData.id, i);
      }

      // Update schedule's next run
      if (schedule.type !== 'once') {
        const nextRun = SchedulerEngine.calculateNextRun(schedule);
        await ScheduleRepository.updateNextRun(schedule.id, nextRun);
        Logger.info(`Schedule updated, next run: ${nextRun.toLocaleString()}`, {
          scheduleId: schedule.id
        }, 'SCHEDULER');
      } else {
        // Disable one-time schedules after execution
        await ScheduleRepository.update(schedule.id, { enabled: false });
        Logger.info('One-time schedule disabled', { scheduleId: schedule.id }, 'SCHEDULER');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Error executing schedule', error, 'SCHEDULER');
    }
  }

  private async openTrackedTab(link: Link, schedule: Schedule, historyId: string, index: number) {
    try {
      Logger.info(`Opening tracked tab for ${link.name} (${index + 1}/${schedule.quantity})`, {
        linkId: link.id,
        url: link.url
      }, `TAB_OPENING`);

      // Create tab directly with target URL (manifest content_scripts will inject immediately)
      const tab = await chrome.tabs.create({
        url: link.url,
        active: false // Open in background
      });

      if (!tab.id) throw new Error('Failed to create tab');

      // Store active tab info immediately
      const activeTab: ActiveTab = {
        tabId: tab.id,
        linkId: link.id,
        scheduleId: schedule.id,
        startTime: new Date(),
        historyId
      };

      this.activeTabs.set(tab.id, activeTab);

      // Additional programmatic injection as backup (in case manifest injection is slow)
      setTimeout(() => {
        this.injectContentScriptBackup(tab.id!);
      }, 500);

      Logger.info(`Tab opened for ${link.name}`, {
        tabId: tab.id,
        url: link.url
      }, `TAB_${tab.id}`);

      // Notify dashboard
      chrome.runtime.sendMessage({
        type: 'TAB_OPENED',
        data: {
          tabId: tab.id.toString(),
          linkName: link.name,
          url: link.url,
          startTime: activeTab.startTime.toISOString()
        }
      }).catch(() => {});

      // Set timeout to close tab after configured time (default 2 hours)
      setTimeout(() => {
        this.closeTab(tab.id!);
      }, TAB_CLOSE_TIMEOUT_MS);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Error opening tracked tab', error, 'TAB');
    }
  }

  private async closeTab(tabId: number) {
    try {
      const activeTab = this.activeTabs.get(tabId);
      
      // Check if tab still exists in our tracking before trying to close
      if (!activeTab) {
        Logger.warning(`Attempted to close untracked tab: ${tabId}`, { tabId }, `TAB_${tabId}`);
        return;
      }

      // Check if tab still exists in Chrome
      try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab) {
          Logger.warning(`Tab ${tabId} no longer exists`, { tabId }, `TAB_${tabId}`);
          this.activeTabs.delete(tabId);
          return;
        }
      } catch (tabError) {
        Logger.warning(`Tab ${tabId} not found when trying to close`, { 
          tabId, 
          error: tabError instanceof Error ? tabError.message : 'Unknown error'
        }, `TAB_${tabId}`);
        this.activeTabs.delete(tabId);
        return;
      }

      // Close the tab
      await chrome.tabs.remove(tabId);
      
      // Update history
      const endTime = new Date();
      const duration = endTime.getTime() - activeTab.startTime.getTime();
      
      await HistoryRepository.updateExecution(activeTab.historyId, {
        endTime,
        success: true, // Will be updated if there were errors
        logs: [`Tab closed after ${Math.round(duration / 1000)}s`]
      });

      // Remove from active tabs
      this.activeTabs.delete(tabId);

      Logger.info(`Tab closed successfully`, {
        tabId,
        duration: Math.round(duration / 1000) + 's'
      }, `TAB_${tabId}`);

      // Notify dashboard
      chrome.runtime.sendMessage({
        type: 'TAB_CLOSED',
        data: { tabId: tabId.toString() }
      }).catch(() => {});

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Error closing tab: ${errorMessage}`, error, `TAB_${tabId}`);
      
      // Still remove from our tracking even if closing failed
      this.activeTabs.delete(tabId);
    }
  }

  private async handleTabRemoved(tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) {
    const activeTab = this.activeTabs.get(tabId);
    
    if (activeTab) {
      Logger.info(`Tab removed externally`, { 
        tabId, 
        wasWindow: removeInfo.isWindowClosing 
      }, `TAB_${tabId}`);

      // Update history
      const endTime = new Date();
      const duration = endTime.getTime() - activeTab.startTime.getTime();
      
      try {
        await HistoryRepository.updateExecution(activeTab.historyId, {
          endTime,
          success: true,
          logs: [`Tab closed externally after ${Math.round(duration / 1000)}s`]
        });
      } catch (error) {
        Logger.error('Error updating history for externally closed tab', error, `TAB_${tabId}`);
      }

      // Remove from active tabs
      this.activeTabs.delete(tabId);

      // Notify dashboard
      chrome.runtime.sendMessage({
        type: 'TAB_CLOSED',
        data: { tabId: tabId.toString() }
      }).catch(() => {});
    }
  }
  private async handleApiTracked(data: any) {
    try {
      const { 
        tabId, 
        url, 
        method, 
        requestHeaders, 
        requestBody, 
        responseHeaders, 
        responseBody,
        responseStatus,
        responseStatusText,
        modelsJson,
        timestamp,
        captureSource 
      } = data;
      
      // Only process if URL matches TRACKING_STOCK_LINK
      if (!url.includes(TRACKING_STOCK_LINK)) return;

      const activeTab = this.activeTabs.get(tabId);
      if (!activeTab) return;

      Logger.info('API request tracked', {
        tabId,
        url,
        method,
        status: responseStatus,
        hasModels: !!modelsJson,
        source: captureSource
      }, `TAB_${tabId}`);

      // Store the complete tracked request data
      const trackedData = {
        url,
        method,
        timestamp,
        captureSource,
        request: {
          headers: requestHeaders,
          body: requestBody
        },
        response: {
          status: responseStatus,
          statusText: responseStatusText,
          headers: responseHeaders,
          body: responseBody,
          modelsJson: modelsJson  // Extracted models data for business logic
        }
      };

      // Update execution history with complete tracked data
      await HistoryRepository.updateExecution(activeTab.historyId, {
        executionData: {
          trackedRequests: [trackedData] // In real implementation, append to existing array
        },
        logs: [`API tracked: ${method} ${url} (${responseStatus}) - Models: ${modelsJson ? 'Found' : 'Not found'}`]
      });

      // Log models data if available
      if (modelsJson) {
        Logger.info('Models data extracted successfully', {
          tabId,
          modelsCount: Array.isArray(modelsJson) ? modelsJson.length : 'unknown',
          modelsPreview: Array.isArray(modelsJson) ? modelsJson.slice(0, 2) : modelsJson
        }, `TAB_${tabId}`);
      }

      // Notify dashboard with enhanced data
      chrome.runtime.sendMessage({
        type: 'API_TRACKED',
        data: { 
          tabId: tabId.toString(), 
          trackedData,
          hasModels: !!modelsJson,
          modelsCount: Array.isArray(modelsJson) ? modelsJson.length : null
        }
      }).catch(() => {});

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Error handling tracked API', error, 'BACKGROUND');
    }
  }

  /**
   * Handle content script ready notification
   */
  private async handleContentScriptReady(data: any, sender: any) {
    const tabId = sender.tab?.id;
    if (!tabId) return;

    const activeTab = this.activeTabs.get(tabId);
    if (activeTab) {
      Logger.info('Content script ready for tracking', {
        tabId,
        url: data.url,
        readyTime: data.timestamp
      }, `TAB_${tabId}`);

      // Update tab status
      chrome.runtime.sendMessage({
        type: 'TAB_UPDATED', 
        data: { 
          tabId: tabId.toString(), 
          status: 'ready' 
        }
      }).catch(() => {});
    }
  }

  /**
   * Backup content script injection (in case manifest injection is slow)
   */
  private async injectContentScriptBackup(tabId: number): Promise<void> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['src/content/request-tracker.js']
      });
      
      Logger.info('Backup content script injected successfully', { tabId }, `TAB_${tabId}`);
    } catch (error) {
      // This is expected to fail sometimes if manifest script already loaded
      Logger.debug('Backup injection failed (probably already loaded)', { 
        tabId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, `TAB_${tabId}`);
    }
  }

  /**
   * Check if URL matches any tracking patterns
   */
  private shouldTrackUrl(url: string): boolean {
    console.log('🔍 Checking URL for tracking:', url.substring(0, 150));
    
    if (url.includes(TRACKING_STOCK_LINK)) {
      console.log('✅ URL matches PRIMARY pattern:', TRACKING_STOCK_LINK);
      return true;
    }
    
    for (const pattern of ALTERNATIVE_TRACKING_PATTERNS) {
      if (url.includes(pattern)) {
        console.log('✅ URL matches ALTERNATIVE pattern:', pattern);
        return true;
      }
    }
    
    console.log('❌ URL does NOT match any tracking patterns');
    return false;
  }

  /**
   * Setup webRequest listener as PRIMARY method for early API tracking
   */
  private setupWebRequestListener() {
    try {
      console.log('🔧 Setting up webRequest listeners...');
      
      // Store pending requests to match with responses
      const pendingRequests = new Map<string, any>();

      // Listen to requests BEFORE they're sent - capture request headers
      chrome.webRequest.onBeforeSendHeaders.addListener(
        (details) => {
          const tabId = details.tabId;
          if (tabId && this.activeTabs.has(tabId)) {
            const url = details.url;
            
            console.log('🔍 webRequest onBeforeSendHeaders:', { tabId, url: url.substring(0, 100) });
            
            if (this.shouldTrackUrl(url)) {
              const requestKey = `${tabId}-${details.requestId}`;
              
              console.log('🎯 TRACKING URL MATCHED (onBeforeSendHeaders):', url);
              
              // Convert request headers to object
              const requestHeaders: Record<string, string> = {};
              if (details.requestHeaders) {
                details.requestHeaders.forEach(header => {
                  requestHeaders[header.name.toLowerCase()] = header.value || '';
                });
              }
              
              // Store request details
              pendingRequests.set(requestKey, {
                tabId,
                url,
                method: details.method,
                requestHeaders,
                timestamp: new Date().toISOString(),
                requestId: details.requestId
              });
              
              console.log('📋 Stored pending request:', requestKey, {
                method: details.method,
                headersCount: Object.keys(requestHeaders).length
              });
            }
          }
        },
        { urls: ["<all_urls>"] },
        ["requestHeaders"]
      );

      // Listen to requests with body
      chrome.webRequest.onBeforeRequest.addListener(
        (details) => {
          const tabId = details.tabId;
          if (tabId && this.activeTabs.has(tabId)) {
            const url = details.url;
            
            if (this.shouldTrackUrl(url)) {
              const requestKey = `${tabId}-${details.requestId}`;
              const existingRequest = pendingRequests.get(requestKey);
              
              console.log('📦 Adding request body to:', requestKey, {
                hasBody: !!details.requestBody,
                hasExistingRequest: !!existingRequest
              });
              
              if (existingRequest) {
                // Add request body to existing request
                existingRequest.requestBody = details.requestBody;
                pendingRequests.set(requestKey, existingRequest);
              }
              
              Logger.info('🎯 WebRequest intercepted (PRIMARY)', {
                tabId,
                url: url.substring(0, 100) + '...',
                method: details.method,
                requestId: details.requestId,
                hasBody: !!details.requestBody
              }, `TAB_${tabId}`);
            }
          }
        },
        { urls: ["<all_urls>"] },
        ["requestBody"]
      );

      // Listen to response headers
      chrome.webRequest.onHeadersReceived.addListener(
        (details) => {
          const tabId = details.tabId;
          if (tabId && this.activeTabs.has(tabId)) {
            const url = details.url;
            
            if (this.shouldTrackUrl(url)) {
              const requestKey = `${tabId}-${details.requestId}`;
              const pendingRequest = pendingRequests.get(requestKey);
              
              console.log('📥 webRequest onHeadersReceived:', requestKey, {
                status: details.statusCode,
                hasPendingRequest: !!pendingRequest
              });
              
              if (pendingRequest) {
                // Convert response headers to object
                const responseHeaders: Record<string, string> = {};
                if (details.responseHeaders) {
                  details.responseHeaders.forEach(header => {
                    responseHeaders[header.name.toLowerCase()] = header.value || '';
                  });
                }
                
                Logger.info('📥 WebRequest response headers received', {
                  tabId,
                  url: url.substring(0, 100) + '...',
                  statusCode: details.statusCode,
                  requestId: details.requestId,
                  headersCount: Object.keys(responseHeaders).length
                }, `TAB_${tabId}`);
                
                // Handle the tracked request with complete data
                this.handleWebRequestTracked(tabId, {
                  ...pendingRequest,
                  responseHeaders,
                  responseStatus: details.statusCode,
                  responseStatusText: this.getStatusText(details.statusCode)
                });
                
                // Clean up pending request
                pendingRequests.delete(requestKey);
              }
            }
          }
        },
        { urls: ["<all_urls>"] },
        ["responseHeaders"]
      );

      // Clean up old pending requests (prevent memory leaks)
      setInterval(() => {
        const now = Date.now();
        let cleanedCount = 0;
        for (const [key, request] of pendingRequests.entries()) {
          const requestTime = new Date(request.timestamp).getTime();
          if (now - requestTime > 30000) { // 30 seconds old
            pendingRequests.delete(key);
            cleanedCount++;
          }
        }
        if (cleanedCount > 0) {
          console.log('🧹 Cleaned up', cleanedCount, 'old pending requests');
        }
      }, 60000); // Clean up every minute
      
      console.log('✅ WebRequest listeners setup complete (PRIMARY METHOD)');
      Logger.info('WebRequest listeners setup complete (PRIMARY METHOD)', {
        listeners: ['onBeforeSendHeaders', 'onBeforeRequest', 'onHeadersReceived']
      }, 'BACKGROUND');
      
    } catch (error) {
      console.error('❌ Error setting up webRequest listeners:', error);
      Logger.error('Error setting up webRequest listeners', error, 'BACKGROUND');
    }
  }

  /**
   * Get HTTP status text from status code
   */
  private getStatusText(statusCode: number): string {
    const statusTexts: Record<number, string> = {
      200: 'OK',
      201: 'Created', 
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error'
    };
    return statusTexts[statusCode] || 'Unknown Status';
  }

  /**
   * Handle API tracking from webRequest (backup solution)
   */
  private async handleWebRequestTracked(tabId: number, details: chrome.webRequest.WebRequestBodyDetails) {
    try {
      const activeTab = this.activeTabs.get(tabId);
      if (!activeTab) return;

      const trackedData = {
        url: details.url,
        method: details.method,
        timestamp: new Date().toISOString(),
        requestHeaders: {},
        requestBody: details.requestBody,
        responseHeaders: {},
        responseBody: null, // Will be filled by content script if available
        source: 'webRequest' // Mark as backup source
      };

      // Update execution history
      await HistoryRepository.updateExecution(activeTab.historyId, {
        executionData: {
          trackedRequests: [trackedData]
        },
        logs: [`API tracked via webRequest: ${details.method} ${details.url}`]
      });

      // Notify dashboard
      chrome.runtime.sendMessage({
        type: 'API_TRACKED',
        data: { tabId: tabId.toString(), trackedData }
      }).catch(() => {});

    } catch (error) {
      Logger.error('Error handling webRequest tracked API', error, `TAB_${tabId}`);
    }
  }
}

// Initialize background manager
new BackgroundManager();