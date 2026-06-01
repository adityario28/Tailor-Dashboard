import Dexie, { type Table } from 'dexie';
import { trx } from './supabase';

export type OrderStatus = 'Cuci Bahan' | 'Potong Bahan' | 'Jahit' | 'Finishing' | 'Siap Diambil';
export const STATUS_FLOW: OrderStatus[] = ['Cuci Bahan', 'Potong Bahan', 'Jahit', 'Finishing', 'Siap Diambil'];

export interface Customer {
  id?: number;
  name: string;
  phone?: string;
  sex?: 'L' | 'P';
  total_trx?: number;
  synced?: boolean;
}

export interface PresetCustomer {
  id?: number;
  customer_id: number;
  preset_name: string;
  outfit_type?: string;
  panjang_kain?: number;
  lebar_kain?: number;
  cuci_sebelum_potong?: boolean;
  panjang_badan?: number;
  lebar_bahu?: number;
  panjang_lengan?: number;
  lingkar_lengan?: number;
  lingkar_ujung_lengan?: number;
  lingkar_dada?: number;
  lingkar_perut?: number;
  lingkar_pinggul?: number;
  catatan?: string;
  synced?: boolean;
}

export interface Transaction {
  id?: number;
  customer_id: number;
  preset_id?: number;
  outfit_type?: string;
  panjang_kain?: number;
  lebar_kain?: number;
  cuci_sebelum_potong?: boolean;
  panjang_badan?: number;
  lebar_bahu?: number;
  panjang_lengan?: number;
  lingkar_lengan?: number;
  lingkar_ujung_lengan?: number;
  lingkar_dada?: number;
  lingkar_perut?: number;
  lingkar_pinggul?: number;
  catatan?: string;
  status: OrderStatus;
  synced?: boolean;
}

export class TailorDatabase extends Dexie {
  customer!: Table<Customer>;
  preset_customer!: Table<PresetCustomer>;
  transaction!: Table<Transaction>;

  constructor() {
    super('TailorDB');
    this.version(6).stores({
      customer: '++id, name, synced',
      preset_customer: '++id, customer_id, synced',
      transaction: '++id, customer_id, synced',
    });
  }
}

export const db = new TailorDatabase();

// --- Sync helpers ---

// Returns the Supabase-assigned customer ID, or null on failure
export async function syncCustomer(c: Customer): Promise<number | null> {
  if (!navigator.onLine || !c.id) return null;
  const { id, synced, total_trx, ...data } = c;
  const { data: inserted, error } = await trx.from('customer').insert(data).select('id').single();
  if (error) { console.error("syncCustomer error:", error); return null; }
  await db.customer.update(id, { synced: true });
  return inserted.id as number;
}

// supabaseCustomerId: Supabase customer ID to use instead of local Dexie ID
export async function syncPreset(p: PresetCustomer, supabaseCustomerId?: number): Promise<number | null> {
  if (!navigator.onLine || !p.id) return null;
  const { id, synced, ...data } = p;
  const payload = supabaseCustomerId ? { ...data, customer_id: supabaseCustomerId } : data;
  const { data: inserted, error } = await trx.from('preset_customer').insert(payload).select('id').single();
  if (error) { console.error("syncPreset error:", error); return null; }
  await db.preset_customer.update(id, { synced: true });
  return inserted.id as number;
}

export async function syncTransaction(t: Transaction, supabaseCustomerId?: number, supabasePresetId?: number): Promise<void> {
  if (!navigator.onLine || !t.id) return;
  const { id, synced, ...data } = t;
  const payload = {
    ...data,
    ...(supabaseCustomerId ? { customer_id: supabaseCustomerId } : {}),
    ...(supabasePresetId !== undefined ? { preset_id: supabasePresetId } : {}),
  };
  const { error } = await trx.from('transaction').insert(payload);
  if (error) { console.error("syncTransaction error:", error); return; }
  await db.transaction.update(id, { synced: true });
}

export async function syncPending() {
  if (!navigator.onLine) return;

  const [customers, presets, transactions] = await Promise.all([
    db.customer.toArray().then(arr => arr.filter(c => !c.synced)),
    db.preset_customer.toArray().then(arr => arr.filter(p => !p.synced)),
    db.transaction.toArray().then(arr => arr.filter(t => !t.synced)),
  ]);

  if (!customers.length && !presets.length && !transactions.length) return;

  // dexie customer id → supabase customer id
  const customerIdMap = new Map<number, number>();

  // Sync unsynced customers and record their new Supabase IDs
  for (const c of customers) {
    const supabaseId = await syncCustomer(c);
    if (supabaseId && c.id) customerIdMap.set(c.id, supabaseId);
  }

  // For already-synced customers referenced by pending presets/transactions,
  // look up their Supabase ID by name
  const pendingCustIds = new Set([
    ...presets.map(p => p.customer_id),
    ...transactions.map(t => t.customer_id),
  ]);
  for (const dexieId of pendingCustIds) {
    if (customerIdMap.has(dexieId)) continue;
    const local = await db.customer.get(dexieId);
    if (!local?.name) continue;
    const { data } = await trx.from('customer').select('id').eq('name', local.name).single();
    if (data?.id) customerIdMap.set(dexieId, data.id as number);
  }

  // dexie preset id → supabase preset id
  const presetIdMap = new Map<number, number>();
  for (const p of presets) {
    const supabaseCustId = customerIdMap.get(p.customer_id);
    const supabaseId = await syncPreset(p, supabaseCustId);
    if (supabaseId && p.id) presetIdMap.set(p.id, supabaseId);
  }

  for (const t of transactions) {
    const supabaseCustId = customerIdMap.get(t.customer_id);
    const supabasePresetId = t.preset_id ? presetIdMap.get(t.preset_id) : undefined;
    await syncTransaction(t, supabaseCustId, supabasePresetId);
  }
}
