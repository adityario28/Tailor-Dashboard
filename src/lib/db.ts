import Dexie, { type Table } from 'dexie';
import { trx } from './supabase';

export type OrderStatus = 'Cuci Bahan' | 'Potong Bahan' | 'Jahit' | 'Finishing' | 'Siap Diambil' | 'Selesai';
export const STATUS_FLOW: OrderStatus[] = ['Cuci Bahan', 'Potong Bahan', 'Jahit', 'Finishing', 'Siap Diambil', 'Selesai'];

export type PaymentStatus = 'belum_bayar' | 'dp' | 'lunas';

// UUID generator for cross-device sync
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export type MaterialUnit = 'roll' | 'pcs' | 'meter' | 'yard' | 'lusin';
export const MATERIAL_UNITS: { value: MaterialUnit; label: string }[] = [
  { value: 'roll',  label: 'Roll' },
  { value: 'pcs',   label: 'Pcs' },
  { value: 'meter', label: 'Meter' },
  { value: 'yard',  label: 'Yard' },
  { value: 'lusin', label: 'Lusin' },
];

export interface Customer {
  id?: number;
  name: string;
  tag?: string;        // Internal identifier (e.g., "karangjati", "BPR") - not shown to customer
  phone?: string;
  sex?: 'L' | 'P';
  total_trx?: number;
  synced?: boolean;
}

export interface Material {
  id?: number;
  name: string;
  unit: MaterialUnit;
  current_stock: number;
  avg_cost_per_unit: number;
  low_stock_threshold: number;
  is_special_order?: boolean;
  synced?: boolean;
}

export interface Purchase {
  id?: number;
  purchased_at: Date;
  notes?: string;
  synced?: boolean;
}

export interface PurchaseItem {
  id?: number;
  purchase_id: number;
  material_id: number;
  quantity: number;
  unit_price: number;
  synced?: boolean;
}

export interface MaterialUsage {
  id?: number;
  transaction_id?: number;  // nullable for group usage
  group_id?: number;        // set when usage is for a group order
  material_id: number;
  quantity_used: number;
  cost_per_unit_snapshot: number;
  synced?: boolean;
}

export interface OrderGroup {
  id?: number;
  uuid: string;              // Client-generated UUID for sync matching
  ref_number?: number;       // Server-assigned sequential number (null until synced)
  name: string;
  commissioner: string;
  commissioner_phone?: string;
  notes?: string;
  default_outfit_type?: string;
  total_price?: number;
  amount_paid?: number;
  payment_status?: PaymentStatus;
  created_at?: Date;
  synced?: boolean;
}

export interface GroupMember {
  id?: number;
  uuid: string;              // Client-generated UUID for sync matching
  ref_number?: number;       // Server-assigned sequential number (null until synced)
  group_id: number;          // Local Dexie group ID
  group_uuid: string;        // UUID of parent group (for sync matching)
  name: string;
  role?: string;
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
  lingkar_leher?: number;
  lebar_pundak?: number;
  catatan?: string;
  status: OrderStatus;
  worker_id?: number;
  total_price?: number;
  sewing_fee?: number;
  created_at?: Date;
  synced?: boolean;
}

export interface Worker {
  id?: number;
  name: string;
  active: boolean;
  synced?: boolean;
}

export interface Draft {
  id?: number;
  data: string;
  customer_name: string;
  outfit_type: string;
  updated_at: Date;
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
  lingkar_leher?: number;
  lebar_pundak?: number;
  catatan?: string;
  synced?: boolean;
}

export interface Transaction {
  id?: number;
  supabase_id?: number;           // Supabase ID after sync (for deduplication)
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
  lingkar_leher?: number;
  lebar_pundak?: number;
  catatan?: string;
  status: OrderStatus;
  total_price?: number;
  sewing_fee?: number;
  amount_paid?: number;
  payment_status?: PaymentStatus;
  worker_id?: number;
  portal_token?: string;
  created_at?: Date;
  synced?: boolean;
}

// Transaction item for set orders (multiple pieces per transaction)
export interface TransactionItem {
  id?: number;
  transaction_id: number;       // Local Dexie transaction ID
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
  lingkar_leher?: number;
  lebar_pundak?: number;
  furing?: boolean;
  padding_tebal?: boolean;
  padding_tipis?: boolean;
  kancing?: boolean;
  catatan?: string;
  item_price?: number;
  sewing_fee?: number;
  synced?: boolean;
}

