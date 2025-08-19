
// src/background/alarm-handler.ts
import { BackgroundScheduler } from './scheduler';

export class AlarmHandler {
  static setup(): void {
    chrome.alarms.onAlarm.addListener((alarm) => {
      switch (alarm.name) {
        case 'scheduler-check':
          BackgroundScheduler.checkAndExecuteSchedules();
          break;
        default:
          console.log(`Unknown alarm: ${alarm.name}`);
      }
    });
  }
}