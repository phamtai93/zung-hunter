
import parser from 'cron-parser';

export class CronUtils {
  /**
   * Parse cron expression and return parsed interval
   */
  static parse(expression: string) {
    try {
      return parser.parseExpression(expression);
    } catch (error) {
      throw new Error(`Invalid cron expression: ${expression}`);
    }
  }

  /**
   * Get next execution time for cron expression
   */
  static getNextRun(expression: string): Date {
    const interval = this.parse(expression);
    return interval.next().toDate();
  }

  /**
   * Get multiple next execution times
   */
  static getNextRuns(expression: string, count: number = 5): Date[] {
    const interval = this.parse(expression);
    const runs: Date[] = [];
    
    for (let i = 0; i < count; i++) {
      runs.push(interval.next().toDate());
    }
    
    return runs;
  }

  /**
   * Validate cron expression format
   */
  static validate(expression: string): boolean {
    try {
      this.parse(expression);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get human-readable description of cron expression
   */
  static describe(expression: string): string {
    // Simple description generator for common patterns
    const patterns: Record<string, string> = {
      '* * * * *': 'Every minute',
      '0 * * * *': 'Every hour',
      '0 0 * * *': 'Daily at midnight',
      '0 9 * * *': 'Daily at 9 AM',
      '0 9 * * 1-5': 'Weekdays at 9 AM',
      '0 9 * * 0': 'Sundays at 9 AM',
      '0 9 1 * *': 'First day of every month at 9 AM',
      '*/30 * * * *': 'Every 30 minutes',
      '*/15 * * * *': 'Every 15 minutes',
      '0 */2 * * *': 'Every 2 hours',
      '0 0 * * 1': 'Every Monday at midnight',
      '0 12 * * *': 'Daily at noon',
      '0 18 * * 1-5': 'Weekdays at 6 PM'
    };

    return patterns[expression] || `Custom: ${expression}`;
  }

  /**
   * Generate common cron expressions
   */
  static getCommonExpressions() {
    return [
      { label: 'Every minute', value: '* * * * *' },
      { label: 'Every 5 minutes', value: '*/5 * * * *' },
      { label: 'Every 15 minutes', value: '*/15 * * * *' },
      { label: 'Every 30 minutes', value: '*/30 * * * *' },
      { label: 'Every hour', value: '0 * * * *' },
      { label: 'Every 2 hours', value: '0 */2 * * *' },
      { label: 'Daily at 9 AM', value: '0 9 * * *' },
      { label: 'Daily at 6 PM', value: '0 18 * * *' },
      { label: 'Weekdays at 9 AM', value: '0 9 * * 1-5' },
      { label: 'Weekend at 10 AM', value: '0 10 * * 0,6' },
      { label: 'Weekly (Monday 9 AM)', value: '0 9 * * 1' },
      { label: 'Monthly (1st day 9 AM)', value: '0 9 1 * *' },
      { label: 'First Monday of month', value: '0 9 1-7 * 1' }
    ];
  }

  /**
   * Check if cron expression will trigger within specified time range
   */
  static willTriggerInRange(expression: string, startTime: Date, endTime: Date): boolean {
    try {
      const interval = parser.parseExpression(expression, { currentDate: startTime });
      const nextRun = interval.next().toDate();
      return nextRun <= endTime;
    } catch {
      return false;
    }
  }

  /**
   * Get all execution times within a date range
   */
  static getExecutionsInRange(expression: string, startTime: Date, endTime: Date): Date[] {
    const executions: Date[] = [];
    try {
      const interval = parser.parseExpression(expression, { currentDate: startTime });
      
      while (true) {
        const nextRun = interval.next().toDate();
        if (nextRun > endTime) break;
        executions.push(nextRun);
        
        // Safety limit to prevent infinite loops
        if (executions.length > 1000) break;
      }
    } catch (error) {
      console.error('Error getting executions in range:', error);
    }
    
    return executions;
  }
}
