// src/background/background.ts - Hybrid Architecture Support

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
  settingsInjected: boolean;
  isolatedWorldReady: boolean;
  mainWorldReady: boolean;
  lastHeartbeat?: Date;
  trackedCount: number;
}

class HybridBackgroundManager {
  private isRunning = false;
  private activeTabs: Map<number, ActiveTab> = new Map();
  
  constructor() {
    this.init();
  }

  private async init() {
    console.log('Hybrid Background Manager initializing...');
    
    await Logger.loadStoredLogs();
    
    this.setupMessageListener();
    this.setupAlarmListener();
    this.setupTabListener();
    this.startScheduler();
    
    console.log('Hybrid Background Manager initialized');
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
            sendResponse({ isRunning: this.isRunning });
            break;

          case 'GET_ACTIVE_TABS':
            const tabs = Array.from(this.activeTabs.values()).map(tab => ({
              id: tab.tabId.toString(),
              linkName: tab.linkName,
              url: tab.url,
              startTime: tab.startTime.toISOString(),
              status: this.getTabStatus(tab),
              requestCount: tab.trackedCount,
              settingsInjected: tab.settingsInjected,
              isolatedWorldReady: tab.isolatedWorldReady,
              mainWorldReady: tab.mainWorldReady
            }));
            sendResponse({ tabs });
            break;

          case 'CONTENT_SCRIPT_HEARTBEAT':
            this.handleHeartbeat(message.data, sender);
            sendResponse({ success: true });
            break;

          case 'INJECT_MAIN_WORLD_SCRIPT':
            this.injectMainWorldScript(message.tabId).then((success) => {
              sendResponse({ success });
            });
            return true;

          case 'GET_TRACKED_DATA':
            this.getTrackedDataForSchedule(message.scheduleId).then(sendResponse);
            return true;

          case 'GET_CURRENT_TAB_ID':
            const tabId = sender.tab?.id || 0;
            sendResponse({ tabId });
            break;

          default:
            sendResponse({ error: 'Unknown message type' });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('Error handling message:', errorMsg);
        sendResponse({ error: errorMsg });
      }
      
