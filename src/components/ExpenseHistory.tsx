import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/db';
import { trx } from '@/lib/supabase';
import { formatCurrency } from '@/lib/currency';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortPanel } from '@/components/SortPanel';
import type { SortEntry } from '@/components/SortPanel';

// ─── Period ───────────────────────────────────────────────────────────────────
type Period = 'today' | '3d' | '7d' | '30d' | '60d';
const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: 'today', label: 'Hari Ini', days: 0 },
  { key: '3d',    label: '3H',       days: 3 },
  { key: '7d',    label: '7H',       days: 7 },
  { key: '30d',   label: '30H',      days: 30 },
  { key: '60d',   label: '60H',      days: 60 },
];

function getPeriodStart(period: Period): Date {
  const now = new Date();
  if (period === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }
  const days = PERIODS.find(p => p.key === period)!.days;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getPeriodEnd(period: Period): Date {
  const now = new Date();
  if (period === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  }
  return now;
}

function inPeriod(iso: string, period: Period): boolean {
  const d = new Date(iso);
  return d >= getPeriodStart(period) && d <= getPeriodEnd(period);
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface PurchaseItem {
  material_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface PurchaseRow {
  id: number;
  purchased_at: string;
  notes: string;
  total: number;
  items: PurchaseItem[];
}

// ─── Sort ─────────────────────────────────────────────────────────────────────
type SortKey = 'purchased_at' | 'notes' | 'items' | 'total';
type SortDir = 'asc' | 'desc';

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'purchased_at', label: 'Tanggal' },
  { key: 'notes',        label: 'Toko' },
  { key: 'items',        label: 'Jumlah Item' },
  { key: 'total',        label: 'Total' },
];

const DEFAULT_SORT: SortEntry<SortKey>[] = [{ key: 'purchased_at', dir: 'desc' }];

function SortIcon({ col, stack }: { col: SortKey; stack: SortEntry[] }) {
  const idx   = stack.findIndex(s => s.key === col);
  const entry = stack[idx];
  const active = idx !== -1;
  return (
    <span className="inline-flex items-center ml-1 gap-0.5 align-middle">
      <span className="inline-flex flex-col gap-px">
        <svg width="8" height="5" viewBox="0 0 8 5" className={active && entry.dir === 'asc' ? 'text-indigo-600' : 'text-slate-300'} fill="currentColor">
          <path d="M4 0L8 5H0z"/>
        </svg>
        <svg width="8" height="5" viewBox="0 0 8 5" className={active && entry.dir === 'desc' ? 'text-indigo-600' : 'text-slate-300'} fill="currentColor">
          <path d="M4 5L0 0H8z"/>
        </svg>
      </span>
      {active && stack.length > 1 && (
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold leading-none">
          {idx + 1}
        </span>
      )}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

const PAGE_SIZES = [10, 25, 50, 100];

// ─── Main component ───────────────────────────────────────────────────────────
export default function ExpenseHistory() {
  const [rows, setRows]       = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod]   = useState<Period>('30d');
  const [search, setSearch]   = useState('');
  const [sortStack, setSortStack] = useState<SortEntry<SortKey>[]>(DEFAULT_SORT);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { setPage(1); }, [period, search, sortStack]);

  function handleSort(key: SortKey, e: React.MouseEvent) {
    setPage(1);
    if (e.shiftKey) {
      setSortStack(prev => {
        const idx = prev.findIndex(s => s.key === key);
        if (idx === -1) return [...prev, { key, dir: 'asc' as SortDir }];
        if (prev[idx].dir === 'asc') return prev.map((s, i) => i === idx ? { ...s, dir: 'desc' as SortDir } : s);
        return prev.filter((_, i) => i !== idx);
      });
    } else {
      setSortStack(prev => {
        const existing = prev.find(s => s.key === key);
        if (prev.length === 1 && existing) return [{ key, dir: (existing.dir === 'asc' ? 'desc' : 'asc') as SortDir }];
        return [{ key, dir: 'desc' as SortDir }];
      });
    }
  }

  async function loadAll() {
    setLoading(true);
    try {
      let result: PurchaseRow[] = [];

      if (navigator.onLine) {
        const { data: purchases } = await trx
          .from('purchase')
          .select('id, purchased_at, notes')
          .order('purchased_at', { ascending: false });

        if (purchases && (purchases as any[]).length > 0) {
          const purchaseIds = (purchases as any[]).map((p: any) => p.id);
          const { data: items } = await trx
            .from('purchase_item')
            .select('purchase_id, quantity, unit_price, material_id')
            .in('purchase_id', purchaseIds);
          const { data: mats } = await trx.from('material').select('id, name, unit');
          const matMap = new Map<number, { name: string; unit: string }>(
            (mats ?? []).map((m: any) => [m.id, { name: m.name, unit: m.unit }])
          );
          result = (purchases as any[]).map((p: any) => {
            const pItems = ((items ?? []) as any[])
              .filter((i: any) => i.purchase_id === p.id)
              .map((i: any) => ({
                material_name: matMap.get(i.material_id)?.name ?? '—',
                unit: matMap.get(i.material_id)?.unit ?? '',
                quantity: Number(i.quantity),
                unit_price: Number(i.unit_price),
                subtotal: Number(i.quantity) * Number(i.unit_price),
              }));
            return {
              id: p.id,
              purchased_at: p.purchased_at,
              notes: p.notes ?? '',
              total: pItems.reduce((s: number, i: any) => s + i.subtotal, 0),
              items: pItems,
            };
          });
        }
      } else {
        const purchases = await db.purchase.orderBy('purchased_at').reverse().toArray();
        const allItems  = await db.purchase_item.toArray();
        const allMats   = await db.material.toArray();
        const matMap    = new Map(allMats.map(m => [m.id!, m]));
        result = purchases.map(p => {
          const pItems = allItems.filter(i => i.purchase_id === p.id!).map(i => ({
            material_name: matMap.get(i.material_id)?.name ?? '—',
            unit: matMap.get(i.material_id)?.unit ?? '',
            quantity: i.quantity,
            unit_price: i.unit_price,
            subtotal: i.quantity * i.unit_price,
          }));
          return {
            id: p.id!,
            purchased_at: p.purchased_at instanceof Date
              ? p.purchased_at.toISOString() : String(p.purchased_at),
            notes: p.notes ?? '',
            total: pItems.reduce((s, i) => s + i.subtotal, 0),
            items: pItems,
          };
        });
      }
      setRows(result);
    } catch (err) {
      console.error('ExpenseHistory loadAll error:', err);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function compareFn(a: PurchaseRow, b: PurchaseRow, key: SortKey): number {
    switch (key) {
      case 'purchased_at': return new Date(a.purchased_at).getTime() - new Date(b.purchased_at).getTime();
      case 'notes':        return a.notes.localeCompare(b.notes);
      case 'items':        return a.items.length - b.items.length;
      case 'total':        return a.total - b.total;
      default: return 0;
    }
  }

  // ─── Pipeline: period → search → multi-sort ─────────────────────────────────
  const processed = useMemo(() => {
    let data = rows.filter(r => inPeriod(r.purchased_at, period));

    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(r =>
        formatDate(r.purchased_at).toLowerCase().includes(q) ||
        r.notes.toLowerCase().includes(q)
      );
    }

    if (sortStack.length > 0) {
      data = [...data].sort((a, b) => {
        for (const { key, dir } of sortStack) {
          const cmp = compareFn(a, b, key);
          if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
        }
        return 0;
      });
    }

    return data;
  }, [rows, period, search, sortStack]);

  const totalPages  = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage    = Math.min(page, totalPages);
  const paginated   = processed.slice((safePage - 1) * pageSize, safePage * pageSize);
  const grandTotal  = processed.reduce((s, r) => s + r.total, 0);

  // ─── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <a href="/expenses" className="text-slate-500 hover:text-slate-900 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </a>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Riwayat Pengeluaran</h1>
        </div>
        <div className="space-y-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <a href="/expenses" className="text-slate-500 hover:text-slate-900 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </a>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Riwayat Pengeluaran</h1>
            <p className="text-sm text-slate-500 mt-0.5">{processed.length} sesi belanja</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                period === p.key
                  ? 'bg-white text-indigo-600 shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 shadow-xs px-5 py-4">
          <p className="text-xs font-medium text-slate-500">Total Sesi Belanja</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{processed.length}</p>
        </div>
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 shadow-xs px-5 py-4">
          <p className="text-xs font-medium text-slate-500">Total Pengeluaran</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{formatCurrency(grandTotal)}</p>
        </div>
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 shadow-xs px-5 py-4 col-span-2 sm:col-span-1">
          <p className="text-xs font-medium text-slate-500">Rata-rata per Sesi</p>
          <p className="text-2xl font-bold text-slate-700 mt-1">
            {processed.length > 0 ? formatCurrency(grandTotal / processed.length) : '—'}
          </p>
        </div>
      </div>

      {/* Table card */}
      <div className="rounded-xl bg-white ring-1 ring-foreground/10 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-base font-semibold text-slate-700">Semua Sesi Pembelian</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Klik tombol <strong>+</strong> untuk melihat detail item per sesi
          </p>
        </div>

        {/* Toolbar: search + sort left, page size right */}
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b bg-slate-50/50">
          <div className="flex items-center gap-2 w-full max-w-sm">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari tanggal, toko..."
                className="pl-8 h-9 text-sm"
              />
            </div>
            <SortPanel stack={sortStack} onChange={setSortStack} columns={SORT_COLUMNS} defaultStack={DEFAULT_SORT} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-500 hidden sm:block">Tampilkan</span>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-9 w-20 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-slate-500 hidden sm:block">baris</span>
          </div>
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="w-12 px-4"></TableHead>
              <TableHead className="px-4">Tanggal</TableHead>
              <TableHead className="px-4">Toko</TableHead>
              <TableHead className="px-4">Item</TableHead>
              <TableHead className="px-4 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-slate-400">
                  {search ? 'Tidak ada hasil yang cocok.' : 'Belum ada riwayat pembelian.'}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map(row => (
                <>
                  <TableRow key={row.id} className={expanded.has(row.id) ? 'bg-slate-50' : ''}>
                    <TableCell className="px-4 w-12">
                      <button
                        onClick={() => toggleExpand(row.id)}
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold transition-all ${
                          expanded.has(row.id)
                            ? 'bg-indigo-600 text-white'
                            : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                        }`}
                        aria-label={expanded.has(row.id) ? 'Tutup detail' : 'Lihat detail'}
                      >
                        {expanded.has(row.id) ? '−' : '+'}
                      </button>
                    </TableCell>
                    <TableCell className="px-4 font-medium text-slate-800">
                      {formatDate(row.purchased_at)}
                    </TableCell>
                    <TableCell className="px-4 text-slate-600">
                      {row.notes || <span className="text-slate-300">—</span>}
                    </TableCell>
                    <TableCell className="px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {row.items.length} item
                      </span>
                    </TableCell>
                    <TableCell className="px-4 text-right font-semibold text-indigo-600">
                      {formatCurrency(row.total)}
                    </TableCell>
                  </TableRow>

                  {/* Expand row */}
                  {expanded.has(row.id) && (
                    <TableRow key={`${row.id}-detail`} className="hover:bg-transparent">
                      <TableCell colSpan={5} className="px-6 py-0 bg-slate-50 border-b">
                        <div className="py-4">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                            Detail Item
                            {row.notes && (
                              <span className="ml-2 normal-case font-normal text-slate-400">({row.notes})</span>
                            )}
                          </p>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-2 pr-4 font-medium text-slate-400 text-xs uppercase tracking-wide">Bahan</th>
                                <th className="text-left py-2 pr-4 font-medium text-slate-400 text-xs uppercase tracking-wide">Satuan</th>
                                <th className="text-right py-2 pr-4 font-medium text-slate-400 text-xs uppercase tracking-wide">Jumlah</th>
                                <th className="text-right py-2 pr-4 font-medium text-slate-400 text-xs uppercase tracking-wide">Harga/Satuan</th>
                                <th className="text-right py-2 font-medium text-slate-400 text-xs uppercase tracking-wide">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.items.map((item, i) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="py-2 pr-4 font-medium text-slate-700">{item.material_name}</td>
                                  <td className="py-2 pr-4 text-slate-500">{item.unit}</td>
                                  <td className="py-2 pr-4 text-right text-slate-600">{item.quantity}</td>
                                  <td className="py-2 pr-4 text-right text-slate-600">{formatCurrency(item.unit_price)}</td>
                                  <td className="py-2 text-right font-medium text-slate-700">{formatCurrency(item.subtotal)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan={4} className="py-2 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Total</td>
                                <td className="py-2 text-right font-bold text-indigo-600">{formatCurrency(row.total)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t bg-slate-50/50">
          <p className="text-xs text-slate-400">
            {processed.length === 0
              ? 'Tidak ada data'
              : `Menampilkan ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, processed.length)} dari ${processed.length} sesi`}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(1)}
              disabled={safePage <= 1}
              className="h-8 w-8 p-0"
            >«</Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="h-8 w-8 p-0"
            >‹</Button>
            <span className="text-xs text-slate-500 px-2">
              {safePage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="h-8 w-8 p-0"
            >›</Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(totalPages)}
              disabled={safePage >= totalPages}
              className="h-8 w-8 p-0"
            >»</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
