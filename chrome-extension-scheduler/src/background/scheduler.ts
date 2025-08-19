// src/background/scheduler.ts
import { ScheduleRepository, LinkRepository, HistoryRepository } from '../storage/repositories';
import { SchedulerEngine } from '../utils/scheduler-engine';
import { Schedule, Link } from '../types';
import { HIDDEN_TAB_SETTINGS, STORAGE_KEYS, TRACKING_STOCK_LINK } from '../utils/default-system-settings';

// ===== TYPE DEFINITIONS =====
interface WebRequestCompletedDetails extends chrome.webRequest.WebRequestDetails {
  statusCode?: number;
  statusLine?: string;
  responseHeaders?: chrome.webRequest.HttpHeader[];
}

interface WebRequestErrorDetails extends chrome.webRequest.WebRequestDetails {
  error: string;
}

// ===== GLOBAL WEB REQUEST MONITOR =====
class GlobalWebRequestMonitor {
  private static isSetup = false;
  private static capturedRequests: any[] = [];

  static setup() {
    if (this.isSetup) return;
    
    console.log('🔍 Setting up GLOBAL webRequest monitoring...');
    
    const onBeforeRequest = (details: chrome.webRequest.WebRequestDetails) => {
      console.log(`📡 GLOBAL onBeforeRequest: ${details.method} ${details.url} (Tab: ${details.tabId})`);
      
      // Store ALL requests for analysis
      this.capturedRequests.push({
        type: 'request',
        url: details.url,
        method: details.method,
        timestamp: Date.now(),
        tabId: details.tabId,
        requestId: details.requestId
      });
      
      // Check if it matches tracking pattern
      const shouldTrack = BackgroundScheduler.shouldTrackUrl(details.url);
      console.log(`🔍 Should track "${details.url}": ${shouldTrack}`);
      
      if (shouldTrack) {
        console.log(`🎯 ✅ GLOBAL TRACKED REQUEST: ${details.url}`);
        // Immediately save to storage
        BackgroundScheduler.saveGlobalTrackedRequest({
          id: BackgroundScheduler.generateRequestId(),
          url: details.url,
          method: details.method,
          headers: {},
          timestamp: Date.now(),
          tabId: details.tabId,
          source: 'global-monitor'
        });
      } else {
        console.log(`🎯 ❌ GLOBAL NOT TRACKED: ${details.url}`);
      }
    };

    // ✅ FIXED: Proper onCompleted handler with correct types
    const onCompleted = (details: WebRequestCompletedDetails) => {
      const statusCode = details.statusCode || 0;
      console.log(`📡 GLOBAL onCompleted: ${details.url} (Status: ${statusCode}, Tab: ${details.tabId})`);
      
      this.capturedRequests.push({
        type: 'response',
        url: details.url,
        status: statusCode,
        timestamp: Date.now(),
        tabId: details.tabId,
        requestId: details.requestId
      });

      // Check if it matches tracking pattern
      if (BackgroundScheduler.shouldTrackUrl(details.url)) {
        console.log(`🎯 ✅ GLOBAL TRACKED RESPONSE: ${details.url} (${statusCode})`);
        // Immediately save to storage
        BackgroundScheduler.saveGlobalTrackedResponse({
          id: BackgroundScheduler.generateRequestId(),
          requestId: details.requestId,
          status: statusCode,
          statusText: statusCode === 200 ? 'OK' : statusCode === 0 ? 'Unknown' : 'Error',
          headers: this.parseResponseHeaders(details.responseHeaders),
          timestamp: Date.now(),
          responseTime: 0,
          tabId: details.tabId,
          source: 'global-monitor'
        });
      }
    };

        // ✅ FIXED: Add onErrorOccurred handler for network errors
    const onErrorOccurred = (details: WebRequestErrorDetails) => {
      console.log(`📡 GLOBAL onErrorOccurred: ${details.url} (Error: ${details.error}, Tab: ${details.tabId})`);
      
      this.capturedRequests.push({
        type: 'error',
        url: details.url,
        error: details.error,
        timestamp: Date.now(),
        tabId: details.tabId,
        requestId: details.requestId
      });

      // Track errors for monitored URLs
      if (BackgroundScheduler.shouldTrackUrl(details.url)) {
        console.log(`🎯 ✅ GLOBAL TRACKED ERROR: ${details.url} (${details.error})`);
        BackgroundScheduler.saveGlobalTrackedResponse({
          id: BackgroundScheduler.generateRequestId(),
          requestId: details.requestId,
          status: 0,
          statusText: details.error,
          headers: {},
          timestamp: Date.now(),
          responseTime: 0,
          tabId: details.tabId,
          source: 'global-monitor',
          error: details.error
        });
      }
    };

    // Setup listeners with proper type casting
    if (chrome.webRequest) {
      chrome.webRequest.onBeforeRequest.addListener(
        onBeforeRequest,
        { urls: ["<all_urls>"] }
      );
      
      chrome.webRequest.onCompleted.addListener(
        onCompleted as any, // Type cast to handle Chrome API inconsistencies
        { urls: ["<all_urls>"] }
      );

      chrome.webRequest.onErrorOccurred.addListener(
        onErrorOccurred as any,
        { urls: ["<all_urls>"] }
      );
      
      console.log('✅ Global webRequest listeners active (with error handling)');
      this.isSetup = true;
    } else {
      console.error('❌ chrome.webRequest API not available');
    }
  }

