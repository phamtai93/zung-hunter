import Dexie, { Table } from 'dexie';
import { Link, Schedule, ExecutionHistory } from '../types';

export class AppDatabase extends Dexie {
  links!: Table<Link>;
  schedules!: Table<Schedule>;
  history!: Table<ExecutionHistory>;

  constructor() {
    super('LinkSchedulerDB');
    
    this.version(1).stores({
      links: 'id, name, url, productId, shopId, createdAt, enabled',
      schedules: 'id, linkId, name, type, enabled, nextRun, lastRun, quantity',
      history: 'id, linkId, scheduleId, startTime, endTime, success'
    });
  }
}

export const db = new AppDatabase();