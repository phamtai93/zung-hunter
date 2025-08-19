// src/background/background.ts
import { AlarmHandler } from './alarm-handler';
import { BackgroundScheduler } from './scheduler';

// Setup background script
console.log('Background service worker started');

// Initialize alarm handler
AlarmHandler.setup();

// Start scheduler when extension is installed/enabled
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed/updated');
  await BackgroundScheduler.start();
});

// Start scheduler when service worker starts
chrome.runtime.onStartup.addListener(async () => {
  console.log('Browser started');
  await BackgroundScheduler.start();
});

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
  switch (message.type) {
    case 'GET_PROCESSING_STATE':
      BackgroundScheduler.getProcessingState().then(sendResponse);
      return true;

    case 'FORCE_SCHEDULE_CHECK':
      console.log('🔧 Force schedule check requested');
      BackgroundScheduler.checkAndExecuteSchedules().then(() => {
        sendResponse && sendResponse({ success: true });
      });
      return true;

    // 🔧 NEW: Force execute specific schedule
    case 'FORCE_EXECUTE_SCHEDULE':
      console.log(`🔧 Force execute schedule: ${message.scheduleId}`);
      BackgroundScheduler.forceExecuteSchedule(message.scheduleId)
        .then(() => sendResponse && sendResponse({ success: true }))
        .catch(error => sendResponse && sendResponse({ success: false, error: error.message }));
      return true;

    // 🔧 NEW: Check if specific schedule is due
    case 'CHECK_SCHEDULE_NOW':
      console.log(`🔍 Checking schedule: ${message.scheduleId}`);
      BackgroundScheduler.checkScheduleNow(message.scheduleId)
        .then(isDue => sendResponse && sendResponse({ isDue }))
        .catch(error => sendResponse && sendResponse({ isDue: false, error: error.message }));
      return true;

    case 'START_SCHEDULER':
      BackgroundScheduler.start().then(() => {
        sendResponse && sendResponse({ success: true });
      });
      return true;

    case 'STOP_SCHEDULER':
      BackgroundScheduler.stop().then(() => {
        sendResponse && sendResponse({ success: true });
      });
      return true;

    // 🔧 NEW: Manual tab management
    case 'CLOSE_SCHEDULE_TABS':
      BackgroundScheduler.closeScheduleTabs(message.scheduleId)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'CLOSE_ALL_BACKGROUND_TABS':
      BackgroundScheduler.closeAllBackgroundTabs()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'GET_BACKGROUND_TABS':
      sendResponse({ tabs: BackgroundScheduler.getBackgroundTabs() });
      return true;

    default:
      console.log(`❓ Unknown message type: ${message.type}`);
  }
});

// Auto-start scheduler
BackgroundScheduler.start();