export class TailorDatabase extends Dexie {
  customer!: Table<Customer>;
  preset_customer!: Table<PresetCustomer>;
  transactions!: Table<Transaction>;
  transaction_item!: Table<TransactionItem>;
  draft!: Table<Draft>;
  material!: Table<Material>;
  purchase!: Table<Purchase>;
  purchase_item!: Table<PurchaseItem>;
  material_usage!: Table<MaterialUsage>;
  worker!: Table<Worker>;
  order_group!: Table<OrderGroup>;
  group_member!: Table<GroupMember>;

  constructor() {
    super('TailorDB');
    
    // Version 7 (existing)
    this.version(7).stores({
      customer: '++id, name, synced',
      preset_customer: '++id, customer_id, synced',
      transaction: '++id, customer_id, synced',
    });
    
    // Version 8 (add draft table and payment fields)
    this.version(8).stores({
      customer: '++id, name, synced',
      preset_customer: '++id, customer_id, synced',
      transaction: '++id, customer_id, synced',
      draft: '++id, customer_name, updated_at',
    }).upgrade(trans => {
      console.log('Upgrading TailorDB from v7 to v8...');
      return trans.table('transaction').toCollection().modify(trx => {
        if (!trx.hasOwnProperty('total_price')) trx.total_price = undefined;
        if (!trx.hasOwnProperty('amount_paid')) trx.amount_paid = 0;
        if (!trx.hasOwnProperty('payment_status')) trx.payment_status = 'belum_bayar';
      });
    });

    // Version 9 (add created_at index for reports)
    this.version(9).stores({
      customer: '++id, name, synced',
      preset_customer: '++id, customer_id, synced',
      transaction: '++id, customer_id, synced, created_at',
      draft: '++id, customer_name, updated_at',
    }).upgrade(trans => {
      console.log('Upgrading TailorDB from v8 to v9...');
      return trans.table('transaction').toCollection().modify(trx => {
        if (!trx.hasOwnProperty('created_at')) trx.created_at = new Date();
      });
    });

    // Version 10 (add material, purchase, purchase_item, material_usage tables)
    this.version(10).stores({
      customer: '++id, name, synced',
      preset_customer: '++id, customer_id, synced',
      transaction: '++id, customer_id, synced, created_at',
      draft: '++id, customer_name, updated_at',
      material: '++id, name, synced',
      purchase: '++id, purchased_at, synced',
      purchase_item: '++id, purchase_id, material_id, synced',
      material_usage: '++id, transaction_id, material_id, synced',
    });

    // Version 11 (add worker table + worker_id on transaction)
    this.version(11).stores({
      customer: '++id, name, synced',
      preset_customer: '++id, customer_id, synced',
      transaction: '++id, customer_id, worker_id, synced, created_at',
      draft: '++id, customer_name, updated_at',
      material: '++id, name, synced',
      purchase: '++id, purchased_at, synced',
      purchase_item: '++id, purchase_id, material_id, synced',
      material_usage: '++id, transaction_id, material_id, synced',
      worker: '++id, name, active, synced',
    }).upgrade(trans => {
      console.log('Upgrading TailorDB from v10 to v11...');
      return trans.table('transaction').toCollection().modify(t => {
        if (!t.hasOwnProperty('worker_id')) t.worker_id = undefined;
      });
    });

    // Version 12 (add is_special_order to material)
    this.version(12).stores({
      customer: '++id, name, synced',
      preset_customer: '++id, customer_id, synced',
      transaction: '++id, customer_id, worker_id, synced, created_at',
      draft: '++id, customer_name, updated_at',
      material: '++id, name, synced',
      purchase: '++id, purchased_at, synced',
      purchase_item: '++id, purchase_id, material_id, synced',
      material_usage: '++id, transaction_id, material_id, synced',
      worker: '++id, name, active, synced',
    }).upgrade(trans => {
      console.log('Upgrading TailorDB from v11 to v12...');
      return trans.table('material').toCollection().modify(m => {
        if (!m.hasOwnProperty('is_special_order')) m.is_special_order = false;
      });
    });

    // Version 13 (add sewing_fee to transaction)
    this.version(13).stores({
      customer: '++id, name, synced',
      preset_customer: '++id, customer_id, synced',
      transaction: '++id, customer_id, worker_id, synced, created_at',
      draft: '++id, customer_name, updated_at',
      material: '++id, name, synced',
      purchase: '++id, purchased_at, synced',
      purchase_item: '++id, purchase_id, material_id, synced',
      material_usage: '++id, transaction_id, material_id, synced',
      worker: '++id, name, active, synced',
    }).upgrade(trans => {
      console.log('Upgrading TailorDB from v12 to v13...');
      return trans.table('transaction').toCollection().modify(t => {
        if (!t.hasOwnProperty('sewing_fee')) t.sewing_fee = t.total_price ?? undefined;
      });
    });

    // Version 14 (add order_group, group_member tables; add group_id to material_usage)
    this.version(14).stores({
      customer: '++id, name, synced',
      preset_customer: '++id, customer_id, synced',
      transaction: '++id, customer_id, worker_id, synced, created_at',
      draft: '++id, customer_name, updated_at',
      material: '++id, name, synced',
      purchase: '++id, purchased_at, synced',
      purchase_item: '++id, purchase_id, material_id, synced',
      material_usage: '++id, transaction_id, group_id, material_id, synced',
      worker: '++id, name, active, synced',
      order_group: '++id, name, synced',
      group_member: '++id, group_id, worker_id, status, synced',
    }).upgrade(trans => {
      console.log('Upgrading TailorDB from v13 to v14...');
      return trans.table('material_usage').toCollection().modify(u => {
        if (!u.hasOwnProperty('group_id')) u.group_id = undefined;
      });
    });

    // Version 15 (add uuid and ref_number to order_group and group_member for cross-device sync)
    this.version(15).stores({
      customer: '++id, name, synced',
      preset_customer: '++id, customer_id, synced',
      transaction: '++id, customer_id, worker_id, synced, created_at',
      draft: '++id, customer_name, updated_at',
      material: '++id, name, synced',
      purchase: '++id, purchased_at, synced',
      purchase_item: '++id, purchase_id, material_id, synced',
      material_usage: '++id, transaction_id, group_id, material_id, synced',
      worker: '++id, name, active, synced',
      order_group: '++id, uuid, name, synced',
      group_member: '++id, uuid, group_id, group_uuid, worker_id, status, synced',
    }).upgrade(trans => {
      console.log('Upgrading TailorDB from v14 to v15...');
      // Add uuid to existing order_groups
      return trans.table('order_group').toCollection().modify(g => {
        if (!g.uuid) g.uuid = generateUUID();
        if (!g.hasOwnProperty('ref_number')) g.ref_number = undefined;
      }).then(() => {
        // Add uuid and group_uuid to existing group_members
        return trans.table('group_member').toCollection().modify(async (m) => {
          if (!m.uuid) m.uuid = generateUUID();
          if (!m.hasOwnProperty('ref_number')) m.ref_number = undefined;
          if (!m.group_uuid && m.group_id) {
            // Try to get parent group's uuid
            const group = await trans.table('order_group').get(m.group_id);
            m.group_uuid = group?.uuid || generateUUID();
          }
        });
      });
    });

    // Version 16 (add tag field to customer for internal identification)
    this.version(16).stores({
      customer: '++id, name, tag, synced',
      preset_customer: '++id, customer_id, synced',
      transaction: '++id, customer_id, worker_id, synced, created_at',
      draft: '++id, customer_name, updated_at',
      material: '++id, name, synced',
      purchase: '++id, purchased_at, synced',
      purchase_item: '++id, purchase_id, material_id, synced',
      material_usage: '++id, transaction_id, group_id, material_id, synced',
      worker: '++id, name, active, synced',
      order_group: '++id, uuid, name, synced',
      group_member: '++id, uuid, group_id, group_uuid, worker_id, status, synced',
    });

    // Version 17 (add transaction_item table for set orders with multiple pieces)
    this.version(17).stores({
      customer: '++id, name, tag, synced',
      preset_customer: '++id, customer_id, synced',
      transaction: '++id, customer_id, worker_id, synced, created_at',
      transaction_item: '++id, transaction_id, synced',
      draft: '++id, customer_name, updated_at',
      material: '++id, name, synced',
      purchase: '++id, purchased_at, synced',
      purchase_item: '++id, purchase_id, material_id, synced',
      material_usage: '++id, transaction_id, group_id, material_id, synced',
      worker: '++id, name, active, synced',
      order_group: '++id, uuid, name, synced',
      group_member: '++id, uuid, group_id, group_uuid, worker_id, status, synced',
    });

    // Version 18 (add supabase_id to transaction for deduplication)
    this.version(18).stores({
      customer: '++id, name, tag, synced',
      preset_customer: '++id, customer_id, synced',
      transaction: '++id, supabase_id, customer_id, worker_id, synced, created_at',
      transaction_item: '++id, transaction_id, synced',
      draft: '++id, customer_name, updated_at',
      material: '++id, name, synced',
      purchase: '++id, purchased_at, synced',
      purchase_item: '++id, purchase_id, material_id, synced',
      material_usage: '++id, transaction_id, group_id, material_id, synced',
      worker: '++id, name, active, synced',
      order_group: '++id, uuid, name, synced',
      group_member: '++id, uuid, group_id, group_uuid, worker_id, status, synced',
    });
    
    // Map the 'transaction' table to 'transactions' property to avoid conflict
    this.transactions = this.table('transaction');
    this.transaction_item = this.table('transaction_item');
  }
}

