
// src/utils/constants.ts
export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const SCHEDULE_TYPES = {
  CRON: 'cron' as const,
  INTERVAL: 'interval' as const,
  ONCE: 'once' as const
};

export const DEFAULT_CRON_EXPRESSIONS = {
  EVERY_MINUTE: '* * * * *',
  EVERY_HOUR: '0 * * * *',
  EVERY_DAY: '0 9 * * *',
  EVERY_WEEK: '0 9 * * 1',
  EVERY_MONTH: '0 9 1 * *'
};

export const LOG_LEVELS = {
  INFO: 'info',
  ERROR: 'error',
  WARNING: 'warning'
} as const;