import { useState, useEffect, useMemo } from 'react';
import { db, STATUS_FLOW } from '@/lib/db';
import { trx } from '@/lib/supabase';
import type { OrderStatus, Transaction, Customer, PaymentStatus } from '@/lib/db';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SortPanel } from '@/components/SortPanel';
import type { SortEntry } from '@/components/SortPanel';

// ─── Period ───────────────────────────────────────────────────────────────────
type Period = 'all' | 'today' | '3d' | '7d' | '30d' | '60d';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'all',   label: 'Semua' },
  { key: 'today', label: 'Hari Ini' },
  { key: '3d',    label: '3H' },
  { key: '7d',    label: '7H' },
  { key: '30d',   label: '30H' },
  { key: '60d',   label: '60H' },
];

function getPeriodStart(period: Period): Date | null {
  if (period === 'all') return null;
  const now = new Date();
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const days: Record<string, number> = { '3d': 3, '7d': 7, '30d': 30, '60d': 60 };
  const d = new Date(now);
  d.setDate(d.getDate() - days[period]);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getPeriodEnd(period: Period): Date | null {
  if (period === 'all') return null;
  const now = new Date();
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return now;
}

// ─── Sort ─────────────────────────────────────────────────────────────────────
type SortKey = '_customerName' | 'outfit_type' | 'created_at' | 'payment_status' | 'status';
type SortDir = 'asc' | 'desc';

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: '_customerName',  label: 'Nama Pelanggan' },
  { key: 'outfit_type',    label: 'Jenis Pakaian' },
  { key: 'created_at',     label: 'Tanggal Order' },
  { key: 'payment_status', label: 'Status Pembayaran' },
  { key: 'status',         label: 'Status Produksi' },
];

const DEFAULT_SORT: SortEntry<SortKey>[] = [{ key: 'created_at', dir: 'desc' }];

// ─── Types ────────────────────────────────────────────────────────────────────
interface TransactionRow extends Transaction {
  id: number;
  _customerName: string;
  _source: 'local' | 'remote';
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  'Cuci Bahan':   'bg-blue-100 text-blue-700',
  'Potong Bahan': 'bg-orange-100 text-orange-700',
  Jahit:          'bg-purple-100 text-purple-700',
  Finishing:      'bg-yellow-100 text-yellow-700',
  'Siap Diambil': 'bg-green-100 text-green-700',
};

const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string }> = {
  belum_bayar: { label: 'Belum Bayar', color: 'bg-red-100 text-red-700' },
  dp:          { label: 'DP',          color: 'bg-yellow-100 text-yellow-700' },
  lunas:       { label: 'Lunas',       color: 'bg-green-100 text-green-700' },
};

const PAYMENT_SORT_ORDER: Record<string, number> = { belum_bayar: 0, dp: 1, lunas: 2 };
const STATUS_SORT_ORDER: Record<string, number>  = { 'Cuci Bahan': 0, 'Potong Bahan': 1, 'Jahit': 2, 'Finishing': 3, 'Siap Diambil': 4 };

const PAGE_SIZES = [10, 25, 50];