    private static parseResponseHeaders(headers?: chrome.webRequest.HttpHeader[]): Record<string, string> {
    const result: Record<string, string> = {};
    
    if (headers && Array.isArray(headers)) {
      headers.forEach(header => {
        if (header.name && header.value) {
          result[header.name.toLowerCase()] = header.value;
        }
      });
    }
    
    return result;
  }

  static getCaptured() {
    return this.capturedRequests;
  }

  static clearCaptured() {
    this.capturedRequests = [];
    console.log('🗑️ Cleared captured requests');
  }

  static analyzeCaptures(tabId?: number) {
    const filtered = tabId 
      ? this.capturedRequests.filter(req => req.tabId === tabId)
      : this.capturedRequests;
    
    console.log(`📊 Analysis for ${tabId ? `tab ${tabId}` : 'all tabs'}:`);
    console.log(`📊 Total captures: ${filtered.length}`);
    
    const requests = filtered.filter(item => item.type === 'request');
    const responses = filtered.filter(item => item.type === 'response');
    
    console.log(`📊 Requests: ${requests.length}`);
    console.log(`📊 Responses: ${responses.length}`);
    
    // Show unique URLs
    const urls = [...new Set(filtered.map(item => item.url))];
    console.log(`📊 Unique URLs (${urls.length}):`);
    urls.forEach(url => console.log(`  - ${url}`));
    
    return { filtered, requests, responses, urls };
  }
}

// ===== MAIN BACKGROUND SCHEDULER =====
export class BackgroundScheduler {
  private static processingQueue: Set<string> = new Set();
  private static isRunning = false;
  private static backgroundTabs: Map<string, number> = new Map();
  private static activeSchedules: Set<string> = new Set();

  // ===== INITIALIZATION =====
  static async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🚀 Background scheduler started');
    
    // Setup global monitoring first
    GlobalWebRequestMonitor.setup();
    
    // Setup Chrome alarm for checking schedules
    await chrome.alarms.clear('scheduler-check');
    await chrome.alarms.create('scheduler-check', {
      periodInMinutes: 0.5 // Check every 30 seconds for better precision
    });