      return true;
    });
  }

  private setupAlarmListener() {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'scheduler-check') {
        this.checkDueSchedules();
      }
    });
  }

  private setupTabListener() {
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.handleTabRemoved(tabId);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
      const activeTab = this.activeTabs.get(tabId);
      if (activeTab && changeInfo.status === 'complete') {
        // Re-inject if page reloaded
        this.ensureScriptsInjected(tabId);
      }
    });
  }

  private startScheduler() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    Logger.info('Hybrid scheduler started', {}, 'SCHEDULER');
    
    chrome.alarms.create('scheduler-check', { periodInMinutes: 0.5 });
    this.checkDueSchedules();
  }

  private stopScheduler() {
    this.isRunning = false;
    Logger.info('Hybrid scheduler stopped', {}, 'SCHEDULER');
    
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
      if (!link?.enabled) return;

      Logger.info(`Executing schedule: ${schedule.name}`, {
        scheduleId: schedule.id,
        linkId: link.id
      }, 'EXECUTION');

      const historyData = await HistoryRepository.create({
        linkId: link.id,
        scheduleId: schedule.id,
        startTime: new Date(),
        success: false,
        logs: [`Started hybrid execution for ${link.name}`]
      });

      // Open tabs
      for (let i = 0; i < schedule.quantity; i++) {
        await this.openTrackedTab(link, schedule, historyData.id, i);
      }

      // Update next run
      if (schedule.type !== 'once') {
        const nextRun = SchedulerEngine.calculateNextRun(schedule);
        await ScheduleRepository.updateNextRun(schedule.id, nextRun);
      } else {
        await ScheduleRepository.update(schedule.id, { enabled: false });
      }

    } catch (error) {
      Logger.error('Error executing schedule', error, 'SCHEDULER');
    }
  }

  private async openTrackedTab(link: Link, schedule: Schedule, historyId: string, _index: number) {
    try {
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
        settingsInjected: false,
        isolatedWorldReady: false,
        mainWorldReady: false,
        trackedCount: 0
      };

      this.activeTabs.set(tab.id, activeTab);

      Logger.info('Tab opened for hybrid tracking', {
        tabId: tab.id,
        linkName: link.name,
        url: link.url
      }, `TAB_${tab.id}`);

      // Start injection process
      this.ensureScriptsInjected(tab.id);

      // Schedule tab closure
      setTimeout(() => {
        this.closeTab(tab.id!);
      }, TAB_CLOSE_TIMEOUT_MS);

    } catch (error) {
      Logger.error('Error opening tracked tab', error, 'TAB');
    }
  }

  private async ensureScriptsInjected(tabId: number) {
    const activeTab = this.activeTabs.get(tabId);
    if (!activeTab) return;

    try {
      // Step 1: Inject settings
      if (!activeTab.settingsInjected) {
        await this.injectSettings(tabId);
        activeTab.settingsInjected = true;
      }

      // Step 2: Wait a bit for isolated world content script to load (CRXJS handles this)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 3: Inject main world script (fallback in case isolated world injection fails)
      if (!activeTab.mainWorldReady) {
        await this.injectMainWorldScript(tabId);
      }

      Logger.info('Hybrid scripts injection completed', {
        tabId,
        settingsInjected: activeTab.settingsInjected
      }, `TAB_${tabId}`);

    } catch (error) {
      Logger.error('Error in hybrid script injection', {
        tabId,
        error: error instanceof Error ? error.message : String(error)
      }, `TAB_${tabId}`);
    }
  }

  private async injectSettings(tabId: number) {
    const activeTab = this.activeTabs.get(tabId);
    if (!activeTab) return;

    await chrome.scripting.executeScript({
      target: { tabId },
      func: (trackingStockLink: string, scheduleId: string, tabId: number) => {
        (window as any).EXTENSION_SETTINGS = {
          TRACKING_STOCK_LINK: trackingStockLink,
          scheduleId: scheduleId,
          tabId: tabId,
          DEBUG: true,
          injectedAt: Date.now()
        };
        console.log('Hybrid: Extension settings injected', (window as any).EXTENSION_SETTINGS);
      },
      args: [TRACKING_STOCK_LINK, activeTab.scheduleId, tabId]
    });

    Logger.info('Settings injected', { tabId }, `TAB_${tabId}`);
  }

  private async injectMainWorldScript(tabId: number): Promise<boolean> {
    try {
      // Read the main world script file
      const scriptUrl = chrome.runtime.getURL('src/content/main-world-interceptor.ts');
      const response = await fetch(scriptUrl);
      const scriptContent = await response.text();

      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        code: scriptContent
      } as any); // Type assertion to bypass Chrome API type issues

      const activeTab = this.activeTabs.get(tabId);
      if (activeTab) {
        activeTab.mainWorldReady = true;
      }

      Logger.info('Main world script injected by background', { tabId }, `TAB_${tabId}`);
      return true;

    } catch (error) {
      Logger.error('Background main world injection failed', {
        tabId,
        error: error instanceof Error ? error.message : String(error)
      }, `TAB_${tabId}`);
      return false;
    }
  }

  private handleHeartbeat(data: any, sender: chrome.runtime.MessageSender) {
    const tabId = sender.tab?.id;
    if (!tabId) return;

    const activeTab = this.activeTabs.get(tabId);
    if (activeTab) {
      activeTab.lastHeartbeat = new Date();
      activeTab.trackedCount = data.totalTracked || 0;
      activeTab.isolatedWorldReady = true;
      activeTab.mainWorldReady = data.isMainWorldActive || false;
      
      Logger.info('Hybrid heartbeat received', {
        tabId,
        totalTracked: data.totalTracked,
        completedRequests: data.completedRequests,
        modelsFound: data.modelsFound,
        mainWorldActive: data.isMainWorldActive
      }, `TAB_${tabId}`);
    }
  }

  private async closeTab(tabId: number) {
    const activeTab = this.activeTabs.get(tabId);
    if (!activeTab) return;

    try {
      const trackedData = await this.getTrackedDataForSchedule(activeTab.scheduleId);
      const duration = Date.now() - activeTab.startTime.getTime();
      
      await HistoryRepository.updateExecution(activeTab.historyId, {
        endTime: new Date(),
        success: trackedData.length > 0,
        logs: [
          `Hybrid tab closed after ${Math.round(duration / 1000)}s`,
          `Total requests tracked: ${trackedData.length}`,
          `Models found: ${trackedData.filter(r => r.modelsData).length}`,
          `Settings injected: ${activeTab.settingsInjected}`,
          `Isolated world ready: ${activeTab.isolatedWorldReady}`,
          `Main world ready: ${activeTab.mainWorldReady}`
        ],
        executionData: {
          trackedRequests: trackedData,
          duration: Math.round(duration / 1000),
          captureMethod: 'hybrid-main-isolated-world',
          scriptStatus: {
            settingsInjected: activeTab.settingsInjected,
            isolatedWorldReady: activeTab.isolatedWorldReady,
            mainWorldReady: activeTab.mainWorldReady
          }
        }
      });

      await chrome.tabs.remove(tabId);
      
      Logger.info('Hybrid tab closed successfully', {
        tabId,
        duration: Math.round(duration / 1000) + 's',
        trackedRequestsCount: trackedData.length
      }, `TAB_${tabId}`);

    } catch (error) {
      Logger.warning('Error closing hybrid tab', {
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

    Logger.info('Hybrid tab removed externally', { tabId }, `TAB_${tabId}`);
    
    const duration = Date.now() - activeTab.startTime.getTime();
    HistoryRepository.updateExecution(activeTab.historyId, {
      endTime: new Date(),
      success: activeTab.trackedCount > 0,
      logs: [`Hybrid tab closed externally after ${Math.round(duration / 1000)}s`],
      executionData: {
        duration: Math.round(duration / 1000),
        trackedCount: activeTab.trackedCount,
        captureMethod: 'hybrid-external-close'
      }
    }).catch(error => {
      Logger.error('Error updating history for closed tab', error, `TAB_${tabId}`);
    });

    this.activeTabs.delete(tabId);
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

  private getTabStatus(tab: ActiveTab): string {
    const now = new Date();
    const timeSinceStart = now.getTime() - tab.startTime.getTime();
    const timeSinceHeartbeat = tab.lastHeartbeat ? now.getTime() - tab.lastHeartbeat.getTime() : timeSinceStart;

    if (timeSinceHeartbeat > 60000) {
      return 'inactive';
    } else if (tab.trackedCount > 0) {
      return 'tracking';
    } else if (tab.mainWorldReady && tab.isolatedWorldReady) {
      return 'ready';
    } else if (tab.settingsInjected) {
      return 'injecting';
    } else {
      return 'loading';
    }
  }

  // Public API for debugging
  public getStats() {
    return {
      isRunning: this.isRunning,
      activeTabsCount: this.activeTabs.size,
      activeTabs: Array.from(this.activeTabs.values()).map(tab => ({
        tabId: tab.tabId,
        linkName: tab.linkName,
        status: this.getTabStatus(tab),
        trackedCount: tab.trackedCount,
        settingsInjected: tab.settingsInjected,
        isolatedWorldReady: tab.isolatedWorldReady,
        mainWorldReady: tab.mainWorldReady
      }))
    };
  }
}

// Initialize hybrid background manager
const hybridBackgroundManager = new HybridBackgroundManager();

// Export for debugging
(globalThis as any).__hybridBackgroundManager__ = hybridBackgroundManager;

console.log('Hybrid Background Manager initialized');
console.log('Debug: globalThis.__hybridBackgroundManager__.getStats()');