export const db = new TailorDatabase();

// Add error handler and open event
db.on('ready', () => {
  console.log('TailorDB ready, version:', db.verno);
});

db.on('versionchange', (event) => {
  console.log('TailorDB version changing from', event.oldVersion, 'to', event.newVersion);
});

// Catch any database errors
db.open().catch(err => {
  console.error('Failed to open TailorDB:', err);
  if (err.name === 'VersionError') {
    console.error('Database version conflict. You may need to clear IndexedDB.');
  }
});

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

export async function syncTransaction(t: Transaction, supabaseCustomerId?: number, supabasePresetId?: number): Promise<number | null> {
  if (!navigator.onLine || !t.id) return null;
  const { id, synced, supabase_id, ...data } = t;
  const payload = {
    ...data,
    ...(supabaseCustomerId ? { customer_id: supabaseCustomerId } : {}),
    ...(supabasePresetId !== undefined ? { preset_id: supabasePresetId } : {}),
  };
  const { data: inserted, error } = await trx.from('transaction').insert(payload).select('id').single();
  if (error) { console.error("syncTransaction error:", error); return null; }
  const supabaseId = inserted?.id as number ?? null;
  // Store supabase_id for deduplication
  await db.transactions.update(id, { synced: true, supabase_id: supabaseId });
  return supabaseId;
}

