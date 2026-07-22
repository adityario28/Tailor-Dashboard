import { useState, useEffect } from 'react';
import { trx } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/currency';
import type { Transaction } from '@/lib/db';

// ─── Period config ────────────────────────────────────────────────────────────
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

function getCreatedAt(t: Transaction): Date | null {
  if (!t.created_at) return null;
  const d = t.created_at instanceof Date ? t.created_at : new Date(t.created_at as any);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Metrics types ────────────────────────────────────────────────────────────
interface ReportMetrics {
  totalOrder: number;
  totalPemasukan: number;   // sum of amount_paid
  totalTagihan: number;     // sum of total_price
  sisaTagihan: number;      // outstanding (total_price - amount_paid) for non-lunas
  countLunas: number;
  countDp: number;
  countBelumBayar: number;
  amountLunas: number;
  amountDp: number;
  byOutfit: Record<string, number>;
  byStatus: Record<string, number>;
}

const emptyMetrics = (): ReportMetrics => ({
  totalOrder: 0,
  totalPemasukan: 0,
  totalTagihan: 0,
  sisaTagihan: 0,
  countLunas: 0,
  countDp: 0,
  countBelumBayar: 0,
  amountLunas: 0,
  amountDp: 0,
  byOutfit: {},
  byStatus: {},
});

function computeMetrics(transactions: Transaction[]): ReportMetrics {
  const m = emptyMetrics();
  m.totalOrder = transactions.length;

  for (const t of transactions) {
    const paid = t.amount_paid ?? 0;
    const total = t.total_price ?? 0;
    const ps = t.payment_status ?? 'belum_bayar';

    m.totalPemasukan += paid;
    m.totalTagihan += total;

    if (ps === 'lunas') {
      m.countLunas++;
      m.amountLunas += paid;
    } else if (ps === 'dp') {
      m.countDp++;
      m.amountDp += paid;
      m.sisaTagihan += Math.max(0, total - paid);
    } else {
      m.countBelumBayar++;
      m.sisaTagihan += total;
    }

    // by outfit
    const outfit = t.outfit_type ?? 'Tidak Diketahui';
    m.byOutfit[outfit] = (m.byOutfit[outfit] ?? 0) + 1;

    // by production status
    const status = t.status ?? 'Tidak Diketahui';
    m.byStatus[status] = (m.byStatus[status] ?? 0) + 1;
  }

  return m;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function MetricCard({
  title,
  value,
  sub,
  color = 'slate',
  loading,
  placeholder,
  onClick,
}: {
  title: string;
  value: string;
  sub?: string;
  color?: 'slate' | 'green' | 'amber' | 'red' | 'indigo' | 'blue';
  loading: boolean;
  placeholder?: boolean;
  onClick?: () => void;
}) {
  const colorMap: Record<string, string> = {
    slate:  'text-slate-900',
    green:  'text-green-600',
    amber:  'text-amber-500',
    red:    'text-red-500',
    indigo: 'text-indigo-600',
    blue:   'text-blue-600',
  };

  return (
    <Card
      onClick={onClick}
      className={onClick ? 'cursor-pointer hover:ring-2 hover:ring-red-200 transition-all' : ''}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500 flex items-center justify-between">
          {title}
          {onClick && (
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-28" />
        ) : placeholder ? (
          <div>
            <p className="text-2xl font-bold text-slate-300">—</p>
            <p className="text-xs text-slate-400 mt-1">Belum tersedia</p>
          </div>
        ) : (
          <div>
            <p className={`text-2xl font-bold ${colorMap[color]}`}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentStatusRow({
  label,
  count,
  amount,
  dotColor,
  loading,
}: {
  label: string;
  count: number;
  amount?: number;
  dotColor: string;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
        <span className="text-sm text-slate-700">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-5 w-24" />
      ) : (
        <div className="text-right">
          <span className="text-sm font-semibold text-slate-800">{count} pesanan</span>
          {amount !== undefined && (
            <p className="text-xs text-slate-400">{formatCurrency(amount)}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PaymentReports() {
  const [period, setPeriod] = useState<Period>('30d');
  const [metrics, setMetrics] = useState<ReportMetrics>(emptyMetrics());
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [totalPengeluaran, setTotalPengeluaran] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, [period]);

  async function loadData() {
    setLoading(true);
    try {
      const periodStart = getPeriodStart(period);

      // Fetch transactions from Supabase
      const { data, error } = await trx.from('transaction').select('*');
      if (error) {
        console.error('PaymentReports supabase error:', error);
        return;
      }

      const all = (data ?? []) as Transaction[];
      const filtered = all.filter(t => {
        const createdAt = getCreatedAt(t);
        if (!createdAt) return period === '60d';
        return createdAt >= periodStart;
      });

      setMetrics(computeMetrics(filtered));

      // Fetch total pengeluaran (purchase_item) for the same period
      const { data: purchases } = await trx
        .from('purchase')
        .select('id')
        .gte('purchased_at', periodStart.toISOString());

      if (purchases && purchases.length > 0) {
        const purchaseIds = (purchases as any[]).map((p: any) => p.id);
        const { data: items } = await trx
          .from('purchase_item')
          .select('quantity, unit_price')
          .in('purchase_id', purchaseIds);

        const total = ((items ?? []) as any[]).reduce(
          (sum: number, item: any) => sum + Number(item.quantity) * Number(item.unit_price), 0
        );
        setTotalPengeluaran(total);
      } else {
        setTotalPengeluaran(0);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('PaymentReports error:', err);
    } finally {
      setLoading(false);
    }
  }

  const STATUS_ORDER = ['Cuci Bahan', 'Potong Bahan', 'Jahit', 'Finishing', 'Siap Diambil'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Laporan Keuangan</h2>
          {lastUpdated && (
            <p className="text-xs text-slate-400 mt-0.5">
              Diperbarui {lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
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

      {/* Main metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Pesanan"
          value={String(metrics.totalOrder)}
          sub="transaksi masuk"
          color="indigo"
          loading={loading}
        />
        <MetricCard
          title="Total Pemasukan"
          value={formatCurrency(metrics.totalPemasukan)}
          sub={`dari ${formatCurrency(metrics.totalTagihan)} tagihan`}
          color="green"
          loading={loading}
        />
        <MetricCard
          title="Sisa Tagihan"
          value={formatCurrency(metrics.sisaTagihan)}
          sub={`${metrics.countDp + metrics.countBelumBayar} pesanan belum lunas`}
          color="amber"
          loading={loading}
        />
        <MetricCard
          title="Total Pengeluaran"
          value={totalPengeluaran !== null ? formatCurrency(totalPengeluaran) : '—'}
          sub="biaya pembelian bahan"
          color="red"
          loading={loading}
          placeholder={totalPengeluaran === null}
          onClick={() => window.location.href = '/expenses'}
        />
      </div>

      {/* Bottom section: 2 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Payment status breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Status Pembayaran</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <PaymentStatusRow
              label="Lunas"
              count={metrics.countLunas}
              amount={metrics.amountLunas}
              dotColor="bg-green-500"
              loading={loading}
            />
            <PaymentStatusRow
              label="Down Payment (DP)"
              count={metrics.countDp}
              amount={metrics.amountDp}
              dotColor="bg-yellow-400"
              loading={loading}
            />
            <PaymentStatusRow
              label="Belum Bayar"
              count={metrics.countBelumBayar}
              dotColor="bg-red-400"
              loading={loading}
            />
          </CardContent>
        </Card>

        {/* Production status breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Status Produksi</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : (
              STATUS_ORDER.filter(s => metrics.byStatus[s] !== undefined).map(s => (
                <div key={s} className="flex items-center justify-between py-2.5 border-b last:border-0">
                  <span className="text-sm text-slate-700">{s}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-400 rounded-full"
                        style={{
                          width: metrics.totalOrder > 0
                            ? `${((metrics.byStatus[s] ?? 0) / metrics.totalOrder) * 100}%`
                            : '0%'
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-slate-800 w-8 text-right">
                      {metrics.byStatus[s] ?? 0}
                    </span>
                  </div>
                </div>
              ))
            )}
            {!loading && Object.keys(metrics.byStatus).length === 0 && (
              <p className="text-sm text-slate-400 py-4 text-center">Tidak ada data</p>
            )}
          </CardContent>
        </Card>

        {/* Outfit type breakdown */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Pesanan per Jenis Pakaian</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex gap-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 flex-1" />)}
              </div>
            ) : Object.keys(metrics.byOutfit).length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Tidak ada data</p>
            ) : (
              <div className="flex flex-wrap gap-3 pt-1">
                {Object.entries(metrics.byOutfit)
                  .sort((a, b) => b[1] - a[1])
                  .map(([outfit, count]) => (
                    <div
                      key={outfit}
                      className="flex-1 min-w-[140px] bg-slate-50 rounded-lg px-4 py-3 border"
                    >
                      <p className="text-xs text-slate-500 truncate">{outfit}</p>
                      <p className="text-2xl font-bold text-indigo-600 mt-1">{count}</p>
                      <p className="text-xs text-slate-400">
                        {metrics.totalOrder > 0
                          ? `${Math.round((count / metrics.totalOrder) * 100)}%`
                          : '0%'}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
