import { useState, useEffect } from 'react';
import { db, recalcMaterialCost } from '@/lib/db';
import type { Material, Purchase, PurchaseItem } from '@/lib/db';
import { trx } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from '@/lib/currency';

interface PurchaseRow {
  material_id: number | null;
  quantity: string;
  unit_price: string;
}

interface PurchaseHistoryEntry {
  id: number;
  purchased_at: string;
  notes?: string;
  items: {
    material_name: string;
    unit: string;
    quantity: number;
    unit_price: number;
  }[];
  total: number;
}

const emptyRow = (): PurchaseRow => ({ material_id: null, quantity: '', unit_price: '' });

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function ExpenseForm() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [purchasedAt, setPurchasedAt] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<PurchaseRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PurchaseHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    loadMaterials();
    loadHistory();
  }, []);

  async function loadMaterials() {
    if (navigator.onLine) {
      const { data, error } = await trx.from('material').select('*').order('name');
      if (!error && data) { setMaterials(data as Material[]); return; }
    }
    const local = await db.material.orderBy('name').toArray();
    setMaterials(local);
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      // Only today's purchases, max 5
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      let entries: PurchaseHistoryEntry[] = [];

      if (navigator.onLine) {
        const { data: purchases } = await trx
          .from('purchase')
          .select('id, purchased_at, notes')
          .gte('purchased_at', todayStart.toISOString())
          .lte('purchased_at', todayEnd.toISOString())
          .order('purchased_at', { ascending: false })
          .limit(5);

        if (purchases && purchases.length > 0) {
          const purchaseIds = (purchases as any[]).map((p: any) => p.id);
          const { data: items } = await trx
            .from('purchase_item')
            .select('purchase_id, quantity, unit_price, material_id')
            .in('purchase_id', purchaseIds);

          const { data: mats } = await trx.from('material').select('id, name, unit');
          const matMap = new Map<number, { name: string; unit: string }>(
            (mats ?? []).map((m: any) => [m.id, { name: m.name, unit: m.unit }])
          );

          entries = (purchases as any[]).map((p: any) => {
            const pItems = ((items ?? []) as any[]).filter((i: any) => i.purchase_id === p.id);
            const entryItems = pItems.map((i: any) => ({
              material_name: matMap.get(i.material_id)?.name ?? '—',
              unit: matMap.get(i.material_id)?.unit ?? '',
              quantity: Number(i.quantity),
              unit_price: Number(i.unit_price),
            }));
            return {
              id: p.id,
              purchased_at: p.purchased_at,
              notes: p.notes,
              items: entryItems,
              total: entryItems.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0),
            };
          });
        }
      } else {
        // Offline: build from Dexie - today only, max 5
        const allPurchases = await db.purchase.orderBy('purchased_at').reverse().toArray();
        const todayPurchases = allPurchases
          .filter(p => {
            const d = p.purchased_at instanceof Date ? p.purchased_at : new Date(p.purchased_at as any);
            return d >= todayStart && d <= todayEnd;
          })
          .slice(0, 5);

        const allItems = await db.purchase_item.toArray();
        const allMats = await db.material.toArray();
        const matMap = new Map(allMats.map(m => [m.id!, m]));

        entries = todayPurchases.map(p => {
          const pItems = allItems.filter(i => i.purchase_id === p.id!);
          const entryItems = pItems.map(i => ({
            material_name: matMap.get(i.material_id)?.name ?? '—',
            unit: matMap.get(i.material_id)?.unit ?? '',
            quantity: i.quantity,
            unit_price: i.unit_price,
          }));
          return {
            id: p.id!,
            purchased_at: (p.purchased_at instanceof Date
              ? p.purchased_at.toISOString()
              : String(p.purchased_at)),
            notes: p.notes,
            items: entryItems,
            total: entryItems.reduce((s, i) => s + i.quantity * i.unit_price, 0),
          };
        });
      }

      setHistory(entries);
    } catch (err) {
      console.error('loadHistory error:', err);
    } finally {
      setLoadingHistory(false);
    }
  }

  function addRow() {
    setRows(r => [...r, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows(r => r.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: keyof PurchaseRow, value: string | number | null) {
    setRows(r => r.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }

  async function handleSave() {
    // Validate
    const validRows = rows.filter(r => r.material_id && r.quantity && r.unit_price);
    if (validRows.length === 0) {
      toast.error('Tambahkan minimal satu bahan dengan qty dan harga.');
      return;
    }
    for (const r of validRows) {
      if (parseFloat(r.quantity) <= 0) { toast.error('Jumlah harus lebih dari 0.'); return; }
      if (parseCurrencyInput(r.unit_price) <= 0) { toast.error('Harga harus lebih dari 0.'); return; }
    }

    setSaving(true);
    try {
      // 1. Create purchase record locally
      const purchasePayload: Omit<Purchase, 'id'> = {
        purchased_at: new Date(purchasedAt),
        notes: notes.trim() || undefined,
        synced: false,
      };
      const localPurchaseId = await db.purchase.add(purchasePayload);

      // 2. Sync purchase to Supabase if online → get Supabase ID
      let supabasePurchaseId: number | null = null;
      if (navigator.onLine) {
        const { synced: _s, ...sp } = purchasePayload as any;
        const { data: ins } = await trx.from('purchase').insert(sp).select('id').single();
        if (ins) {
          supabasePurchaseId = (ins as any).id;
          await db.purchase.update(localPurchaseId, { synced: true });
        }
      }

      // 3. For each row: save purchase_item locally + update material avg cost & stock
      for (const row of validRows) {
        const qty = parseFloat(row.quantity);
        const price = parseCurrencyInput(row.unit_price);
        const matId = row.material_id!;

        const itemPayload: Omit<PurchaseItem, 'id'> = {
          purchase_id: localPurchaseId,
          material_id: matId,
          quantity: qty,
          unit_price: price,
          synced: false,
        };
        const localItemId = await db.purchase_item.add(itemPayload);

        // Recalculate avg cost & update stock in Dexie (+ Supabase if online)
        await recalcMaterialCost(matId, qty, price);

        // Sync purchase_item to Supabase
        if (navigator.onLine && supabasePurchaseId) {
          // Get Supabase material id (material is synced via id directly)
          const mat = await db.material.get(matId);
          const { synced: _s, ...ip } = itemPayload as any;
          const supabaseItemPayload = {
            ...ip,
            purchase_id: supabasePurchaseId,
          };
          const { error: itemErr } = await trx.from('purchase_item').insert(supabaseItemPayload);
          if (!itemErr) await db.purchase_item.update(localItemId, { synced: true });
        }
      }

      toast.success('Pembelian berhasil dicatat & stok diperbarui.');
      setPurchasedAt(todayISO());
      setNotes('');
      setRows([emptyRow()]);
      loadHistory();
    } catch (err) {
      console.error('handleSave error:', err);
      toast.error('Gagal menyimpan pembelian.');
    } finally {
      setSaving(false);
    }
  }

  const grandTotal = rows.reduce((sum, r) => {
    const qty = parseFloat(r.quantity) || 0;
    const price = parseCurrencyInput(r.unit_price) || 0;
    return sum + qty * price;
  }, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">Catat Pengeluaran</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Satu sesi belanja = satu kali pencatatan. Stok bahan akan diperbarui otomatis.
        </p>
      </div>

      {materials.length === 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <svg className="shrink-0 mt-0.5 text-amber-500" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p className="text-sm text-amber-700">
            Belum ada bahan terdaftar.{' '}
            <a href="/materials" className="underline font-medium">Tambah bahan</a> terlebih dahulu.
          </p>
        </div>
      )}

      {/* Form Card */}
      <Card className="py-3">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-slate-700">Sesi Belanja Baru</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Date & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tanggal Belanja</Label>
              <Input
                type="date"
                value={purchasedAt}
                onChange={e => setPurchasedAt(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label>Catatan (opsional)</Label>
              <Input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Contoh: Beli di toko Sinar Jaya"
                className="h-11"
              />
            </div>
          </div>

          {/* Item rows */}
          <div className="space-y-3">
            <Label>Daftar Bahan yang Dibeli</Label>

            {/* Header row - desktop only */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_120px_160px_36px] gap-3 px-1">
              <span className="text-xs text-slate-400 font-medium">Bahan</span>
              <span className="text-xs text-slate-400 font-medium">Jumlah</span>
              <span className="text-xs text-slate-400 font-medium">Harga / Satuan (Rp)</span>
              <span></span>
            </div>

            {rows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_160px_36px] gap-3 items-center p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-lg sm:rounded-none">
                {/* Material select */}
                <Select
                  value={row.material_id ? String(row.material_id) : ''}
                  onValueChange={v => updateRow(idx, 'material_id', Number(v))}
                >
                  <SelectTrigger className="h-11 bg-white">
                    <SelectValue placeholder="Pilih bahan..." />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}
                        <span className="ml-1 text-slate-400 text-xs">({m.unit})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Quantity */}
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  value={row.quantity}
                  onChange={e => updateRow(idx, 'quantity', e.target.value)}
                  placeholder="0"
                  className="h-11 bg-white"
                />

                {/* Unit price */}
                <Input
                  type="text"
                  inputMode="numeric"
                  value={row.unit_price}
                  onChange={e => updateRow(idx, 'unit_price', formatCurrencyInput(e.target.value))}
                  placeholder="0"
                  className="h-11 bg-white"
                />

                {/* Remove row */}
                <button
                  onClick={() => removeRow(idx)}
                  disabled={rows.length === 1}
                  className="flex items-center justify-center w-9 h-9 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Hapus baris"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}

            <Button
              variant="outline"
              onClick={addRow}
              className="w-full border-dashed text-slate-500 hover:text-indigo-600 hover:border-indigo-400"
            >
              + Tambah Bahan
            </Button>
          </div>

          {/* Grand total & save */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-slate-500">Total Pengeluaran Sesi Ini</p>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(grandTotal)}</p>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || materials.length === 0}
              className="w-full sm:w-auto h-12 px-8 bg-indigo-600 hover:bg-indigo-700 font-semibold"
            >
              {saving ? 'Menyimpan...' : 'Simpan Pembelian'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Purchase History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-700">Pembelian Hari Ini</h3>
          <a href="/expense-history" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
            Lihat semua →
          </a>
        </div>

        {loadingHistory ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Belum ada riwayat pembelian.</p>
        ) : (
          <div className="space-y-3">
            {history.map(entry => {
              const date = new Date(entry.purchased_at);
              const dateStr = date.toLocaleDateString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric',
              });
              return (
                <Card key={entry.id} className="py-3 overflow-hidden">
                  <div className="flex items-start justify-between px-5 py-2 border-b">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{dateStr}</p>
                      {entry.notes && (
                        <p className="text-xs text-slate-500 mt-0.5">{entry.notes}</p>
                      )}
                    </div>
                    <span className="text-sm font-bold text-indigo-600">
                      {formatCurrency(entry.total)}
                    </span>
                  </div>
                  <div className="px-5 py-3 space-y-1.5">
                    {entry.items.length === 0 ? (
                      <p className="text-xs text-slate-400">Tidak ada item</p>
                    ) : (
                      entry.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">
                            {item.material_name}
                            <span className="text-slate-400 ml-1">
                              × {item.quantity} {item.unit}
                            </span>
                          </span>
                          <span className="text-slate-600 font-medium">
                            {formatCurrency(item.quantity * item.unit_price)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