// supabaseTransactionId: Supabase transaction ID to use instead of local Dexie transaction_id
export async function syncTransactionItem(item: TransactionItem, supabaseTransactionId?: number): Promise<number | null> {
  if (!navigator.onLine || !item.id) return null;
  const { id, synced, transaction_id, ...data } = item;
  const payload = {
    ...data,
    transaction_id: supabaseTransactionId ?? transaction_id,
  };
  const { data: inserted, error } = await trx.from('transaction_item').insert(payload).select('id').single();
  if (error) { console.error("syncTransactionItem error:", error); return null; }
  await db.transaction_item.update(id, { synced: true });
  return inserted?.id as number ?? null;
}

export async function syncPending() {
  if (!navigator.onLine) return;

  const [customers, presets, transactions, transactionItems, orderGroups, groupMembers] = await Promise.all([
    db.customer.toArray().then(arr => arr.filter(c => !c.synced)),
    db.preset_customer.toArray().then(arr => arr.filter(p => !p.synced)),
    db.transactions.toArray().then(arr => arr.filter(t => !t.synced)),
    db.transaction_item.toArray().then(arr => arr.filter(i => !i.synced)),
    db.order_group.toArray().then(arr => arr.filter(g => !g.synced)),
    db.group_member.toArray().then(arr => arr.filter(m => !m.synced)),
  ]);

  if (!customers.length && !presets.length && !transactions.length && !transactionItems.length && !orderGroups.length && !groupMembers.length) return;

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

  // dexie transaction id → supabase transaction id
  const transactionIdMap = new Map<number, number>();
  for (const t of transactions) {
    const supabaseCustId = customerIdMap.get(t.customer_id);
    const supabasePresetId = t.preset_id ? presetIdMap.get(t.preset_id) : undefined;
    const supabaseTrxId = await syncTransaction(t, supabaseCustId, supabasePresetId);
    if (supabaseTrxId && t.id) transactionIdMap.set(t.id, supabaseTrxId);
  }

  // Sync transaction items
  for (const item of transactionItems) {
    const supabaseTrxId = transactionIdMap.get(item.transaction_id);
    // If we don't have the supabase transaction ID yet, try to look it up
    let resolvedSupabaseTrxId = supabaseTrxId;
    if (!resolvedSupabaseTrxId) {
      // The transaction might have been synced in a previous session
      const localTrx = await db.transactions.get(item.transaction_id);
      if (localTrx?.synced && localTrx.customer_id) {
        // Try to find the supabase transaction by customer and created_at
        const customer = await db.customer.get(localTrx.customer_id);
        if (customer?.name) {
          const { data: custData } = await trx.from('customer').select('id').eq('name', customer.name).single();
          if (custData?.id && localTrx.created_at) {
            const { data: trxData } = await trx.from('transaction').select('id').eq('customer_id', custData.id).eq('created_at', localTrx.created_at.toISOString()).single();
            if (trxData?.id) resolvedSupabaseTrxId = trxData.id as number;
          }
        }
      }
    }
    await syncTransactionItem(item, resolvedSupabaseTrxId);
  }

  // Sync order groups using UUID-based matching
  for (const g of orderGroups) {
    const result = await syncOrderGroup(g);
    if (result.success) {
      console.log(`Synced order_group ${g.uuid}, ref_number: ${result.ref_number}`);
    }
  }

  // Sync group members using UUID-based matching
  for (const m of groupMembers) {
    const result = await syncGroupMember(m);
    if (result.success) {
      console.log(`Synced group_member ${m.uuid}, ref_number: ${result.ref_number}`);
    }
  }
}

