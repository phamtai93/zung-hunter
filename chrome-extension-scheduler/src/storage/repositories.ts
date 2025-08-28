import { db } from './database';
import { Link, Schedule, ExecutionHistory } from '../types';
import { generateId } from '../utils/constants';

export class LinkRepository {
  static async getAll(): Promise<Link[]> {
    return await db.links.orderBy('createdAt').reverse().toArray();
  }

  static async getById(id: string): Promise<Link | undefined> {
    return await db.links.get(id);
  }

  static async create(linkData: Omit<Link, 'id' | 'createdAt'>): Promise<Link> {
    const link: Link = {
      id: generateId(),
      createdAt: new Date(),
      ...linkData
    };
    await db.links.add(link);
    return link;
  }

  static async update(id: string, updates: Partial<Link>): Promise<void> {
    await db.links.update(id, updates);
  }

  static async delete(id: string): Promise<void> {
    // Delete related schedules and history
    await db.schedules.where('linkId').equals(id).delete();
    await db.history.where('linkId').equals(id).delete();
    await db.links.delete(id);
  }
}

export class ScheduleRepository {
  // 🔧 ADD: Missing getById method - following same pattern as LinkRepository
  static async getById(id: string): Promise<Schedule | undefined> {
    return await db.schedules.get(id);
  }

  // 🔧 ADD: Get all schedules (useful for admin/debugging)
  static async getAll(): Promise<Schedule[]> {
    try {
      const schedules = await db.schedules.toArray();
      // Sort by creation date if available, otherwise by nextRun
      return schedules.sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime();
      });
    } catch (error) {
      console.error('Error getting all schedules:', error);
      return [];
    }
  }

  // 🔧 ADD: Get schedules by status for filtering
  static async getByStatus(enabled: boolean): Promise<Schedule[]> {
    const allSchedules = await db.schedules.toArray();
    return allSchedules.filter(schedule => schedule.enabled === enabled);
  }

  // 🔧 ADD: Get overdue schedules (useful for debugging timing issues)
  static async getOverdue(): Promise<Schedule[]> {
    const now = new Date();
    const allSchedules = await db.schedules.toArray();
    
    return allSchedules.filter(schedule => 
      schedule.enabled === true && 
      schedule.nextRun <= now
    );
  }

  // 🔧 ADD: Get schedules by type (cron, interval, once)
  static async getByType(type: Schedule['type']): Promise<Schedule[]> {
    const allSchedules = await db.schedules.toArray();
    return allSchedules.filter(schedule => schedule.type === type);
  }

  // Existing methods...
  static async getByLinkId(linkId: string): Promise<Schedule[]> {
    return await db.schedules.where('linkId').equals(linkId).toArray();
  }

  static async getActiveSchedules(): Promise<Schedule[]> {
    // Use filter instead of where().equals() for boolean
    const allSchedules = await db.schedules.toArray();
    return allSchedules.filter(schedule => schedule.enabled === true);
  }

  static async getUpcoming(limit: number = 10): Promise<Schedule[]> {
    const now = new Date();
    const allSchedules = await db.schedules.toArray();
    
    return allSchedules
      .filter(schedule => schedule.enabled === true && schedule.nextRun > now)
      .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime())
      .slice(0, limit);
  }

  static async create(scheduleData: Omit<Schedule, 'id' | 'createdAt'>): Promise<Schedule> {
    const schedule: Schedule = {
      id: generateId(),
      createdAt: new Date(),
      ...scheduleData
    };
    await db.schedules.add(schedule);
    return schedule;
  }

  static async update(id: string, updates: Partial<Schedule>): Promise<void> {
    await db.schedules.update(id, updates);
  }

  static async delete(id: string): Promise<void> {
    await db.history.where('scheduleId').equals(id).delete();
    await db.schedules.delete(id);
  }

  static async updateNextRun(id: string, nextRun: Date): Promise<void> {
    await db.schedules.update(id, { 
      nextRun, 
      lastRun: new Date() 
    });
  }

  // 🔧 ADD: Bulk operations for performance
  static async bulkUpdate(updates: Array<{ id: string; updates: Partial<Schedule> }>): Promise<void> {
    const promises = updates.map(({ id, updates: scheduleUpdates }) => 
      db.schedules.update(id, scheduleUpdates)
    );
    await Promise.all(promises);
  }

  // 🔧 ADD: Enable/disable schedule (commonly used operations)
  static async enable(id: string): Promise<void> {
    await db.schedules.update(id, { enabled: true });
  }

  static async disable(id: string): Promise<void> {
    await db.schedules.update(id, { enabled: false });
  }

  // 🔧 ADD: Get statistics about schedules
  static async getStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    byType: Record<Schedule['type'], number>;
    overdue: number;
  }> {
    const allSchedules = await db.schedules.toArray();
    const now = new Date();
    
    const total = allSchedules.length;
    const active = allSchedules.filter(s => s.enabled).length;
    const inactive = total - active;
    const overdue = allSchedules.filter(s => 
      s.enabled && s.nextRun <= now
    ).length;
    
    const byType = allSchedules.reduce((acc, schedule) => {
      acc[schedule.type] = (acc[schedule.type] || 0) + 1;
      return acc;
    }, {} as Record<Schedule['type'], number>);

    return {
      total,
      active,
      inactive,
      byType,
      overdue
    };
  }

  // 🔧 ADD: Find schedules due within a time window (useful for scheduling)
  static async getDueWithin(minutes: number): Promise<Schedule[]> {
    const now = new Date();
    const maxTime = new Date(now.getTime() + (minutes * 60 * 1000));
    const allSchedules = await db.schedules.toArray();
    
    return allSchedules.filter(schedule => 
      schedule.enabled === true && 
      schedule.nextRun >= now &&
      schedule.nextRun <= maxTime
    ).sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime());
  }

  // 🔧 ADD: Search schedules by name or link (useful for UI)
  static async search(query: string): Promise<Schedule[]> {
    const allSchedules = await db.schedules.toArray();
    const lowercaseQuery = query.toLowerCase();
    
    return allSchedules.filter(schedule => 
      schedule.name.toLowerCase().includes(lowercaseQuery)
    );
  }

  
}

export class HistoryRepository {
  static async getAll(limit: number = 100): Promise<ExecutionHistory[]> {
    return await db.history
      .orderBy('startTime')
      .reverse()
      .limit(limit)
      .toArray();
  }

  static async getByLinkId(linkId: string): Promise<ExecutionHistory[]> {
    return await db.history
      .where('linkId')
      .equals(linkId)
      .reverse()
      .sortBy('startTime');
  }

  static async create(historyData: Omit<ExecutionHistory, 'id'>): Promise<ExecutionHistory> {
    const history: ExecutionHistory = {
      id: generateId(),
      ...historyData
    };
    await db.history.add(history);
    return history;
  }

  static async updateExecution(
    id: string, 
    updates: Partial<Pick<ExecutionHistory, 'endTime' | 'success' | 'errorMessage' | 'logs' | 'executionData'>>
  ): Promise<void> {
    await db.history.update(id, updates);
  }

  static async getStats(): Promise<{
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  }> {
    const total = await db.history.count();
    // Use filter instead of where().equals() for boolean
    const allHistory = await db.history.toArray();
    const successful = allHistory.filter(h => h.success === true).length;
    const failed = total - successful;
    const successRate = total > 0 ? (successful / total) * 100 : 0;

    return { total, successful, failed, successRate };
  }
}