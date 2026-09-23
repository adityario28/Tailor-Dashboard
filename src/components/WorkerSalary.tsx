import { useState, useEffect, useMemo, Fragment } from 'react';
import { trx } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CompletedOrder {
  transaction_id: number;
  completed_at: string;
  worker_id: number;
  worker_name: string;
  customer_name: string;
  outfit_type: string;
  sewing_fee: number;
  gaji: number;
}

interface WorkerSummary {
  worker_id: number;
  worker_name: string;
  orders: CompletedOrder[];
  total_order_value: number;
  total_gaji: number;
}

// ─── Period helpers ───────────────────────────────────────────────────────────
type Period = 'this_week' | 'last_week' | 'this_month' | 'last_month';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'this_week', label: 'Minggu Ini' },
  { key: 'last_week', label: 'Minggu Lalu' },
  { key: 'this_month', label: 'Bulan Ini' },
  { key: 'last_month', label: 'Bulan Lalu' },
];

function getPeriodRange(period: Period): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case 'this_week': {
      const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(today);
      monday.setDate(today.getDate() - diffToMonday);
      monday.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { start: monday, end };
    }
    case 'last_week': {
      const dayOfWeek = today.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() - diffToMonday);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      lastMonday.setHours(0, 0, 0, 0);
      const lastSunday = new Date(thisMonday);
      lastSunday.setDate(thisMonday.getDate() - 1);
      lastSunday.setHours(23, 59, 59, 999);
      return { start: lastMonday, end: lastSunday };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }
  }
}