// ─── Material / Expense sync helpers ─────────────────────────────────────────

export async function syncMaterial(m: Material): Promise<number | null> {
  if (!navigator.onLine || !m.id) return null;
  const { id, synced, ...data } = m;
  const { data: inserted, error } = await trx.from('material').insert(data).select('id').single();
  if (error) { console.error('syncMaterial error:', error); return null; }
  await db.material.update(id, { synced: true });
  return inserted.id as number;
}

export async function syncPurchase(p: Purchase): Promise<number | null> {
  if (!navigator.onLine || !p.id) return null;
  const { id, synced, ...data } = p;
  const { data: inserted, error } = await trx.from('purchase').insert(data).select('id').single();
  if (error) { console.error('syncPurchase error:', error); return null; }
  await db.purchase.update(id, { synced: true });
  return inserted.id as number;
}

export async function syncPurchaseItem(item: PurchaseItem, supabasePurchaseId?: number, supabaseMaterialId?: number): Promise<void> {
  if (!navigator.onLine || !item.id) return;
  const { id, synced, ...data } = item;
  const payload = {
    ...data,
    ...(supabasePurchaseId ? { purchase_id: supabasePurchaseId } : {}),
    ...(supabaseMaterialId ? { material_id: supabaseMaterialId } : {}),
  };
  const { error } = await trx.from('purchase_item').insert(payload);
  if (error) { console.error('syncPurchaseItem error:', error); return; }
  await db.purchase_item.update(id, { synced: true });
}

export async function syncMaterialUsage(u: MaterialUsage, supabaseTransactionId?: number, supabaseMaterialId?: number): Promise<void> {
  if (!navigator.onLine || !u.id) return;
  const { id, synced, ...data } = u;
  const payload = {
    ...data,
    ...(supabaseTransactionId ? { transaction_id: supabaseTransactionId } : {}),
    ...(supabaseMaterialId ? { material_id: supabaseMaterialId } : {}),
  };
  const { error } = await trx.from('material_usage').insert(payload);
  if (error) { console.error('syncMaterialUsage error:', error); return; }
  await db.material_usage.update(id, { synced: true });
}