    // Immediate check
    this.checkAndExecuteSchedules();
  }

  static async stop(): Promise<void> {
    this.isRunning = false;
    await chrome.alarms.clear('scheduler-check');
    console.log('🛑 Background scheduler stopped');
  }

  // ===== SCHEDULE EXECUTION =====
  static async checkAndExecuteSchedules(): Promise<void> {
    if (!this.isRunning) return;

    console.log(`🔍 Checking schedules at: ${new Date().toISOString()}`);
    
    try {
      const activeSchedules = await ScheduleRepository.getActiveSchedules();
      console.log(`📋 Found ${activeSchedules.length} active schedules`);
      
      const dueSchedules = activeSchedules.filter(schedule => {
        const isDue = SchedulerEngine.isScheduleDue(schedule);
        const notInQueue = !this.processingQueue.has(schedule.id);
        
        if (isDue) {
          console.log(`⏰ Schedule due: ${schedule.name} (ID: ${schedule.id})`);
        }
        
        return isDue && notInQueue;
      });

      console.log(`🎯 ${dueSchedules.length} schedules ready to execute`);

      for (const schedule of dueSchedules) {
        console.log(`🚀 Starting execution for: ${schedule.name}`);
        this.executeSchedule(schedule); // Don't await - run in parallel
      }
      
    } catch (error) {
      console.error('❌ Error checking schedules:', error);
    }
  }

  private static async executeSchedule(schedule: Schedule): Promise<void> {
    if (this.processingQueue.has(schedule.id)) {
      console.log(`⚠️ Schedule ${schedule.id} already in processing queue`);
      return;
    }

    this.processingQueue.add(schedule.id);
    this.activeSchedules.add(schedule.id);
    const startTime = new Date();
    
    console.log(`🚀 Starting execution of schedule: ${schedule.name} (${schedule.id})`);
    
    const history = await HistoryRepository.create({
      linkId: schedule.linkId,
      scheduleId: schedule.id,
      startTime,
      success: false,
      logs: [`Started execution at ${startTime.toISOString()}`]
    });

    try {
      const link = await LinkRepository.getById(schedule.linkId);
      if (!link) {
        throw new Error(`Link not found: ${schedule.linkId}`);
      }

      await this.updateProcessingState({
        isProcessing: true,
        currentLinkId: link.id,
        currentScheduleId: schedule.id,
        startTime,
        logs: [`Processing link: ${link.name} (${link.url})`]
      });

      // Execute business logic with background tabs
      const result = await this.executeBusinessLogic(link, schedule);
      
      await HistoryRepository.updateExecution(history.id, {
        endTime: new Date(),
        success: true,
        logs: [...result.logs, `Completed successfully at ${new Date().toISOString()}`],
        executionData: result.data
      });

      // Update schedule for next run
      if (schedule.type !== 'once') {
        const nextRun = SchedulerEngine.calculateNextRun(schedule);
        await ScheduleRepository.updateNextRun(schedule.id, nextRun);
        console.log(`📅 Next run scheduled for: ${nextRun.toISOString()}`);
      } else {
        await ScheduleRepository.update(schedule.id, { enabled: false });
        console.log(`🔄 One-time schedule disabled: ${schedule.name}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Schedule execution failed: ${schedule.name}`, error);
      
      await HistoryRepository.updateExecution(history.id, {
        endTime: new Date(),
        success: false,
        errorMessage,
        logs: [`Error: ${errorMessage}`, `Failed at ${new Date().toISOString()}`]
      });
    } finally {
      this.processingQueue.delete(schedule.id);
      this.activeSchedules.delete(schedule.id);
      await this.updateProcessingState({
        isProcessing: false,
        logs: [`Execution completed for: ${schedule.name}`]
      });
      console.log(`✅ Execution completed for schedule: ${schedule.name}`);
    }
  }

  // ===== BUSINESS LOGIC EXECUTION =====
  private static async executeBusinessLogic(
    link: Link, 
    schedule: Schedule
  ): Promise<{ logs: string[]; data: any }> {
    const logs: string[] = [];
    const quantity = schedule.quantity || 1;
    
    logs.push(`🚀 Starting background tab execution for ${quantity} items`);
    logs.push(`📍 Target URL: ${link.url}`);
    logs.push(`📊 Tracking requests matching: ${TRACKING_STOCK_LINK || 'API patterns'}`);
    logs.push(`ℹ️ Tabs will remain open for manual inspection`);
    
    try {
      const results = [];
      
      // Clear previous captures for clean tracking
      GlobalWebRequestMonitor.clearCaptured();
      
      if (quantity === 1) {
        logs.push(`🔄 Processing single item`);
        const tabResult = await this.createBackgroundTabWithTracking(link, schedule);
        results.push(tabResult);
        logs.push(`✅ Item processed: ${tabResult.success ? 'Success' : 'Failed'}`);
        if (tabResult.tabId) {
          logs.push(`🔗 Tab ID ${tabResult.tabId} available for inspection`);
        }
      } else {
        // Batch processing
        const batchSize = Math.min(quantity, HIDDEN_TAB_SETTINGS.MAX_CONCURRENT_TABS || 3);
        logs.push(`🔄 Processing ${quantity} items in batches of ${batchSize}`);
        
        for (let i = 0; i < quantity; i += batchSize) {
          const batchEnd = Math.min(i + batchSize, quantity);
          const batchPromises = [];
          
          for (let j = i; j < batchEnd; j++) {
            logs.push(`🔄 Starting item ${j + 1}/${quantity}`);
            batchPromises.push(
              this.createBackgroundTabWithTracking(link, schedule)
                .then(result => ({ index: j + 1, ...result }))
            );
          }
          
          const batchResults = await Promise.allSettled(batchPromises);
          
          batchResults.forEach((result, index) => {
            const itemNumber = i + index + 1;
            if (result.status === 'fulfilled') {
              results.push(result.value);
              logs.push(`✅ Item ${itemNumber}: ${result.value.success ? 'Success' : 'Failed'}`);
              if (result.value.tabId) {
                logs.push(`🔗 Tab ID ${result.value.tabId} for item ${itemNumber}`);
              }
            } else {
              results.push({ 
                index: itemNumber, 
                success: false, 
                error: result.reason?.message || 'Unknown error' 
              });
              logs.push(`❌ Item ${itemNumber} failed: ${result.reason?.message || 'Unknown error'}`);
            }
          });
          
          if (batchEnd < quantity) {
            logs.push(`⏳ Waiting before next batch...`);
            await this.delay(2000);
          }
        }
      }
      
      // Wait for all tracking data to be collected
      logs.push(`⏳ Waiting for all tracking data to be collected...`);
      await this.delay(5000);
      
      // Retrieve tracked requests/responses
      const trackedData = await this.getTrackedData(schedule.id);
      logs.push(`📋 Tracked ${trackedData.requests.length} requests and ${trackedData.responses.length} responses`);
      
      if (trackedData.requests.length > 0) {
        logs.push(`📥 Tracked request URLs: ${trackedData.requests.slice(0, 3).map(r => r.url).join(', ')}${trackedData.requests.length > 3 ? '...' : ''}`);
      }
      if (trackedData.responses.length > 0) {
        logs.push(`📤 Response statuses: ${trackedData.responses.slice(0, 5).map(r => r.status).join(', ')}`);
      }
      
      const successCount = results.filter(r => r.success).length;
      const openTabs = results.filter(r => r.tabId).map(r => r.tabId);
      
      logs.push(`🎯 Final result: ${successCount}/${quantity} items processed successfully`);
      logs.push(`🔗 ${openTabs.length} tabs remain open: [${openTabs.join(', ')}]`);
      logs.push(`💡 Manually close tabs when inspection is complete`);
      
      return {
        logs,
        data: {
          processed: quantity,
          successful: successCount,
          failed: quantity - successCount,
          trackedRequests: trackedData.requests,
          trackedResponses: trackedData.responses,
          openTabIds: openTabs,
          results: results,
          timestamp: new Date().toISOString(),
          summary: {
            totalItems: quantity,
            successRate: (successCount / quantity * 100).toFixed(1) + '%',
            avgResponseTime: this.calculateAverageResponseTime(trackedData.responses),
            openTabs: openTabs.length,
            errors: results.filter(r => !r.success).map(r => r.error).filter(Boolean)
          }
        }
      };
      
    } catch (error) {
      logs.push(`❌ Background tab execution failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      throw error;
    }
  }

  // ===== TAB MANAGEMENT =====
  private static async createBackgroundTabWithTracking(
    link: Link, 
    schedule: Schedule
  ): Promise<{ success: boolean; tabId?: number; error?: string; trackedData?: any }> {
    
    return new Promise(async (resolve) => {
      try {
        console.log(`🔄 Creating background tab for: ${link.url}`);
        
        // Create tab
        const tab = await chrome.tabs.create({
          url: link.url,
          active: false,
          pinned: false
        });

        if (!tab.id) {
          throw new Error('Failed to create tab');
        }

        const tabId = tab.id;
        this.backgroundTabs.set(schedule.id, tabId);
        console.log(`✅ Background tab created: ${tabId} with early monitoring`);

        // Setup content script injection with multiple attempts
        this.setupContentScriptInjection(tabId, link.id, schedule.id);

        // Setup completion handling
        const timeoutId = setTimeout(() => {
          console.log(`⏰ Tab ${tabId} processing timeout reached - keeping tab open`);
          resolve({ 
            success: false, 
            error: `Timeout: Processing exceeded ${HIDDEN_TAB_SETTINGS.PRELOAD_TIMEOUT || 60000}ms - tab kept open`,
            tabId 
          });
        }, HIDDEN_TAB_SETTINGS.PRELOAD_TIMEOUT || 60000);

        // Wait for processing completion
        setTimeout(async () => {
          const networkData = await this.collectNetworkData(tabId, schedule.id);
          console.log(`📊 Network data collected for tab ${tabId}:`, networkData);
          
          clearTimeout(timeoutId);
          
          console.log(`✅ Tab ${tabId} processing complete - leaving tab open for manual inspection`);

          resolve({ 
            success: true, 
            tabId,
            trackedData: networkData
          });
        }, 20000); // Wait 20 seconds for network activity

      } catch (error) {
        console.error('❌ Failed to create background tab:', error);
        resolve({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  private static async setupContentScriptInjection(tabId: number, linkId: string, scheduleId: string) {
    const inject = async (attempt: number, trigger: string) => {
      try {
        console.log(`🚀 Content injection attempt ${attempt} (${trigger}) for tab ${tabId}`);
        
        // Check if tab still exists
        await chrome.tabs.get(tabId);
        
        await this.injectRequestTrackerEarly(tabId, linkId, scheduleId);
        console.log(`✅ Content script injected successfully (attempt ${attempt})`);
        
      } catch (error) {
        console.log(`❌ Injection attempt ${attempt} failed: ${(error as any).message}`);
      }
    };

    // Multiple injection attempts
    inject(1, 'immediate');
    setTimeout(() => inject(2, '2s-delay'), 2000);
    setTimeout(() => inject(3, '5s-delay'), 5000);
    
    // Listen for tab events
    const tabListener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId) {
        if (changeInfo.status === 'loading') {
          inject(4, 'loading-event');
        }
        if (changeInfo.status === 'complete') {
          inject(5, 'complete-event');
        }
      }
    };
    
    chrome.tabs.onUpdated.addListener(tabListener);
    
    // Cleanup listener after 30 seconds
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(tabListener);
    }, 30000);
  }

  private static async injectRequestTrackerEarly(tabId: number, linkId: string, scheduleId: string): Promise<void> {
    try {
      console.log(`🚀 Injecting request tracker for tab ${tabId}...`);
      
      // Check tab status first
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url || tab.url.startsWith('chrome://')) {
        throw new Error(`Invalid tab URL: ${tab.url}`);
      }
      
      // Inject settings with enhanced debugging
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (trackingStockLink: string, linkId: string, scheduleId: string) => {
          console.log(`📋 Injecting tracker settings for tab...`);
          console.log(`📋 TRACKING_STOCK_LINK: "${trackingStockLink}"`);
          console.log(`📋 Page URL: ${window.location.href}`);
          console.log(`📋 Link ID: ${linkId}, Schedule ID: ${scheduleId}`);
          
          (window as any).EXTENSION_SETTINGS = {
            TRACKING_STOCK_LINK: trackingStockLink,
            DEBUG: true,
            TRACK_ALL_APIS: true,
            SCHEDULE_ID: scheduleId,
            LINK_ID: linkId,
            INJECTED_AT: Date.now()
          };
          
          console.log('✅ Tracker settings injected:', (window as any).EXTENSION_SETTINGS);
          return true;
        },
        args: [TRACKING_STOCK_LINK || '', linkId, scheduleId]
      });

      // Inject the tracker script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/content/request-tracker.js']
      });

      // Initialize tracking
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (linkId: string, scheduleId: string) => {
          console.log('🎯 Initializing request tracking...');
          
          const initTracker = () => {
            if ((window as any).RequestTracker) {
              window.postMessage({
                type: 'INIT_TRACKING',
                linkId,
                scheduleId
              }, '*');
              console.log('✅ Request tracker initialized');
              return true;
            }
            return false;
          };
          
          // Try immediately
          if (!initTracker()) {
            // Retry after delay
            setTimeout(() => {
              if (!initTracker()) {
                console.log('⚠️ RequestTracker not found, may need more time');
              }
            }, 1000);
          }
        },
        args: [linkId, scheduleId]
      });

      // Setup message listener
      this.setupTrackedDataListener(tabId, scheduleId);

      console.log(`✅ Request tracker injection completed for tab ${tabId}`);

    } catch (error) {
      console.error(`❌ Failed to inject request tracker for tab ${tabId}:`, error);
      throw error;
    }
  }

  private static async collectNetworkData(tabId: number, scheduleId: string): Promise<any> {
    console.log(`📊 Collecting network data for tab ${tabId}, schedule ${scheduleId}`);
    
    // Wait for all requests to complete
    await this.delay(3000);
    
    const trackedData = await this.getTrackedData(scheduleId);
    
    // Also get data from global monitor
    const globalCaptures = GlobalWebRequestMonitor.analyzeCaptures(tabId);
    
    console.log(`📊 Final tracked data: ${trackedData.requests.length} requests, ${trackedData.responses.length} responses`);
    console.log(`📊 Global captures: ${globalCaptures.requests.length} requests, ${globalCaptures.responses.length} responses`);
    
    return {
      requests: trackedData.requests,
      responses: trackedData.responses,
      globalCaptures: globalCaptures,
      summary: {
        totalRequests: trackedData.requests.length,
        totalResponses: trackedData.responses.length,
        globalRequests: globalCaptures.requests.length,
        globalResponses: globalCaptures.responses.length,
        collectedAt: new Date().toISOString()
      }
    };
  }

  // ===== URL TRACKING LOGIC =====
  static shouldTrackUrl(url: string): boolean {
    console.log(`🔍 Checking URL: ${url}`);
    
    if (!TRACKING_STOCK_LINK || TRACKING_STOCK_LINK.trim() === '') {
      console.log(`⚠️ TRACKING_STOCK_LINK is empty, using API pattern fallback`);
      // Fallback: track common API patterns
      const apiPatterns = ['api/', '/api', 'ajax', '.php', 'json', 'rest/', '/rest'];
      const isApi = apiPatterns.some(pattern => url.toLowerCase().includes(pattern.toLowerCase()));
      console.log(`🔍 API pattern match: ${isApi} for ${url}`);
      return isApi;
    }

    const strategies = {
      exact: url === TRACKING_STOCK_LINK,
      includes: url.includes(TRACKING_STOCK_LINK),
      caseInsensitive: url.toLowerCase().includes(TRACKING_STOCK_LINK.toLowerCase()),
      endsWithPattern: url.endsWith(TRACKING_STOCK_LINK),
      parameterMatch: url.split('?')[0].includes(TRACKING_STOCK_LINK), // Ignore URL params
    };

    console.log(`🔍 Tracking strategies for "${url}":`, strategies);
    
    const shouldTrack = Object.values(strategies).some(Boolean);
    console.log(`🎯 Final decision: ${shouldTrack ? 'TRACK' : 'NOT TRACK'}`);
    
    return shouldTrack;
  }

  // ===== MANUAL TAB MANAGEMENT =====
  static async closeScheduleTabs(scheduleId: string): Promise<void> {
    try {
      const tabId = this.backgroundTabs.get(scheduleId);
      if (tabId) {
        await chrome.tabs.remove(tabId);
        this.backgroundTabs.delete(scheduleId);
        console.log(`🗑️ Manually closed tab ${tabId} for schedule ${scheduleId}`);
      }
    } catch (error) {
      console.error('❌ Failed to close schedule tab:', error);
    }
  }

  static async closeAllBackgroundTabs(): Promise<void> {
    try {
      const tabIds = Array.from(this.backgroundTabs.values());
      if (tabIds.length > 0) {
        await chrome.tabs.remove(tabIds);
        this.backgroundTabs.clear();
        console.log(`🗑️ Manually closed ${tabIds.length} background tabs`);
      }
    } catch (error) {
      console.error('❌ Failed to close background tabs:', error);
    }
  }

  static getBackgroundTabs(): Array<{ scheduleId: string; tabId: number }> {
    return Array.from(this.backgroundTabs.entries()).map(([scheduleId, tabId]) => ({
      scheduleId,
      tabId
    }));
  }

  // ===== FORCE OPERATIONS =====
  static async forceExecuteSchedule(scheduleId: string): Promise<void> {
    try {
      const schedule = await ScheduleRepository.getById(scheduleId);
      if (!schedule) {
        throw new Error(`Schedule not found: ${scheduleId}`);
      }

      console.log(`🔧 Force executing schedule: ${schedule.name}`);
      await this.executeSchedule(schedule);
    } catch (error) {
      console.error('❌ Error force executing schedule:', error);
      throw error;
    }
  }

  static async checkScheduleNow(scheduleId: string): Promise<boolean> {
    try {
      const schedule = await ScheduleRepository.getById(scheduleId);
      if (!schedule) return false;

      const isDue = SchedulerEngine.isScheduleDue(schedule);
      console.log(`🕐 Schedule ${schedule.name} due status: ${isDue}`);
      
      if (isDue) {
        console.log(`⚡ Schedule is due now: ${schedule.name}`);
        const nextRun = schedule.nextRun ? new Date(schedule.nextRun) : null;
        const now = new Date();
        console.log(`📅 Next run: ${nextRun?.toISOString()}`);
        console.log(`📅 Current time: ${now.toISOString()}`);
        console.log(`⏱️ Time difference: ${nextRun ? (now.getTime() - nextRun.getTime()) / 1000 : 'N/A'} seconds`);
      }
      
      return isDue;
    } catch (error) {
      console.error('❌ Error checking schedule:', error);
      return false;
    }
  }

  // ===== DATA MANAGEMENT =====
  private static setupTrackedDataListener(tabId: number, scheduleId: string): void {
    const messageListener = (message: any, sender: chrome.runtime.MessageSender) => {
      if (sender.tab?.id === tabId) {
        if (message.type === 'SAVE_TRACKED_REQUEST') {
          this.saveTrackedRequest(message.data, scheduleId);
        } else if (message.type === 'SAVE_TRACKED_RESPONSE') {
          this.saveTrackedResponse(message.data, scheduleId);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Auto cleanup listener
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(messageListener);
    }, (HIDDEN_TAB_SETTINGS.PRELOAD_TIMEOUT || 60000) + 30000);
  }

  private static async saveTrackedRequest(request: any, scheduleId: string): Promise<void> {
    try {
      const storage = await chrome.storage.local.get(STORAGE_KEYS.TRACKED_REQUESTS);
      const requests = storage[STORAGE_KEYS.TRACKED_REQUESTS] || [];
      
      requests.push({
        ...request,
        scheduleId,
        savedAt: Date.now()
      });

      if (requests.length > 1000) {
        requests.splice(0, requests.length - 1000);
      }

      await chrome.storage.local.set({
        [STORAGE_KEYS.TRACKED_REQUESTS]: requests
      });

      console.log(`📥 Tracked request saved: ${request.id}`);
    } catch (error) {
      console.error('❌ Failed to save tracked request:', error);
    }
  }

  private static async saveTrackedResponse(response: any, scheduleId: string): Promise<void> {
    try {
      const storage = await chrome.storage.local.get(STORAGE_KEYS.TRACKED_RESPONSES);
      const responses = storage[STORAGE_KEYS.TRACKED_RESPONSES] || [];
      
      responses.push({
        ...response,
        scheduleId,
        savedAt: Date.now()
      });

      if (responses.length > 1000) {
        responses.splice(0, responses.length - 1000);
      }

      await chrome.storage.local.set({
        [STORAGE_KEYS.TRACKED_RESPONSES]: responses
      });

      console.log(`📥 Tracked response saved: ${response.id}`);
    } catch (error) {
      console.error('❌ Failed to save tracked response:', error);
    }
  }

  // ===== GLOBAL TRACKING STORAGE =====
  static async saveGlobalTrackedRequest(request: any): Promise<void> {
    try {
      const storage = await chrome.storage.local.get(STORAGE_KEYS.TRACKED_REQUESTS);
      const requests = storage[STORAGE_KEYS.TRACKED_REQUESTS] || [];
      
      // Add global tracking marker
      requests.push({
        ...request,
        scheduleId: 'global',
        savedAt: Date.now(),
        source: 'global-monitor'
      });

      if (requests.length > 1000) {
        requests.splice(0, requests.length - 1000);
      }

      await chrome.storage.local.set({
        [STORAGE_KEYS.TRACKED_REQUESTS]: requests
      });

      console.log(`📥 Global tracked request saved: ${request.id}`);
    } catch (error) {
      console.error('❌ Failed to save global tracked request:', error);
    }
  }

  static async saveGlobalTrackedResponse(response: any): Promise<void> {
    try {
      const storage = await chrome.storage.local.get(STORAGE_KEYS.TRACKED_RESPONSES);
      const responses = storage[STORAGE_KEYS.TRACKED_RESPONSES] || [];
      
      // Add global tracking marker
      responses.push({
        ...response,
        scheduleId: 'global',
        savedAt: Date.now(),
        source: 'global-monitor'
      });

      if (responses.length > 1000) {
        responses.splice(0, responses.length - 1000);
      }

      await chrome.storage.local.set({
        [STORAGE_KEYS.TRACKED_RESPONSES]: responses
      });

      console.log(`📥 Global tracked response saved: ${response.id}`);
    } catch (error) {
      console.error('❌ Failed to save global tracked response:', error);
    }
  }

  private static async getTrackedData(scheduleId: string): Promise<{
    requests: any[];
    responses: any[];
  }> {
    try {
      const storage = await chrome.storage.local.get([
        STORAGE_KEYS.TRACKED_REQUESTS,
        STORAGE_KEYS.TRACKED_RESPONSES
      ]);

      const allRequests = storage[STORAGE_KEYS.TRACKED_REQUESTS] || [];
      const allResponses = storage[STORAGE_KEYS.TRACKED_RESPONSES] || [];

      // Include both schedule-specific and global tracking
      const requests = allRequests.filter((req: any) => 
        req.scheduleId === scheduleId || req.scheduleId === 'global'
      );
      const responses = allResponses.filter((res: any) => 
        res.scheduleId === scheduleId || res.scheduleId === 'global'
      );

      return { requests, responses };
    } catch (error) {
      console.error('❌ Failed to get tracked data:', error);
      return { requests: [], responses: [] };
    }
  }

  // ===== UTILITY METHODS =====
  private static calculateAverageResponseTime(responses: any[]): number {
    if (responses.length === 0) return 0;
    
    const totalTime = responses.reduce((sum, res) => sum + (res.responseTime || 0), 0);
    return Math.round(totalTime / responses.length);
  }

  static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private static async updateProcessingState(state: any): Promise<void> {
    await chrome.storage.local.set({ processingState: state });
    
    // Broadcast to all extension pages
    chrome.runtime.sendMessage({
      type: 'PROCESSING_STATE_UPDATE',
      data: state
    }).catch(() => {
      // Ignore errors if no listeners
    });
  }

  static async getProcessingState(): Promise<any> {
    const result = await chrome.storage.local.get('processingState');
    return result.processingState || {
      isProcessing: false,
      logs: []
    };
  }
}


// ===== DEBUGGING UTILITIES =====
export class SchedulerDebugger {
  static async testScheduleExecution(scheduleId: string) {
    console.log(`🧪 Testing schedule: ${scheduleId}`);
    
    const result = await chrome.runtime.sendMessage({
      type: 'CHECK_SCHEDULE_NOW',
      scheduleId
    });
    
    console.log(`📊 Schedule due check result:`, result);
    
    if (result.isDue) {
      console.log(`✅ Schedule is due, forcing execution...`);
      const execResult = await chrome.runtime.sendMessage({
        type: 'FORCE_EXECUTE_SCHEDULE',
        scheduleId
      });
      console.log(`🎯 Execution result:`, execResult);
    } else {
      console.log(`⏳ Schedule is not due yet`);
    }
  }

  static async forceScheduleCheck() {
    console.log(`🔄 Forcing schedule check...`);
    const result = await chrome.runtime.sendMessage({
      type: 'FORCE_SCHEDULE_CHECK'
    });
    console.log(`📊 Force check result:`, result);
  }

  static checkConfiguration() {
    console.log('🔧 =================================');
    console.log('🔧 SCHEDULER CONFIGURATION CHECK');
    console.log('🔧 =================================');
    console.log(`🔧 TRACKING_STOCK_LINK: "${TRACKING_STOCK_LINK}"`);
    console.log(`🔧 Type: ${typeof TRACKING_STOCK_LINK}`);
    console.log(`🔧 Length: ${TRACKING_STOCK_LINK?.length || 0}`);
    console.log(`🔧 Is empty: ${!TRACKING_STOCK_LINK || TRACKING_STOCK_LINK.trim() === ''}`);
    console.log('🔧 =================================');
  }

  static analyzeGlobalCaptures(tabId?: number) {
    return GlobalWebRequestMonitor.analyzeCaptures(tabId);
  }

  static clearGlobalCaptures() {
    GlobalWebRequestMonitor.clearCaptured();
  }
}

// Make debugging utilities available globally
if (typeof window !== 'undefined') {
  (window as any).SchedulerDebugger = SchedulerDebugger;
  (window as any).GlobalWebRequestMonitor = GlobalWebRequestMonitor;
  (window as any).BackgroundScheduler = BackgroundScheduler;
}

// Auto-setup global monitoring when this module loads
GlobalWebRequestMonitor.setup();