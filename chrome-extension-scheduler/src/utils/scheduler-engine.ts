// src/utils/scheduler-engine.ts
import parser from 'cron-parser';
import { Schedule } from '../types';

export class SchedulerEngine {
  static calculateNextRun(schedule: Schedule): Date {
    const now = new Date();
    
    switch (schedule.type) {
      case 'cron':
        if (!schedule.cronExpression) {
          throw new Error('Cron expression is required for cron type');
        }
        try {
          const interval = parser.parseExpression(schedule.cronExpression);
          return interval.next().toDate();
        } catch (error) {
          throw new Error(`Invalid cron expression: ${schedule.cronExpression}`);
        }

      case 'interval':
        if (!schedule.intervalMinutes) {
          throw new Error('Interval minutes is required for interval type');
        }
        const nextRun = new Date(now.getTime() + schedule.intervalMinutes * 60 * 1000);
        return nextRun;

      case 'once':
        if (!schedule.oneTimeDate) {
          throw new Error('One time date is required for once type');
        }
        return new Date(schedule.oneTimeDate);

      default:
        throw new Error(`Unknown schedule type: ${schedule.type}`);
    }
  }

  static isScheduleDue(schedule: Schedule): boolean {
    const now = new Date();
    return schedule.enabled && schedule.nextRun <= now;
  }

  static validateCronExpression(expression: string): boolean {
    try {
      parser.parseExpression(expression);
      return true;
    } catch {
      return false;
    }
  }

  static getNextExecutions(schedules: Schedule[], count: number = 5): Array<{
    schedule: Schedule;
    nextRun: Date;
    timeUntil: number;
  }> {
    return schedules
      .filter(s => s.enabled)
      .map(schedule => ({
        schedule,
        nextRun: schedule.nextRun,
        timeUntil: schedule.nextRun.getTime() - Date.now()
      }))
      .filter(item => item.timeUntil > 0)
      .sort((a, b) => a.timeUntil - b.timeUntil)
      .slice(0, count);
  }
}