function formatDateTime(date: string | Date | undefined) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OrdersTable() {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [period, setPeriod]             = useState<Period>('all');
  const [sortStack, setSortStack] = useState<SortEntry<SortKey>[]>(DEFAULT_SORT);
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(10);

  const handleSort = (key: SortKey, e: React.MouseEvent) => {
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
        return [{ key, dir: 'asc' as SortDir }];
      });
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [localTrx, localCustomers] = await Promise.all([
        db.transactions.toArray(),
        db.customer.toArray(),
      ]);
      const localCustomerMap = new Map(localCustomers.map(c => [c.id, c]));
      const rows = new Map<string, TransactionRow>();

      for (const t of localTrx) {
        rows.set(`local-${t.id}`, {
          ...t, id: t.id!,
          _customerName: localCustomerMap.get(t.customer_id)?.name ?? 'Pelanggan',
          _source: 'local',
        });
      }

      if (navigator.onLine) {
        const [{ data: remoteTrx }, { data: remoteCustomers }] = await Promise.all([
          trx.from('transaction').select('*'),
          trx.from('customer').select('*'),
        ]);
        const remoteCustomerMap = new Map((remoteCustomers as Customer[] ?? []).map(c => [c.id, c]));
        for (const t of (remoteTrx as Transaction[] ?? [])) {
          const customerName = remoteCustomerMap.get(t.customer_id)?.name ?? 'Pelanggan';
          const matchingLocalKey = [...rows.entries()].find(([, r]) =>
            r._source === 'local' && r.synced &&
            localCustomerMap.get(r.customer_id)?.name === customerName &&
            r.outfit_type === t.outfit_type &&
            r.panjang_kain === t.panjang_kain &&
            r.panjang_badan === t.panjang_badan
          )?.[0];
          if (matchingLocalKey) {
            rows.delete(matchingLocalKey);
            rows.set(`remote-${t.id}`, { ...t, id: t.id!, _customerName: customerName, _source: 'remote' });
          } else {
            const existsRemote = [...rows.keys()].some(k => k.startsWith('remote-') && rows.get(k)!.id === t.id);
            if (!existsRemote) rows.set(`remote-${t.id}`, { ...t, id: t.id!, _customerName: customerName, _source: 'remote' });
          }
        }
      }
      setTransactions([...rows.values()]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDashboard(); }, []);
  useEffect(() => { setPage(1); }, [search, period, sortStack]);

  const handleStatusChange = async (trId: number, source: 'local' | 'remote', newStatus: OrderStatus) => {
    try {
      if (source === 'local') await db.transactions.update(trId, { status: newStatus, synced: false });
      if (navigator.onLine) {
        await trx.from('transaction').update({ status: newStatus }).eq('id', trId);
        if (source === 'local') await db.transactions.update(trId, { synced: true });
      }
      loadDashboard();
    } catch (err) { console.error('Error updating status:', err); }
  };

  function compareRows(a: TransactionRow, b: TransactionRow, key: SortKey): number {
    switch (key) {
      case '_customerName': return a._customerName.localeCompare(b._customerName);
      case 'outfit_type':   return (a.outfit_type ?? '').localeCompare(b.outfit_type ?? '');
      case 'created_at': {
        const da = a.created_at ? new Date(a.created_at as any).getTime() : 0;
        const db_ = b.created_at ? new Date(b.created_at as any).getTime() : 0;
        return da - db_;
      }
      case 'payment_status': return (PAYMENT_SORT_ORDER[a.payment_status ?? 'belum_bayar'] ?? 0) - (PAYMENT_SORT_ORDER[b.payment_status ?? 'belum_bayar'] ?? 0);
      case 'status':         return (STATUS_SORT_ORDER[a.status] ?? 0) - (STATUS_SORT_ORDER[b.status] ?? 0);
      default: return 0;
    }
  }

  // ─── Pipeline: period → search → multi-sort ─────────────────────────────────
  const processed = useMemo(() => {
    let data = transactions;

    const start = getPeriodStart(period);
    const end   = getPeriodEnd(period);
    if (start) {
      data = data.filter(t => {
        const d = t.created_at ? new Date(t.created_at as any) : null;
        if (!d) return false;
        return d >= start && (!end || d <= end);
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(t =>
        t._customerName.toLowerCase().includes(q) ||
        (t.outfit_type ?? '').toLowerCase().includes(q)
      );
    }

    if (sortStack.length > 0) {
      data = [...data].sort((a, b) => {
        for (const { key, dir } of sortStack) {
          const cmp = compareRows(a, b, key);
          if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
        }
        return 0;
      });
    }

    return data;
  }, [transactions, period, search, sortStack]);

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const paginated  = processed.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3"><Skeleton className="h-9 flex-1 max-w-xs" /><Skeleton className="h-9 w-48" /></div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-slate-500 text-left">
            <th className="pb-3 font-medium">Nama Pelanggan</th><th className="pb-3 font-medium">Jenis</th>
            <th className="pb-3 font-medium">Tanggal</th><th className="pb-3 font-medium">Status Pembayaran</th><th className="pb-3 font-medium">Status</th>
          </tr></thead>
          <tbody>{[...Array(5)].map((_, i) => (
            <tr key={i} className="border-b">
              <td className="py-3"><Skeleton className="h-5 w-32" /></td><td className="py-3"><Skeleton className="h-5 w-40" /></td>
              <td className="py-3"><Skeleton className="h-5 w-28" /></td><td className="py-3"><Skeleton className="h-6 w-20 rounded-full" /></td>
              <td className="py-3"><Skeleton className="h-6 w-24 rounded-full" /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:max-w-sm">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama pelanggan, jenis pakaian..." className="pl-8 h-9 text-sm" />
          </div>
          <SortPanel stack={sortStack} onChange={setSortStack} columns={SORT_COLUMNS} defaultStack={DEFAULT_SORT} />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto shrink-0">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${period === p.key ? 'bg-white text-indigo-600 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-slate-500 text-left">
            <th className="pb-3 font-medium">Nama Pelanggan</th>
            <th className="pb-3 font-medium">Jenis</th>
            <th className="pb-3 font-medium">Tanggal Order</th>
            <th className="pb-3 font-medium">Status Pembayaran</th>
            <th className="pb-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {paginated.length === 0 ? (
            <tr><td colSpan={5} className="py-10 text-center text-slate-400">
              {search || period !== 'all' ? 'Tidak ada pesanan yang cocok.' : 'Belum ada pesanan.'}
            </td></tr>
          ) : paginated.map(t => {
            const currentIdx      = STATUS_FLOW.indexOf(t.status as OrderStatus);
            const visibleStatuses = currentIdx >= 0 ? STATUS_FLOW.slice(currentIdx) : STATUS_FLOW;
            const colorClass      = STATUS_COLORS[t.status] ?? '';
            const paymentStatus   = (t.payment_status || 'belum_bayar') as PaymentStatus;
            const paymentConfig   = PAYMENT_STATUS_CONFIG[paymentStatus];
            return (
              <tr key={`${t._source}-${t.id}`} className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                onClick={() => window.location.href = `/order?id=${t.id}&src=${t._source}`}>
                <td className="py-3 font-medium text-slate-900">{t._customerName}</td>
                <td className="py-3 text-slate-600">{t.outfit_type || 'Pakaian'}</td>
                <td className="py-3 text-slate-500">{formatDateTime((t as any).created_at)}</td>
                <td className="py-3">
                  <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-full ${paymentConfig.color}`}>{paymentConfig.label}</span>
                </td>
                <td className="py-3" onClick={e => e.stopPropagation()}>
                  <Select value={t.status} onValueChange={value => handleStatusChange(t.id, t._source, value as OrderStatus)}>
                    <SelectTrigger className={`w-auto h-auto border-0 text-xs font-semibold px-2 py-1.5 rounded-full ${colorClass}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2 border-t">
        <p className="text-xs text-slate-400">
          {processed.length === 0 ? 'Tidak ada data'
            : `Menampilkan ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, processed.length)} dari ${processed.length} pesanan`}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <span className="text-xs text-slate-400 hidden sm:block">Tampilkan</span>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-16 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={safePage <= 1} className="h-8 w-8 p-0">«</Button>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} className="h-8 w-8 p-0">‹</Button>
          <span className="text-xs text-slate-500 px-1">{safePage} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="h-8 w-8 p-0">›</Button>
          <Button variant="outline" size="sm" onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} className="h-8 w-8 p-0">»</Button>
        </div>
      </div>
    </div>
  );
}