// ─── Weighted average cost recalculation ─────────────────────────────────────
// Call this after every new purchase_item is saved locally.
// Returns the updated avg_cost_per_unit.
export async function recalcMaterialCost(materialId: number, newQty: number, newUnitPrice: number): Promise<number> {
  const mat = await db.material.get(materialId);
  if (!mat) return newUnitPrice;

  const oldStock = mat.current_stock ?? 0;
  const oldAvg   = mat.avg_cost_per_unit ?? 0;

  const newAvg   = oldStock + newQty > 0
    ? (oldStock * oldAvg + newQty * newUnitPrice) / (oldStock + newQty)
    : newUnitPrice;
  const newStock = oldStock + newQty;

  await db.material.update(materialId, {
    current_stock: newStock,
    avg_cost_per_unit: newAvg,
    synced: false,
  });

  // Push updated stock & avg to Supabase if online
  if (navigator.onLine) {
    await trx.from('material').update({
      current_stock: newStock,
      avg_cost_per_unit: newAvg,
    }).eq('id', materialId);
    await db.material.update(materialId, { synced: true });
  }

  return newAvg;
}

// Deduct stock after recording material usage for an order.
export async function deductMaterialStock(materialId: number, qtyUsed: number): Promise<void> {
  const mat = await db.material.get(materialId);
  if (!mat) return;
  const newStock = Math.max(0, (mat.current_stock ?? 0) - qtyUsed);
  await db.material.update(materialId, { current_stock: newStock, synced: false });
  if (navigator.onLine) {
    await trx.from('material').update({ current_stock: newStock }).eq('id', materialId);
    await db.material.update(materialId, { synced: true });
  }
}

// ─── Worker sync helpers ──────────────────────────────────────────────────────

export async function syncWorker(w: Worker): Promise<number | null> {
  if (!navigator.onLine || !w.id) return null;
  const { id, synced, ...data } = w;
  const { data: inserted, error } = await trx.from('worker').insert(data).select('id').single();
  if (error) { console.error('syncWorker error:', error); return null; }
  await db.worker.update(id, { synced: true });
  return inserted.id as number;
}

// Fetch all active workers — used by WorkerAssignModal.
// Tries Supabase first, falls back to Dexie.
export async function loadActiveWorkers(): Promise<Worker[]> {
  if (navigator.onLine) {
    const { data, error } = await trx.from('worker').select('*').eq('active', true).order('name');
    if (!error && data) return data as Worker[];
  }
  return db.worker.where('active').equals(1).sortBy('name');
}

// Load workload counts: number of 'Jahit' orders per worker_id.
// Returns a Map<worker_id, count>.
export async function loadWorkerWorkload(): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (navigator.onLine) {
    const { data } = await trx
      .from('transaction')
      .select('worker_id')
      .eq('status', 'Jahit')
      .not('worker_id', 'is', null);
    for (const row of (data ?? []) as any[]) {
      if (row.worker_id) map.set(row.worker_id, (map.get(row.worker_id) ?? 0) + 1);
    }
    // Also count group members in Jahit status
    const { data: groupData } = await trx
      .from('group_member')
      .select('worker_id')
      .eq('status', 'Jahit')
      .not('worker_id', 'is', null);
    for (const row of (groupData ?? []) as any[]) {
      if (row.worker_id) map.set(row.worker_id, (map.get(row.worker_id) ?? 0) + 1);
    }
  } else {
    const rows = await db.transactions.where('status').equals('Jahit').toArray();
    for (const t of rows) {
      if (t.worker_id) map.set(t.worker_id, (map.get(t.worker_id) ?? 0) + 1);
    }
    const groupRows = await db.group_member.where('status').equals('Jahit').toArray();
    for (const m of groupRows) {
      if (m.worker_id) map.set(m.worker_id, (map.get(m.worker_id) ?? 0) + 1);
    }
  }
  return map;
}

// ─── Order Group sync helpers ─────────────────────────────────────────────────

export interface SyncResult {
  success: boolean;
  id?: number;
  ref_number?: number;
  error?: string;
}

