// src/types/index.ts
export interface Link {
  id: string;
  name: string;
  url: string;
  productId?: string;
  shopId?: string;
  createdAt: Date;
  enabled: boolean;
}

export interface Schedule {
  id: string;
  linkId: string;
  name: string;
  type: 'cron' | 'interval' | 'once';
  cronExpression?: string;
  intervalMinutes?: number;
  oneTimeDate?: Date;
  quantity: number;
  enabled: boolean;
  createdAt: Date;
  nextRun: Date;
  lastRun?: Date;
}

export interface ExecutionHistory {
  id: string;
  linkId: string;
  scheduleId: string;
  startTime: Date;
  endTime?: Date;
  success: boolean;
  errorMessage?: string;
  logs: string[];
  executionData?: any;
}

export interface ProcessingState {
  isProcessing: boolean;
  currentLinkId?: string;
  currentScheduleId?: string;
  startTime?: Date;
  logs: string[];
}