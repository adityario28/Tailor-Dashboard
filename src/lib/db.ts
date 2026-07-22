import Dexie, { type Table } from 'dexie';
import { trx } from './supabase';

export type OrderStatus = 'Cuci Bahan' | 'Potong Bahan' | 'Jahit' | 'Finishing' | 'Siap Diambil';
export const STATUS_FLOW: OrderStatus[] = ['Cuci Bahan', 'Potong Bahan', 'Jahit', 'Finishing', 'Siap Diambil'];

export type PaymentStatus = 'belum_bayar' | 'dp' | 'lunas';

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
  transaction_id: number;
  material_id: number;
  quantity_used: number;
  cost_per_unit_snapshot: number;
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
  amount_paid?: number;
  payment_status?: PaymentStatus;
  created_at?: Date;
  synced?: boolean;
}

export class TailorDatabase extends Dexie {
  customer!: Table<Customer>;
  preset_customer!: Table<PresetCustomer>;
  transactions!: Table<Transaction>;
  draft!: Table<Draft>;
  material!: Table<Material>;
  purchase!: Table<Purchase>;
  purchase_item!: Table<PurchaseItem>;
  material_usage!: Table<MaterialUsage>;

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
    
    // Map the 'transaction' table to 'transactions' property to avoid conflict
    this.transactions = this.table('transaction');
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
  await db.transactions.update(id, { synced: true });
}

export async function syncPending() {
  if (!navigator.onLine) return;

  const [customers, presets, transactions] = await Promise.all([
    db.customer.toArray().then(arr => arr.filter(c => !c.synced)),
    db.preset_customer.toArray().then(arr => arr.filter(p => !p.synced)),
    db.transactions.toArray().then(arr => arr.filter(t => !t.synced)),
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