export async function syncOrderGroup(g: OrderGroup): Promise<SyncResult> {
  if (!navigator.onLine) return { success: true }; // Will sync later
  if (!g.id || !g.uuid) return { success: false, error: 'ID atau UUID tidak valid' };
  
  // Check if record with this UUID already exists in Supabase
  const { data: existing } = await trx.from('order_group').select('id, ref_number').eq('uuid', g.uuid).single();
  
  if (existing) {
    // Record exists - update it
    const { id, synced, ref_number, ...updateData } = g;
    const { error } = await trx.from('order_group').update(updateData).eq('uuid', g.uuid);
    
    if (error) {
      console.error('syncOrderGroup update error:', error);
      return { success: false, error: error.message || 'Gagal update ke server' };
    }
    
    // Update local record with server ref_number
    await db.order_group.update(id, { synced: true, ref_number: existing.ref_number });
    return { success: true, id: existing.id, ref_number: existing.ref_number };
  }
  
  // New record - insert it
  const { id, synced, ref_number, ...insertData } = g;
  const { data: inserted, error } = await trx.from('order_group').insert(insertData).select('id, ref_number').single();
  
  if (error) {
    console.error('syncOrderGroup insert error:', error);
    const errorMsg = error.code === '23505' 
      ? 'Data sudah ada di server (duplikat)' 
      : error.message || 'Gagal sinkronisasi ke server';
    return { success: false, error: errorMsg };
  }
  
  // Update local record with server ref_number
  await db.order_group.update(id, { synced: true, ref_number: inserted.ref_number });
  return { success: true, id: inserted.id as number, ref_number: inserted.ref_number };
}

export async function syncGroupMember(m: GroupMember): Promise<SyncResult> {
  if (!navigator.onLine) return { success: true }; // Will sync later
  if (!m.id || !m.uuid) return { success: false, error: 'ID atau UUID tidak valid' };
  
  // Find the parent group's Supabase ID using group_uuid
  const { data: parentGroup } = await trx.from('order_group').select('id').eq('uuid', m.group_uuid).single();
  if (!parentGroup && navigator.onLine) {
    return { success: false, error: 'Grup induk belum tersinkronisasi' };
  }
  
  // Check if record with this UUID already exists in Supabase
  const { data: existing } = await trx.from('group_member').select('id, ref_number').eq('uuid', m.uuid).single();
  
  if (existing) {
    // Record exists - update it
    const { id, synced, ref_number, group_id, ...updateData } = m;
    const payload = { ...updateData, group_id: parentGroup?.id };
    const { error } = await trx.from('group_member').update(payload).eq('uuid', m.uuid);
    
    if (error) {
      console.error('syncGroupMember update error:', error);
      return { success: false, error: error.message || 'Gagal update anggota ke server' };
    }
    
    await db.group_member.update(id, { synced: true, ref_number: existing.ref_number });
    return { success: true, id: existing.id, ref_number: existing.ref_number };
  }
  
  // New record - insert it
  const { id, synced, ref_number, group_id, ...insertData } = m;
  const payload = { ...insertData, group_id: parentGroup?.id };
  const { data: inserted, error } = await trx.from('group_member').insert(payload).select('id, ref_number').single();
  
  if (error) {
    console.error('syncGroupMember insert error:', error);
    const errorMsg = error.code === '23505' 
      ? 'Anggota sudah ada di server (duplikat)' 
      : error.message || 'Gagal sinkronisasi anggota ke server';
    return { success: false, error: errorMsg };
  }
  
  await db.group_member.update(id, { synced: true, ref_number: inserted.ref_number });
  return { success: true, id: inserted.id as number, ref_number: inserted.ref_number };
}

export async function syncGroupMaterialUsage(u: MaterialUsage, supabaseGroupId?: number, supabaseMaterialId?: number): Promise<SyncResult> {
  if (!navigator.onLine) return { success: true };
  if (!u.id) return { success: false, error: 'ID tidak valid' };
  
  const { id, synced, ...data } = u;
  const payload = {
    ...data,
    transaction_id: null,
    ...(supabaseGroupId ? { group_id: supabaseGroupId } : {}),
    ...(supabaseMaterialId ? { material_id: supabaseMaterialId } : {}),
  };
  const { error } = await trx.from('material_usage').insert(payload);
  
  if (error) {
    console.error('syncGroupMaterialUsage error:', error);
    const errorMsg = error.code === '23505' 
      ? 'Data penggunaan bahan sudah ada (duplikat)' 
      : error.message || 'Gagal sinkronisasi penggunaan bahan';
    return { success: false, error: errorMsg };
  }
  
  await db.material_usage.update(id, { synced: true });
  return { success: true };
}