// ─── Formatting ───────────────────────────────────────────────────────────────
function formatCurrency(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return 'Rp 0';
  return 'Rp ' + n.toLocaleString('id-ID');
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const WORKER_RATE = 0.30;

// ─── Main component ──────────────────────────────────────────────────────────
export default function WorkerSalary() {
  const [period, setPeriod] = useState<Period>('this_week');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WorkerSummary[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    loadData();
  }, [period]);

  async function loadData() {
    setLoading(true);
    try {
      const { start, end } = getPeriodRange(period);

      // 1. Get transaction_log entries where status changed to 'Selesai' within period
      const { data: logs } = await trx.from('transaction_log')
        .select('transaction_id, changed_at')
        .eq('field_changed', 'status')
        .eq('new_value', 'Selesai')
        .gte('changed_at', start.toISOString())
        .lte('changed_at', end.toISOString());

      if (!logs || logs.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      // Deduplicate by transaction_id (take earliest completion)
      const completionMap = new Map<number, string>();
      for (const log of logs) {
        if (!completionMap.has(log.transaction_id)) {
          completionMap.set(log.transaction_id, log.changed_at);
        }
      }

      const trxIds = [...completionMap.keys()];

      // 2. Get transactions
      const { data: transactions } = await trx.from('transaction')
        .select('id, total_price, sewing_fee, worker_id, customer_id, outfit_type')
        .in('id', trxIds);

      if (!transactions || transactions.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      // 3. Get workers
      const workerIds = [...new Set(transactions.map(t => t.worker_id).filter(Boolean))];
      const { data: workers } = await trx.from('worker')
        .select('id, name')
        .in('id', workerIds);
      const workerMap = new Map((workers ?? []).map(w => [w.id, w.name]));

      // 4. Get customers
      const customerIds = [...new Set(transactions.map(t => t.customer_id))];
      const { data: customers } = await trx.from('customer')
        .select('id, name')
        .in('id', customerIds);
      const customerMap = new Map((customers ?? []).map(c => [c.id, c.name]));

      // 5. Build completed orders
      const orders: CompletedOrder[] = transactions
        .filter(t => t.worker_id)
        .map(t => ({
          transaction_id: t.id,
          completed_at: completionMap.get(t.id) ?? '',
          worker_id: t.worker_id!,
          worker_name: workerMap.get(t.worker_id!) ?? 'Unknown',
          customer_name: customerMap.get(t.customer_id) ?? 'Unknown',
          outfit_type: t.outfit_type ?? 'Pakaian',
          sewing_fee: t.sewing_fee ?? t.total_price ?? 0,
          gaji: Math.round((t.sewing_fee ?? t.total_price ?? 0) * WORKER_RATE),
        }));

      // 6. Group by worker
      const grouped = new Map<number, WorkerSummary>();
      for (const order of orders) {
        if (!grouped.has(order.worker_id)) {
          grouped.set(order.worker_id, {
            worker_id: order.worker_id,
            worker_name: order.worker_name,
            orders: [],
            total_order_value: 0,
            total_gaji: 0,
          });
        }
        const summary = grouped.get(order.worker_id)!;
        summary.orders.push(order);
        summary.total_order_value += order.sewing_fee;
        summary.total_gaji += order.gaji;
      }

      // Sort by total_gaji desc
      const result = [...grouped.values()].sort((a, b) => b.total_gaji - a.total_gaji);
      setData(result);
    } catch (err) {
      console.error('WorkerSalary loadData error:', err);
    } finally {
      setLoading(false);
    }
  }

  const totalGaji = useMemo(() => data.reduce((sum, w) => sum + w.total_gaji, 0), [data]);
  const totalOrders = useMemo(() => data.reduce((sum, w) => sum + w.orders.length, 0), [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Gaji Penjahit</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Perhitungan gaji 30% dari biaya jahit order yang selesai
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 shadow-xs px-5 py-4">
          <p className="text-xs font-medium text-slate-500">Total Gaji Semua Penjahit</p>
          {loading ? (
            <Skeleton className="h-8 w-32 mt-1" />
          ) : (
            <p className="text-2xl font-bold text-indigo-600 mt-1">{formatCurrency(totalGaji)}</p>
          )}
        </div>
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 shadow-xs px-5 py-4">
          <p className="text-xs font-medium text-slate-500">Total Order Selesai</p>
          {loading ? (
            <Skeleton className="h-8 w-16 mt-1" />
          ) : (
            <p className="text-2xl font-bold text-green-600 mt-1">{totalOrders} order</p>
          )}
        </div>
      </div>

      {/* Per-worker table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : data.length === 0 ? (
            <div className="p-6 text-center text-slate-400">
              Tidak ada order selesai pada periode ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table className="min-w-[500px]">
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="w-12 px-4"></TableHead>
                  <TableHead className="px-4">Nama Penjahit</TableHead>
                  <TableHead className="px-4 text-center">Order Selesai</TableHead>
                  <TableHead className="px-4 text-right">Total Harga Jahit</TableHead>
                  <TableHead className="px-4 text-right">Gaji (30%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map(worker => (
                  <Fragment key={worker.worker_id}>
                    <TableRow className={`cursor-pointer ${expanded.has(worker.worker_id) ? 'bg-slate-50' : ''}`} onClick={() => toggleExpand(worker.worker_id)}>
                      <TableCell className="px-4 w-12">
                        <button
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold transition-all ${
                            expanded.has(worker.worker_id)
                              ? 'bg-indigo-600 text-white'
                              : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                          }`}
                          aria-label={expanded.has(worker.worker_id) ? 'Tutup detail' : 'Lihat detail'}
                        >
                          {expanded.has(worker.worker_id) ? '−' : '+'}
                        </button>
                      </TableCell>
                      <TableCell className="px-4 font-medium text-slate-900">{worker.worker_name}</TableCell>
                      <TableCell className="px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          {worker.orders.length} order
                        </span>
                      </TableCell>
                      <TableCell className="px-4 text-right text-slate-700">{formatCurrency(worker.total_order_value)}</TableCell>
                      <TableCell className="px-4 text-right font-semibold text-indigo-600">{formatCurrency(worker.total_gaji)}</TableCell>
                    </TableRow>

                    {/* Expanded detail */}
                    {expanded.has(worker.worker_id) && (
                      <TableRow key={`${worker.worker_id}-detail`} className="hover:bg-transparent">
                        <TableCell colSpan={5} className="px-4 sm:px-6 py-0 bg-slate-50 border-b">
                          <div className="py-4">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                              Detail Order — {worker.worker_name}
                            </p>

                            {/* Desktop table */}
                            <div className="hidden sm:block">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b">
                                    <th className="text-left py-2 pr-4 font-medium text-slate-400 text-xs uppercase tracking-wide">Pelanggan</th>
                                    <th className="text-left py-2 pr-4 font-medium text-slate-400 text-xs uppercase tracking-wide">Jenis</th>
                                    <th className="text-left py-2 pr-4 font-medium text-slate-400 text-xs uppercase tracking-wide">Selesai Pada</th>
                                    <th className="text-right py-2 pr-4 font-medium text-slate-400 text-xs uppercase tracking-wide">Harga Jahit</th>
                                    <th className="text-right py-2 font-medium text-slate-400 text-xs uppercase tracking-wide">Gaji</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {worker.orders.map(order => (
                                    <tr key={order.transaction_id} className="border-b last:border-0">
                                      <td className="py-2 pr-4 font-medium text-slate-700">{order.customer_name}</td>
                                      <td className="py-2 pr-4 text-slate-500">{order.outfit_type}</td>
                                      <td className="py-2 pr-4 text-slate-500">{formatDate(order.completed_at)}</td>
                                      <td className="py-2 pr-4 text-right text-slate-600">{formatCurrency(order.sewing_fee)}</td>
                                      <td className="py-2 text-right font-medium text-indigo-600">{formatCurrency(order.gaji)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr>
                                    <td colSpan={4} className="py-2 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Gaji</td>
                                    <td className="py-2 text-right font-bold text-indigo-600">{formatCurrency(worker.total_gaji)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>

                            {/* Mobile stacked cards */}
                            <div className="sm:hidden space-y-3">
                              {worker.orders.map(order => (
                                <div key={order.transaction_id} className="rounded-lg border bg-white p-3 space-y-1.5">
                                  <p className="font-medium text-slate-900 text-sm">{order.customer_name}</p>
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                    <div className="text-slate-400">Jenis</div>
                                    <div className="text-right text-slate-700">{order.outfit_type}</div>
                                    <div className="text-slate-400">Selesai</div>
                                    <div className="text-right text-slate-700">{formatDate(order.completed_at)}</div>
                                    <div className="text-slate-400">Harga Jahit</div>
                                    <div className="text-right text-slate-700">{formatCurrency(order.sewing_fee)}</div>
                                    <div className="text-slate-400">Gaji (30%)</div>
                                    <div className="text-right text-indigo-600 font-semibold">{formatCurrency(order.gaji)}</div>
                                  </div>
                                </div>
                              ))}
                              <div className="flex items-center justify-between pt-2 border-t">
                                <span className="text-xs font-semibold text-slate-400 uppercase">Total Gaji</span>
                                <span className="font-bold text-indigo-600">{formatCurrency(worker.total_gaji)}</span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
