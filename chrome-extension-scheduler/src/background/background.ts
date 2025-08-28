// src/background/background.ts - Fixed Version
import { ScheduleRepository, LinkRepository, HistoryRepository } from '../storage/repositories';
import { Logger } from '../utils/logger';
import { SchedulerEngine } from '../utils/scheduler-engine';
import { Schedule, Link } from '../types';
import { TRACKING_STOCK_LINK, ALTERNATIVE_TRACKING_PATTERNS, TAB_CLOSE_TIMEOUT_MS } from '../utils/default-system-settings';

interface ActiveTab {
  tabId: number;
  linkId: string;
  linkName: string;
  scheduleId: string;
  startTime: Date;
  historyId: string;
  url: string;
  trackedRequests: any[];
}

class BackgroundManager {
  private isRunning = false;
  private checkInterval: number | null = null;
  private activeTabs: Map<number, ActiveTab> = new Map();
  
  constructor() {
    this.init();
  }

  private async init() {
    console.log('🚀 Background Manager initializing...');
    
    await Logger.loadStoredLogs();
    Logger.info('Background script initialized', {
      trackingTarget: TRACKING_STOCK_LINK,
      alternativePatterns: ALTERNATIVE_TRACKING_PATTERNS
    }, 'BACKGROUND');
    
    this.setupMessageListener();
    this.setupAlarmListener();
    this.setupTabListener();
    
    // ❌ REMOVED: Manual content script injection
    // CRXJS handles content script injection automatically via manifest
    
    this.startScheduler();
    this.setupDebugLogging();
    
    console.log('✅ Background Manager initialized successfully');
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('📨 Background received:', message.type, {
        senderTabId: sender.tab?.id,
        senderUrl: sender.tab?.url?.substring(0, 100)
      });
      
      this.handleMessage(message, sender, sendResponse);
      return true;
    });
  }

  private setupAlarmListener() {
    chrome.alarms.onAlarm.addListener((alarm) => {
      console.log('⏰ Alarm triggered:', alarm.name);
      this.handleAlarm(alarm);
    });
  }

  private setupTabListener() {
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
      this.handleTabRemoved(tabId, removeInfo);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (this.activeTabs.has(tabId)) {
        console.log(`📱 Active tab ${tabId} updated:`, {
          status: changeInfo.status,
          url: tab.url?.substring(0, 100)
        });
        
        if (changeInfo.status === 'complete') {
          Logger.info('Tab loading completed', { 
            tabId, 
            url: tab.url 
          }, `TAB_${tabId}`);
        }
      }
    });
  }

  private setupDebugLogging() {
    setInterval(() => {
      if (this.isRunning) {
        const activeTabsInfo = Array.from(this.activeTabs.values()).map(tab => ({
          tabId: tab.tabId,
          linkName: tab.linkName,
          trackedCount: tab.trackedRequests.length,
          uptime: Math.round((Date.now() - tab.startTime.getTime()) / 1000) + 's'
        }));

        Logger.info('Scheduler heartbeat', {
          isRunning: this.isRunning,
          activeTabsCount: this.activeTabs.size,
          activeTabs: activeTabsInfo,
          trackingTarget: TRACKING_STOCK_LINK
        }, 'SCHEDULER');
      }
    }, 30000);
  }

  private async handleMessage(message: any, sender: any, sendResponse: any) {
    try {
      switch (message.type) {
        case 'START_SCHEDULER':
          this.startScheduler();
          sendResponse({ success: true, isRunning: this.isRunning });
          break;

        case 'STOP_SCHEDULER':
          this.stopScheduler();
          sendResponse({ success: true, isRunning: this.isRunning });
          break;

        case 'GET_SCHEDULER_STATUS':
          const status = { isRunning: this.isRunning };
          sendResponse(status);
          this.notifyDashboard('SCHEDULER_STATUS', status);
          break;

        case 'GET_ACTIVE_TABS':
          const tabs = Array.from(this.activeTabs.values()).map(tab => ({
            id: tab.tabId.toString(),
            linkName: tab.linkName,
            url: tab.url,
            startTime: tab.startTime.toISOString(),
            status: 'active',
            requestCount: tab.trackedRequests.length
          }));
          sendResponse({ tabs });
          break;

        case 'API_REQUEST_TRACKED':
          console.log('📥 API_REQUEST_TRACKED from content script:', {
            tabId: message.data?.tabId,
            url: message.data?.url?.substring(0, 100),
            hasResponse: !!message.data?.response,
            hasModels: !!message.data?.response?.modelsJson
          });
          await this.handleApiTracked(message.data);
          sendResponse({ success: true });
          break;

        case 'GET_CURRENT_TAB_ID':
          const tabId = sender.tab?.id || 0;
          sendResponse({ tabId });
          break;

        case 'CONTENT_SCRIPT_READY':
          await this.handleContentScriptReady(message.data, sender);
          sendResponse({ success: true });
          break;

        default:
          console.warn('❓ Unknown message type:', message.type);
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ Error handling message:', errorMsg);
      Logger.error('Message handling error', error, 'BACKGROUND');
      sendResponse({ error: errorMsg });
    }
  }

  private async handleAlarm(alarm: chrome.alarms.Alarm) {
    if (alarm.name.startsWith('schedule_')) {
      const scheduleId = alarm.name.replace('schedule_', '');
      await this.executeSchedule(scheduleId);
    }
  }

  private startScheduler() {
    if (this.isRunning) {
      console.log('⚠️ Scheduler already running');
      return;
    }
    
    this.isRunning = true;
    Logger.info('Scheduler started', {}, 'SCHEDULER');
    
    this.notifyDashboard('SCHEDULER_STATUS', { isRunning: true });
    
    this.checkInterval = setInterval(() => {
      this.checkDueSchedules();
    }, 60000) as any;

    this.checkDueSchedules();
  }

  private stopScheduler() {
    this.isRunning = false;
    Logger.info('Scheduler stopped', {}, 'SCHEDULER');
    
    this.notifyDashboard('SCHEDULER_STATUS', { isRunning: false });
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    chrome.alarms.clearAll();
    this.closeAllActiveTabs();
  }

  private async closeAllActiveTabs() {
    const promises = Array.from(this.activeTabs.keys()).map(async (tabId) => {
      try {
        await chrome.tabs.remove(tabId);
        console.log(`✅ Closed tab ${tabId}`);
      } catch (error) {
        console.warn(`⚠️ Could not close tab ${tabId}:`, error);
      }
    });
    
    await Promise.allSettled(promises);
    this.activeTabs.clear();
  }

  private async checkDueSchedules() {
    if (!this.isRunning) return;

    try {
      const activeSchedules = await ScheduleRepository.getActiveSchedules();
      const now = new Date();

      for (const schedule of activeSchedules) {
        if (schedule.nextRun <= now) {
          console.log(`⏰ Schedule due: ${schedule.name}`);
          await this.executeSchedule(schedule.id);
        }
      }
    } catch (error) {
      Logger.error('Error checking due schedules', error, 'SCHEDULER');
    }
  }

  private async executeSchedule(scheduleId: string) {
    try {
      const schedule = await ScheduleRepository.getById(scheduleId);
      if (!schedule?.enabled) return;

      const link = await LinkRepository.getById(schedule.linkId);
      if (!link?.enabled) return;

      Logger.info(`Executing schedule: ${schedule.name}`, {
        scheduleId,
        linkId: link.id,
        linkName: link.name,
        quantity: schedule.quantity
      }, 'EXECUTION');

      const historyData = await HistoryRepository.create({
        linkId: link.id,
        scheduleId: schedule.id,
        startTime: new Date(),
        success: false,
        logs: [`Started execution for ${link.name}`]
      });

      // Open tabs based on quantity
      const tabPromises = [];
      for (let i = 0; i < schedule.quantity; i++) {
        tabPromises.push(this.openTrackedTab(link, schedule, historyData.id, i));
      }
      
      await Promise.allSettled(tabPromises);

      // Update next run time
      if (schedule.type !== 'once') {
        const nextRun = SchedulerEngine.calculateNextRun(schedule);
        await ScheduleRepository.updateNextRun(schedule.id, nextRun);
        Logger.info('Schedule next run updated', {
          scheduleId: schedule.id,
          nextRun: nextRun.toISOString()
        }, 'SCHEDULER');
      } else {
        await ScheduleRepository.update(schedule.id, { enabled: false });
        Logger.info('One-time schedule disabled', { scheduleId }, 'SCHEDULER');
      }

    } catch (error) {
      Logger.error('Error executing schedule', error, 'SCHEDULER');
    }
  }

  private async openTrackedTab(link: Link, schedule: Schedule, historyId: string, index: number): Promise<void> {
    try {
      Logger.info(`Opening tab ${index + 1}/${schedule.quantity} for ${link.name}`, {
        url: link.url
      }, 'TAB_OPENING');

      const tab = await chrome.tabs.create({
        url: link.url,
        active: false
      });

      if (!tab.id) throw new Error('Failed to create tab');

      const activeTab: ActiveTab = {
        tabId: tab.id,
        linkId: link.id,
        linkName: link.name,
        scheduleId: schedule.id,
        startTime: new Date(),
        historyId,
        url: link.url,
        trackedRequests: []
      };

      this.activeTabs.set(tab.id, activeTab);

      Logger.info(`Tab opened successfully`, {
        tabId: tab.id,
        linkName: link.name,
        url: link.url
      }, `TAB_${tab.id}`);

      this.notifyDashboard('TAB_OPENED', {
        tabId: tab.id.toString(),
        linkName: link.name,
        url: link.url,
        startTime: activeTab.startTime.toISOString()
      });

      // ✅ REMOVED: Manual content script injection
      // CRXJS automatically injects content script via manifest.json
      
      setTimeout(() => {
        this.closeTab(tab.id!);
      }, TAB_CLOSE_TIMEOUT_MS);

    } catch (error) {
      Logger.error('Error opening tracked tab', error, 'TAB');
    }
  }

  private async closeTab(tabId: number) {
    const activeTab = this.activeTabs.get(tabId);
    if (!activeTab) return;

    try {
      await chrome.tabs.get(tabId);
      await chrome.tabs.remove(tabId);
      
      const duration = Date.now() - activeTab.startTime.getTime();
      
      await HistoryRepository.updateExecution(activeTab.historyId, {
        endTime: new Date(),
        success: activeTab.trackedRequests.length > 0,
        logs: [
          `Tab closed after ${Math.round(duration / 1000)}s`,
          `Total API calls tracked: ${activeTab.trackedRequests.length}`
        ],
        executionData: {
          trackedRequests: activeTab.trackedRequests,
          duration: Math.round(duration / 1000)
        }
      });

      Logger.info('Tab closed successfully', {
        tabId,
        duration: Math.round(duration / 1000) + 's',
        trackedRequestsCount: activeTab.trackedRequests.length
      }, `TAB_${tabId}`);

      this.notifyDashboard('TAB_CLOSED', { tabId: tabId.toString() });

    } catch (error) {
      Logger.warning('Tab may have been closed manually', { 
        tabId, 
        error: error instanceof Error ? error.message : String(error)
      }, `TAB_${tabId}`);
    } finally {
      this.activeTabs.delete(tabId);
    }
  }

  private handleTabRemoved(tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) {
    const activeTab = this.activeTabs.get(tabId);
    if (!activeTab) return;

    Logger.info('Tab removed externally', {
      tabId,
      byWindowClosing: removeInfo.isWindowClosing,
      trackedRequests: activeTab.trackedRequests.length
    }, `TAB_${tabId}`);

    const duration = Date.now() - activeTab.startTime.getTime();
    HistoryRepository.updateExecution(activeTab.historyId, {
      endTime: new Date(),
      success: activeTab.trackedRequests.length > 0,
      logs: [`Tab closed externally after ${Math.round(duration / 1000)}s`],
      executionData: {
        trackedRequests: activeTab.trackedRequests
      }
    }).catch(error => {
      Logger.error('Error updating history for closed tab', error, `TAB_${tabId}`);
    });

    this.activeTabs.delete(tabId);
    this.notifyDashboard('TAB_CLOSED', { tabId: tabId.toString() });
  }

  private async handleApiTracked(data: any) {
    try {
      const { tabId, url, response, captureSource } = data;
      
      const activeTab = this.activeTabs.get(tabId);
      if (!activeTab) {
        console.warn('⚠️ Received API tracking for unknown tab:', tabId);
        return;
      }

      if (!this.shouldTrackUrl(url)) {
        console.warn('⚠️ Received tracking for non-target URL:', url);
        return;
      }

      const hasModels = !!(response?.modelsJson);
      const modelsCount = Array.isArray(response?.modelsJson) ? response.modelsJson.length : 0;

      Logger.info('✅ API tracked successfully', {
        tabId,
        url: url.substring(0, 100) + '...',
        method: data.method,
        status: response?.status,
        hasModels,
        modelsCount,
        captureSource
      }, `TAB_${tabId}`);

      activeTab.trackedRequests.push({
        url,
        method: data.method,
        timestamp: data.timestamp,
        captureSource,
        request: {
          headers: data.headers,
          body: data.body
        },
        response: {
          status: response?.status,
          statusText: response?.statusText,
          headers: response?.headers,
          body: response?.body,
          modelsJson: response?.modelsJson
        }
      });

      this.notifyDashboard('API_TRACKED', {
        tabId: tabId.toString(),
        url,
        method: data.method,
        status: response?.status,
        hasModels,
        modelsCount,
        captureSource,
        totalTracked: activeTab.trackedRequests.length
      });

      if (hasModels) {
        Logger.info('🎯 MODELS DATA CAPTURED', {
          tabId,
          modelsCount,
          sampleModel: Array.isArray(response.modelsJson) ? response.modelsJson[0] : response.modelsJson
        }, `TAB_${tabId}`);
      }

    } catch (error) {
      Logger.error('Error handling tracked API', error, 'BACKGROUND');
    }
  }

  private async handleContentScriptReady(data: any, sender: any) {
    const tabId = sender.tab?.id;
    if (!tabId || !this.activeTabs.has(tabId)) return;

    Logger.info('Content script ready for API tracking', {
      tabId,
      url: data.url,
      patterns: data.trackingPatterns?.length || 0
    }, `TAB_${tabId}`);

    this.notifyDashboard('TAB_UPDATED', {
      tabId: tabId.toString(),
      status: 'ready'
    });
  }

  private shouldTrackUrl(url: string): boolean {
    try {
      if (url.includes(TRACKING_STOCK_LINK)) return true;
      return ALTERNATIVE_TRACKING_PATTERNS.some(pattern => url.includes(pattern));
    } catch (error) {
      console.error('Error in shouldTrackUrl:', error);
      return false;
    }
  }

  private notifyDashboard(type: string, data: any) {
    try {
      chrome.runtime.sendMessage({
        type,
        data
      }).catch(error => {
        if (!error.message?.includes('receiving end does not exist')) {
          console.warn('Dashboard notification failed:', error.message);
        }
      });
    } catch (error) {
      // Ignore messaging errors when dashboard is not open
    }
  }
}

console.log('🚀 Background script starting...');
new BackgroundManager();
console.log('✅ Background script initialized');