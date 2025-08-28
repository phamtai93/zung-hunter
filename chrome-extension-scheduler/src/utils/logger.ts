// src/utils/logger.ts
export enum LogLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  DEBUG = 'debug'
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  data?: any;
  category?: string;
}

export class Logger {
  private static logs: LogEntry[] = [];
  private static maxLogs = 1000;
  private static isEnabled = true;

  /**
   * Log a message with specified level
   */
  static log(level: LogLevel, message: string, data?: any, category?: string): void {
    if (!this.isEnabled) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data,
      category
    };

    this.logs.push(entry);
    
    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console output with formatting
    const timestamp = entry.timestamp.toISOString();
    const categoryStr = category ? `[${category}] ` : '';
    const consoleMessage = `[${timestamp}] ${categoryStr}${level.toUpperCase()}: ${message}`;
    
    switch (level) {
      case LogLevel.ERROR:
        console.error(consoleMessage, data);
        break;
      case LogLevel.WARNING:
        console.warn(consoleMessage, data);
        break;
      case LogLevel.DEBUG:
        console.debug(consoleMessage, data);
        break;
      default:
        console.log(consoleMessage, data);
    }

    // Store in chrome storage for persistence
    this.persistLogs();

    // Send to dashboard if running in background script context
    this.notifyDashboard(entry);
  }

  /**
   * Log info message
   */
  static info(message: string, data?: any, category?: string): void {
    this.log(LogLevel.INFO, message, data, category);
  }

  /**
   * Log warning message
   */
  static warning(message: string, data?: any, category?: string): void {
    this.log(LogLevel.WARNING, message, data, category);
  }

  /**
   * Log error message
   */
  static error(message: string, data?: any, category?: string): void {
    this.log(LogLevel.ERROR, message, data, category);
  }

  /**
   * Log debug message
   */
  static debug(message: string, data?: any, category?: string): void {
    this.log(LogLevel.DEBUG, message, data, category);
  }

  /**
   * Get all logs
   */
  static getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs filtered by level
   */
  static getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Get logs filtered by category
   */
  static getLogsByCategory(category: string): LogEntry[] {
    return this.logs.filter(log => log.category === category);
  }

  /**
   * Load stored logs from chrome storage
   */
  static async loadStoredLogs(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('extensionLogs');
      if (result.extensionLogs) {
        this.logs = result.extensionLogs.map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp)
        }));
      }
    } catch (error) {
      console.error('Failed to load stored logs:', error);
    }
  }

  /**
   * Persist logs to chrome storage
   */
  private static async persistLogs(): Promise<void> {
    try {
      // Store only last 100 logs in storage to avoid quota issues
      const logsToStore = this.logs.slice(-100);
      await chrome.storage.local.set({ extensionLogs: logsToStore });
    } catch (error) {
      console.error('Failed to persist logs:', error);
    }
  }

  /**
   * Clear all logs
   */
  static clearLogs(): void {
    this.logs = [];
    chrome.storage.local.remove('extensionLogs');
  }

  /**
   * Export logs as text
   */
  static exportLogs(): string {
    return this.logs.map(log => {
      const timestamp = log.timestamp.toISOString();
      const category = log.category ? `[${log.category}] ` : '';
      const dataStr = log.data ? ' ' + JSON.stringify(log.data) : '';
      return `[${timestamp}] ${category}${log.level.toUpperCase()}: ${log.message}${dataStr}`;
    }).join('\n');
  }

  /**
   * Set logging enabled/disabled
   */
  static setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Get logging status
   */
  static isLoggingEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Get log statistics
   */
  static getStats(): Record<LogLevel, number> {
    const stats = {
      [LogLevel.INFO]: 0,
      [LogLevel.WARNING]: 0,
      [LogLevel.ERROR]: 0,
      [LogLevel.DEBUG]: 0
    };

    this.logs.forEach(log => {
      stats[log.level]++;
    });

    return stats;
  }

  /**
   * Notify dashboard about new log entry (PRIVATE METHOD)
   */
  private static notifyDashboard(entry: LogEntry): void {
    try {
      // Only send from background script context
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const message = {
          type: 'NEW_LOG_ENTRY',
          data: {
            timestamp: entry.timestamp.toISOString(),
            level: entry.level,
            message: entry.message,
            data: entry.data,
            category: entry.category
          }
        };
        
        console.log('Logger sending message to dashboard:', message); // Debug log
        
        chrome.runtime.sendMessage(message).catch((error) => {
          // Only log if it's not a "receiving end does not exist" error
          if (error && !error.message?.includes('receiving end does not exist')) {
            console.warn('Logger notification error:', error);
          }
        });
      }
    } catch (error) {
      console.warn('Logger notification failed:', error);
    }
  }
}