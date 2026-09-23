import { useState, useEffect, useMemo } from 'react';
import { trx } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/currency';

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

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderRow {
  id: number;
  customer_name: string;
  outfit_type: string;
  created_at: string;
  total_price: number;
  sewing_fee: number;
  material_cost: number;
  worker_cost: number;
  profit: number;
}

const WORKER_RATE = 0.30;

function formatDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function PaymentDetail() {
  // Read initial period from URL
  const initialPeriod = (() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('period');
    if (p && PERIODS.some(pr => pr.key === p)) return p as Period;
    return '7d' as Period;
  })();

  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  useEffect(() => {
    loadData();
  }, [period]);

  async function loadData() {
    setLoading(true);
    try {
      const start = getPeriodStart(period);

      // 1. Get transactions in period
      const { data: transactions } = await trx.from('transaction')
        .select('id, customer_id, outfit_type, total_price, sewing_fee, created_at')
        .gte('created_at', start.toISOString())
        .order('created_at', { ascending: false });

      if (!transactions || transactions.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      // 2. Get customer names
      const customerIds = [...new Set(transactions.map(t => t.customer_id))];
      const { data: customers } = await trx.from('customer')
        .select('id, name')
        .in('id', customerIds);
      const customerMap = new Map((customers ?? []).map(c => [c.id, c.name]));

      // 3. Get material usage costs per transaction
      const trxIds = transactions.map(t => t.id);
      const { data: usages, error: usageError } = await trx.from('material_usage')
        .select('transaction_id, quantity_used, cost_per_unit_snapshot')
        .in('transaction_id', trxIds);

      if (usageError) console.error('material_usage query error:', usageError);
      console.log('material_usage results:', usages?.length, 'for', trxIds.length, 'transactions');

      const materialCostMap = new Map<number, number>();
      for (const u of (usages ?? [])) {
        const cost = (u.quantity_used ?? 0) * (u.cost_per_unit_snapshot ?? 0);
        materialCostMap.set(u.transaction_id, (materialCostMap.get(u.transaction_id) ?? 0) + cost);
      }

      // 4. Build rows
      const rows: OrderRow[] = transactions.map(t => {
        const totalPrice = t.total_price ?? 0;
        const sewingFee = t.sewing_fee ?? totalPrice;
        const materialCost = materialCostMap.get(t.id) ?? 0;
        const workerCost = Math.round(sewingFee * WORKER_RATE);
        const profit = totalPrice - materialCost - workerCost;

        return {
          id: t.id,
          customer_name: customerMap.get(t.customer_id) ?? 'Unknown',
          outfit_type: t.outfit_type ?? 'Pakaian',
          created_at: t.created_at,
          total_price: totalPrice,
          sewing_fee: sewingFee,
          material_cost: materialCost,
          worker_cost: workerCost,
          profit,
        };
      });

      setOrders(rows);
    } catch (err) {
      console.error('PaymentDetail loadData error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Summaries
  const summary = useMemo(() => {
    const totalPendapatan = orders.reduce((s, o) => s + o.total_price, 0);
    const totalBahan = orders.reduce((s, o) => s + o.material_cost, 0);
    const totalGaji = orders.reduce((s, o) => s + o.worker_cost, 0);
    const totalLaba = orders.reduce((s, o) => s + o.profit, 0);
    return { totalPendapatan, totalBahan, totalGaji, totalLaba };
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Detail Pesanan & Laba</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Rincian biaya per order dalam periode
          </p>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto shrink-0 overflow-x-auto max-w-full">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                period === p.key ? 'bg-white text-indigo-600 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 shadow-xs px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Total Pendapatan</p>
          {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
            <p className="text-lg font-bold text-slate-900 mt-0.5">{formatCurrency(summary.totalPendapatan)}</p>
          )}
        </div>
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 shadow-xs px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Biaya Bahan</p>
          {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
            <p className="text-lg font-bold text-red-500 mt-0.5">{formatCurrency(summary.totalBahan)}</p>
          )}
        </div>
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 shadow-xs px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Gaji Penjahit</p>
          {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
            <p className="text-lg font-bold text-purple-600 mt-0.5">{formatCurrency(summary.totalGaji)}</p>
          )}
        </div>
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 shadow-xs px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Laba Bersih</p>
          {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
            <p className={`text-lg font-bold mt-0.5 ${summary.totalLaba >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(summary.totalLaba)}
            </p>
          )}
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-6 text-center text-slate-400">
              Tidak ada pesanan pada periode ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[750px]">
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="px-4">Pelanggan</TableHead>
                    <TableHead className="px-4">Jenis</TableHead>
                    <TableHead className="px-4 whitespace-nowrap">Tanggal</TableHead>
                    <TableHead className="px-4 text-right whitespace-nowrap">Total Harga</TableHead>
                    <TableHead className="px-4 text-right whitespace-nowrap">Biaya Bahan</TableHead>
                    <TableHead className="px-4 text-right whitespace-nowrap">Gaji (30%)</TableHead>
                    <TableHead className="px-4 text-right whitespace-nowrap">Laba</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map(o => (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => window.location.href = `/order?id=${o.id}&src=remote`}>
                      <TableCell className="px-4 font-medium text-slate-900">{o.customer_name}</TableCell>
                      <TableCell className="px-4 text-slate-600 min-w-[90px]">{o.outfit_type}</TableCell>
                      <TableCell className="px-4 text-slate-500 whitespace-nowrap text-sm">{formatDate(o.created_at)}</TableCell>
                      <TableCell className="px-4 text-right text-slate-800 font-medium">{formatCurrency(o.total_price)}</TableCell>
                      <TableCell className="px-4 text-right text-red-500">{formatCurrency(o.material_cost)}</TableCell>
                      <TableCell className="px-4 text-right text-purple-600">{formatCurrency(o.worker_cost)}</TableCell>
                      <TableCell className={`px-4 text-right font-semibold ${o.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(o.profit)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="bg-slate-50 font-semibold border-t-2">
                    <TableCell className="px-4" colSpan={3}>Total ({orders.length} pesanan)</TableCell>
                    <TableCell className="px-4 text-right text-slate-900">{formatCurrency(summary.totalPendapatan)}</TableCell>
                    <TableCell className="px-4 text-right text-red-600">{formatCurrency(summary.totalBahan)}</TableCell>
                    <TableCell className="px-4 text-right text-purple-700">{formatCurrency(summary.totalGaji)}</TableCell>
                    <TableCell className={`px-4 text-right ${summary.totalLaba >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(summary.totalLaba)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
