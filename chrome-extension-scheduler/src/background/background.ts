// src/background/background.ts - Simplified Background Script

import { ScheduleRepository, LinkRepository, HistoryRepository } from '../storage/repositories';
import { Logger } from '../utils/logger';
import { SchedulerEngine } from '../utils/scheduler-engine';
import { Schedule, Link } from '../types';
import { TRACKING_STOCK_LINK, TAB_CLOSE_TIMEOUT_MS } from '../utils/default-system-settings';

interface ActiveTab {
  tabId: number;
  linkId: string;
  linkName: string;
  scheduleId: string;
  startTime: Date;
  historyId: string;
  url: string;
  status: 'loading' | 'injecting' | 'ready' | 'tracking' | 'error' | 'completed';
  trackedCount: number;
  lastHeartbeat?: Date;
  closeTimer?: number;
}

class BackgroundManager {
  private isRunning = false;
  private activeTabs = new Map<number, ActiveTab>();
  
  constructor() {
    this.init();
  }

  private async init() {
    console.log('Background Manager initializing...');
    
    // Load stored logs
    await Logger.loadStoredLogs();
    
    // Setup event listeners
    this.setupMessageListener();
    this.setupAlarmListener(); 
    this.setupTabListener();
    
    // Auto-start scheduler
    this.startScheduler();
    
    console.log('Background Manager initialized');
    Logger.info('Background Manager started', {}, 'BACKGROUND');
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        this.handleMessage(message, sender, sendResponse);
      } catch (error) {
        console.error('Message handler error:', error);
        sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
      return true; // Keep channel open for async responses
    });
  }

  private async handleMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
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
        sendResponse({ isRunning: this.isRunning });
        break;

      case 'GET_ACTIVE_TABS':
        const tabs = Array.from(this.activeTabs.values()).map(tab => ({
          id: tab.tabId.toString(),
          linkName: tab.linkName,
          url: tab.url,
          startTime: tab.startTime.toISOString(),
          status: tab.status,
          requestCount: tab.trackedCount
        }));
        sendResponse({ tabs });
        break;

      case 'CONTENT_SCRIPT_HEARTBEAT':
        this.handleHeartbeat(message.data, sender);
        sendResponse({ success: true });
        break;

      case 'GET_TRACKED_DATA':
        try {
          const data = await this.getTrackedDataForSchedule(message.scheduleId);
          sendResponse({ data });
        } catch (error) {
          sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
        }
        break;

      case 'GET_CURRENT_TAB_ID':
        sendResponse({ tabId: sender.tab?.id || 0 });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  }

  private setupAlarmListener() {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'scheduler-check') {
        this.checkDueSchedules();
      }
    });
  }

  private setupTabListener() {
    // Handle tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.handleTabRemoved(tabId);
    });

    // Handle tab updates
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      const activeTab = this.activeTabs.get(tabId);
      if (!activeTab) return;

      // If page completed loading, inject scripts
      if (changeInfo.status === 'complete' && tab.url) {
        await this.injectScripts(tabId);
      }
    });
  }

  private startScheduler() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    Logger.info('Scheduler started', {}, 'SCHEDULER');
    
    // Check for due schedules every 30 seconds
    chrome.alarms.create('scheduler-check', { periodInMinutes: 0.5 });
    
    // Run initial check
    this.checkDueSchedules();
  }

  private stopScheduler() {
    this.isRunning = false;
    Logger.info('Scheduler stopped', {}, 'SCHEDULER');
    
    chrome.alarms.clear('scheduler-check');
    this.closeAllActiveTabs();
  }

  private async checkDueSchedules() {
    if (!this.isRunning) return;

    try {
      const activeSchedules = await ScheduleRepository.getActiveSchedules();
      const now = new Date();

      for (const schedule of activeSchedules) {
        if (schedule.nextRun <= now) {
          await this.executeSchedule(schedule);
        }
      }
    } catch (error) {
      Logger.error('Error checking due schedules', error, 'SCHEDULER');
    }
  }

  private async executeSchedule(schedule: Schedule) {
    try {
      const link = await LinkRepository.getById(schedule.linkId);
      if (!link?.enabled) {
        Logger.warning('Link not found or disabled', { scheduleId: schedule.id }, 'SCHEDULER');
        return;
      }

      Logger.info(`Executing schedule: ${schedule.name}`, {
        scheduleId: schedule.id,
        linkName: link.name,
        quantity: schedule.quantity
      }, 'EXECUTION');

      // Create execution history
      const historyData = await HistoryRepository.create({
        linkId: link.id,
        scheduleId: schedule.id,
        startTime: new Date(),
        success: false,
        logs: [`Started execution for ${link.name}`]
      });

      // Open tabs for this schedule
      for (let i = 0; i < schedule.quantity; i++) {
        await this.openTrackedTab(link, schedule, historyData.id);
        
        // Small delay between tab openings to avoid overwhelming
        if (i < schedule.quantity - 1) {
          await this.delay(1000);
        }
      }

      // Update next run time
      await this.updateScheduleNextRun(schedule);

    } catch (error) {
      Logger.error('Error executing schedule', error, 'EXECUTION');
    }
  }

  private async openTrackedTab(link: Link, schedule: Schedule, historyId: string) {
    try {
      // Create new tab
      const tab = await chrome.tabs.create({
        url: link.url,
        active: false  // Keep tabs in background
      });

      if (!tab.id) throw new Error('Failed to create tab');

      // Track this tab
      const activeTab: ActiveTab = {
        tabId: tab.id,
        linkId: link.id,
        linkName: link.name,
        scheduleId: schedule.id,
        startTime: new Date(),
        historyId,
        url: link.url,
        status: 'loading',
        trackedCount: 0
      };

      this.activeTabs.set(tab.id, activeTab);

      // Schedule tab closure
      activeTab.closeTimer = setTimeout(() => {
        this.closeTab(tab.id!);
      }, TAB_CLOSE_TIMEOUT_MS) as any;

      Logger.info('Tab opened for tracking', {
        tabId: tab.id,
        linkName: link.name,
        url: link.url
      }, `TAB_${tab.id}`);

      // Notify dashboard
      this.notifyDashboard('TAB_OPENED', {
        tabId: tab.id,
        linkName: link.name,
        url: link.url,
        startTime: activeTab.startTime.toISOString()
      });

    } catch (error) {
      Logger.error('Error opening tracked tab', error, 'TAB');
    }
  }

  private async injectScripts(tabId: number) {
    const activeTab = this.activeTabs.get(tabId);
    if (!activeTab || activeTab.status !== 'loading') return;

    try {
      activeTab.status = 'injecting';
      
      // Step 1: Inject extension settings
      await this.injectSettings(tabId, activeTab);
      
      // Step 2: Inject main world interceptor
      await this.injectMainWorldScript(tabId);
      
      activeTab.status = 'ready';
      
      Logger.info('Scripts injected successfully', {
        tabId,
        linkName: activeTab.linkName
      }, `TAB_${tabId}`);

      // Notify dashboard
      this.notifyDashboard('TAB_UPDATED', {
        tabId,
        status: 'ready'
      });

    } catch (error) {
      activeTab.status = 'error';
      Logger.error('Script injection failed', {
        tabId,
        error: error instanceof Error ? error.message : String(error)
      }, `TAB_${tabId}`);

      // Notify dashboard
      this.notifyDashboard('TAB_UPDATED', {
        tabId,
        status: 'error'
      });
    }
  }

  // background.ts - inject settings 2 times
  private async injectSettings(tabId: number, activeTab: ActiveTab) {
    const settingsData = {
      TRACKING_STOCK_LINK,
      scheduleId: activeTab.scheduleId,
      tabId,
      DEBUG: true,
      injectedAt: Date.now()
    };

    const injectFunc = (data: any) => {
      (window as any).EXTENSION_SETTINGS = data;
      console.log('Extension settings injected:', data);
    };

    // Inject into ISOLATED world (for request-tracker)
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: injectFunc,
      args: [settingsData]
    });

    // Inject into MAIN world (for main-world-interceptor)  
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: injectFunc,
      args: [settingsData]
    });
  }

  private async injectMainWorldScript(tabId: number) {
    try {
      // Get the main world script URL
      //const scriptUrl = chrome.runtime.getURL('content-scripts/main-world-interceptor.js');
      
      // Inject into main world
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-scripts/main-world-interceptor.js'],
        world: 'MAIN'
      });

      Logger.info('Main world script injected', { tabId }, `TAB_${tabId}`);
    } catch (error) {
      Logger.error('Main world script injection failed', {
        tabId,
        error: error instanceof Error ? error.message : String(error)
      }, `TAB_${tabId}`);
      throw error;
    }
  }

  private handleHeartbeat(data: any, sender: chrome.runtime.MessageSender) {
    const tabId = sender.tab?.id;
    if (!tabId) return;

    const activeTab = this.activeTabs.get(tabId);
    if (!activeTab) return;

    // Update tab status
    activeTab.lastHeartbeat = new Date();
    activeTab.trackedCount = data.totalTracked || 0;

    if (activeTab.trackedCount > 0 && activeTab.status === 'ready') {
      activeTab.status = 'tracking';
    }

    Logger.info('Heartbeat received', {
      tabId,
      totalTracked: data.totalTracked,
      completedRequests: data.completedRequests,
      modelsFound: data.modelsFound
    }, `TAB_${tabId}`);

    // Notify dashboard
    this.notifyDashboard('TAB_UPDATED', {
      tabId,
      status: activeTab.status,
      requestCount: activeTab.trackedCount
    });
  }

  private async closeTab(tabId: number) {
    const activeTab = this.activeTabs.get(tabId);
    if (!activeTab) return;

    try {
      // Clear close timer
      if (activeTab.closeTimer) {
        clearTimeout(activeTab.closeTimer);
      }

      // Get tracked data
      const trackedData = await this.getTrackedDataForSchedule(activeTab.scheduleId);
      const duration = Date.now() - activeTab.startTime.getTime();
      
      // Update execution history
      await HistoryRepository.updateExecution(activeTab.historyId, {
        endTime: new Date(),
        success: trackedData.length > 0,
        logs: [
          `Tab closed after ${Math.round(duration / 1000)}s`,
          `Total requests tracked: ${trackedData.length}`,
          `Models found: ${trackedData.filter((r: any) => r.modelsData).length}`
        ],
        executionData: {
          trackedRequests: trackedData,
          duration: Math.round(duration / 1000),
          captureMethod: 'hybrid-content-script'
        }
      });

      // Close tab
      await chrome.tabs.remove(tabId);
      
      // Update status
      activeTab.status = 'completed';
      
      Logger.info('Tab closed successfully', {
        tabId,
        duration: Math.round(duration / 1000) + 's',
        trackedRequestsCount: trackedData.length
      }, `TAB_${tabId}`);

      // Notify dashboard
      this.notifyDashboard('TAB_CLOSED', {
        tabId,
        duration: Math.round(duration / 1000),
        trackedCount: trackedData.length
      });

    } catch (error) {
      Logger.error('Error closing tab', {
        tabId,
        error: error instanceof Error ? error.message : String(error)
      }, `TAB_${tabId}`);
    } finally {
      this.activeTabs.delete(tabId);
    }
  }

  private handleTabRemoved(tabId: number) {
    const activeTab = this.activeTabs.get(tabId);
    if (!activeTab) return;

    Logger.info('Tab removed externally', { tabId }, `TAB_${tabId}`);
    
    // Clear timer
    if (activeTab.closeTimer) {
      clearTimeout(activeTab.closeTimer);
    }
    
    // Update history
    const duration = Date.now() - activeTab.startTime.getTime();
    HistoryRepository.updateExecution(activeTab.historyId, {
      endTime: new Date(),
      success: activeTab.trackedCount > 0,
      logs: [`Tab closed externally after ${Math.round(duration / 1000)}s`]
    }).catch(error => {
      Logger.error('Error updating history for removed tab', error, `TAB_${tabId}`);
    });

    // Remove from active tabs
    this.activeTabs.delete(tabId);

    // Notify dashboard
    this.notifyDashboard('TAB_CLOSED', { tabId });
  }

  private async updateScheduleNextRun(schedule: Schedule) {
    try {
      if (schedule.type === 'once') {
        // Disable one-time schedules after execution
        await ScheduleRepository.update(schedule.id, { enabled: false });
        Logger.info(`One-time schedule disabled: ${schedule.name}`, {}, 'SCHEDULER');
      } else {
        // Calculate next run for recurring schedules
        const nextRun = SchedulerEngine.calculateNextRun(schedule);
        await ScheduleRepository.updateNextRun(schedule.id, nextRun);
        Logger.info(`Next run updated for ${schedule.name}`, { 
          nextRun: nextRun.toISOString() 
        }, 'SCHEDULER');
      }
    } catch (error) {
      Logger.error('Error updating schedule next run', error, 'SCHEDULER');
    }
  }

  private async closeAllActiveTabs() {
    const promises = Array.from(this.activeTabs.keys()).map(async (tabId) => {
      try {
        await chrome.tabs.remove(tabId);
      } catch (error) {
        console.warn(`Could not close tab ${tabId}:`, error);
      }
    });
    
    await Promise.allSettled(promises);
    this.activeTabs.clear();
  }

  private async getTrackedDataForSchedule(scheduleId: string): Promise<any[]> {
    try {
      const storageKey = `tracked_requests_${scheduleId}`;
      const result = await chrome.storage.local.get(storageKey);
      return result[storageKey] || [];
    } catch (error) {
      Logger.error('Error getting tracked data', error, 'STORAGE');
      return [];
    }
  }

  private notifyDashboard(type: string, data: any) {
    try {
      chrome.runtime.sendMessage({
        type,
        data
      }).catch(() => {
        // Dashboard may not be open, ignore error
      });
    } catch (error) {
      // Ignore messaging errors when dashboard is not available
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public API for debugging
  public getStats() {
    return {
      isRunning: this.isRunning,
      activeTabsCount: this.activeTabs.size,
      activeTabs: Array.from(this.activeTabs.values()).map(tab => ({
        tabId: tab.tabId,
        linkName: tab.linkName,
        status: tab.status,
        trackedCount: tab.trackedCount,
        runtime: Date.now() - tab.startTime.getTime()
      }))
    };
  }
}

// Initialize background manager
const backgroundManager = new BackgroundManager();

// Export for debugging
(globalThis as any).__backgroundManager__ = backgroundManager;

console.log('Background Manager initialized');
console.log('Debug: globalThis.__backgroundManager__.getStats()');