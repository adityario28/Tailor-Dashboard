import Dexie, { type Table } from 'dexie';

export interface Customer {
  id?: number;
  name: string;
  phone: string;
  waist: number;
  chest: number;
  length: number;
  createdAt: Date;
}

export class TailorDatabase extends Dexie {
  customers!: Table<Customer>;

  constructor() {
    super('TailorDB');
    this.version(1).stores({
      customers: '++id, name, phone' // Indexing name and phone for quick search
    });
  }
}

export const db = new TailorDatabase();