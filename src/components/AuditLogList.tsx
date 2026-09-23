import { useState, useEffect, useCallback, Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { trx } from '@/lib/supabase';
import { Search } from 'lucide-react';

interface LogEntry {
  id: number;
  transaction_id: number;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

interface TransactionSummary {
  id: number;
  customer_name: string;
  status: string;
  outfit_type: string;
  created_at?: string;
  logs: LogEntry[];
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  outfit_type: 'Jenis Pakaian',
  panjang_kain: 'Panjang Kain',
  lebar_kain: 'Lebar Kain',
  cuci_sebelum_potong: 'Cuci Sebelum Potong',
  panjang_badan: 'Panjang Badan',
  lebar_bahu: 'Lebar Bahu',
  panjang_lengan: 'Panjang Lengan',
  lingkar_lengan: 'Lingkar Lengan',
  lingkar_ujung_lengan: 'Lingkar Ujung Lengan',
  lingkar_dada: 'Lingkar Dada',
  lingkar_perut: 'Lingkar Perut',
  lingkar_pinggul: 'Lingkar Pinggul',
  lingkar_leher: 'Lingkar Leher',
  lebar_pundak: 'Lebar Pundak',
  catatan: 'Catatan',
  total_price: 'Total Harga',
  amount_paid: 'Jumlah Dibayar',
  payment_status: 'Status Pembayaran',
  worker_id: 'Penjahit',
};

const STATUS_COLORS: Record<string, string> = {
  'Siap Diambil': 'bg-green-100 text-green-700',
  'Selesai': 'bg-emerald-100 text-emerald-700',
  'Finishing': 'bg-yellow-100 text-yellow-700',
  'Jahit': 'bg-purple-100 text-purple-700',
  'Potong Bahan': 'bg-orange-100 text-orange-700',
  'Cuci Bahan': 'bg-blue-100 text-blue-700',
};

export default function AuditLogList() {
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const pageSize = 10;

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: allLogs } = await trx.from('transaction_log')
        .select('*', { count: 'exact' })
        .order('changed_at', { ascending: false });

      if (!allLogs || allLogs.length === 0) {
        setTransactions([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      const trxIds = [...new Set((allLogs as LogEntry[]).map(l => l.transaction_id))];

      const { data: txns } = await trx.from('transaction')
        .select('id, status, outfit_type, customer_id, created_at')
        .in('id', trxIds);

      const { data: customers } = await trx.from('customer')
        .select('id, name')
        .in('id', [...new Set((txns ?? []).map(t => t.customer_id))]);

      const customerMap = new Map((customers ?? []).map(c => [c.id, c.name]));
      const txnMap = new Map((txns ?? []).map(t => [t.id, t]));

      const grouped = new Map<number, TransactionSummary>();
      for (const log of allLogs as LogEntry[]) {
        const txn = txnMap.get(log.transaction_id);
        const customerName = customerMap.get(txn?.customer_id) ?? 'Unknown';

        if (!grouped.has(log.transaction_id)) {
          grouped.set(log.transaction_id, {
            id: log.transaction_id,
            customer_name: customerName,
            status: txn?.status ?? '',
            outfit_type: txn?.outfit_type ?? '',
            created_at: txn?.created_at,
            logs: [],
          });
        }
        grouped.get(log.transaction_id)!.logs.push(log);
      }

      grouped.forEach(t => t.logs.sort((a, b) =>
        new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
      ));

      let filteredTransactions = [...grouped.values()];

      if (search) {
        const searchLower = search.toLowerCase().trim();
        filteredTransactions = filteredTransactions.filter(t =>
          t.id.toString().includes(search.trim()) ||
          t.customer_name.toLowerCase().includes(searchLower)
        );
      }

      setTotal(filteredTransactions.length);
      const paginatedTransactions = filteredTransactions.slice((page - 1) * pageSize, page * pageSize);
      setTransactions(paginatedTransactions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / pageSize);

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

  const formatDateOnly = (d: string) =>
    new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Audit Log</h1>
      </div>

      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b bg-slate-50/50">
          <div className="flex items-center gap-2 w-full sm:max-w-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Cari nama pelanggan atau ID..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>
          <span className="text-sm text-slate-500 shrink-0">{total} transaksi tercatat</span>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-slate-400">Memuat...</div>
          ) : transactions.length === 0 ? (
            <div className="p-6 text-center text-slate-400">
              {search ? 'Tidak ada hasil yang cocok.' : 'Belum ada audit log.'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <Table className="min-w-[500px]">
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="w-12 px-4"></TableHead>
                    <TableHead className="px-4">Pelanggan</TableHead>
                    <TableHead className="px-4 min-w-[90px]">Jenis</TableHead>
                    <TableHead className="px-4 whitespace-nowrap">Tanggal Order</TableHead>
                    <TableHead className="px-4 text-center whitespace-nowrap">Perubahan</TableHead>
                    <TableHead className="px-4 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(tx => (
                    <Fragment key={tx.id}>
                      <TableRow className={`cursor-pointer ${expanded.has(tx.id) ? 'bg-slate-50' : ''}`} onClick={() => toggleExpand(tx.id)}>
                        <TableCell className="px-4 w-12">
                          <button
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold transition-all ${
                              expanded.has(tx.id)
                                ? 'bg-indigo-600 text-white'
                                : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                            }`}
                            aria-label={expanded.has(tx.id) ? 'Tutup detail' : 'Lihat detail'}
                          >
                            {expanded.has(tx.id) ? '−' : '+'}
                          </button>
                        </TableCell>
                        <TableCell className="px-4 font-medium text-slate-900">{tx.customer_name}</TableCell>
                        <TableCell className="px-4 text-slate-600">{tx.outfit_type || 'Pakaian'}</TableCell>
                        <TableCell className="px-4 text-slate-500 text-sm whitespace-nowrap">
                          {tx.created_at ? formatDateOnly(tx.created_at) : '—'}
                        </TableCell>
                        <TableCell className="px-4 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 whitespace-nowrap">
                            {tx.logs.length} perubahan
                          </span>
                        </TableCell>
                        <TableCell className="px-4 text-center">
                          <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${STATUS_COLORS[tx.status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {tx.status}
                          </span>
                        </TableCell>
                      </TableRow>

                      {/* Expanded detail */}
                      {expanded.has(tx.id) && (
                        <TableRow key={`${tx.id}-detail`} className="hover:bg-transparent">
                          <TableCell colSpan={6} className="px-4 sm:px-6 py-0 bg-slate-50 border-b">
                            <div className="py-4">
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                                Riwayat Perubahan
                              </p>

                              {/* Desktop table */}
                              <div className="hidden sm:block">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="text-left py-2 pr-4 font-medium text-slate-400 text-xs uppercase tracking-wide">Jenis</th>
                                      <th className="text-left py-2 pr-4 font-medium text-slate-400 text-xs uppercase tracking-wide">Detail Perubahan</th>
                                      <th className="text-right py-2 font-medium text-slate-400 text-xs uppercase tracking-wide">Waktu</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tx.logs.map(log => {
                                      const isStatus = log.field_changed === 'status';
                                      const isWorker = log.field_changed === 'worker_id';
                                      const changeType = isStatus ? 'Status' : isWorker ? 'Penjahit' : 'Ukuran';
                                      const badgeClass =
                                        isStatus ? 'bg-blue-100 text-blue-700' :
                                        isWorker ? 'bg-indigo-100 text-indigo-700' :
                                        'bg-purple-100 text-purple-700';

                                      return (
                                        <tr key={log.id} className="border-b last:border-0">
                                          <td className="py-2 pr-4">
                                            <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${badgeClass}`}>
                                              {changeType}
                                            </span>
                                          </td>
                                          <td className="py-2 pr-4">
                                            {isStatus ? (
                                              <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">{log.old_value ?? '—'}</span>
                                                <span className="text-slate-400">→</span>
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{log.new_value ?? '—'}</span>
                                              </div>
                                            ) : isWorker ? (
                                              <div className="flex items-center gap-2 text-sm">
                                                <span className="text-slate-500">{log.old_value ?? <em className="text-slate-300">Belum ditentukan</em>}</span>
                                                <span className="text-slate-400">→</span>
                                                <span className="font-semibold text-indigo-700">{log.new_value ?? '—'}</span>
                                              </div>
                                            ) : (
                                              <div className="text-sm text-slate-700">
                                                <span className="font-medium">{FIELD_LABELS[log.field_changed] ?? log.field_changed}:</span>{' '}
                                                <span className="text-slate-500">{log.old_value ?? '—'}</span>
                                                <span className="text-slate-400 mx-1">→</span>
                                                <span className="font-semibold text-slate-900">{log.new_value ?? '—'}</span>
                                              </div>
                                            )}
                                          </td>
                                          <td className="py-2 text-right text-xs text-slate-500 whitespace-nowrap">
                                            {formatDate(log.changed_at)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {/* Mobile stacked cards */}
                              <div className="sm:hidden space-y-3">
                                {tx.logs.map(log => {
                                  const isStatus = log.field_changed === 'status';
                                  const isWorker = log.field_changed === 'worker_id';
                                  const changeType = isStatus ? 'Status' : isWorker ? 'Penjahit' : 'Ukuran';
                                  const badgeClass =
                                    isStatus ? 'bg-blue-100 text-blue-700' :
                                    isWorker ? 'bg-indigo-100 text-indigo-700' :
                                    'bg-purple-100 text-purple-700';

                                  return (
                                    <div key={log.id} className="rounded-lg border bg-white p-3 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${badgeClass}`}>
                                          {changeType}
                                        </span>
                                        <span className="text-xs text-slate-400">{formatDate(log.changed_at)}</span>
                                      </div>
                                      <div className="text-sm">
                                        {isStatus ? (
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">{log.old_value ?? '—'}</span>
                                            <span className="text-slate-400">→</span>
                                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{log.new_value ?? '—'}</span>
                                          </div>
                                        ) : isWorker ? (
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-slate-500">{log.old_value ?? 'Belum ditentukan'}</span>
                                            <span className="text-slate-400">→</span>
                                            <span className="font-semibold text-indigo-700">{log.new_value ?? '—'}</span>
                                          </div>
                                        ) : (
                                          <div className="text-slate-700">
                                            <span className="font-medium">{FIELD_LABELS[log.field_changed] ?? log.field_changed}:</span>{' '}
                                            <span className="text-slate-500">{log.old_value ?? '—'}</span>
                                            <span className="text-slate-400 mx-1">→</span>
                                            <span className="font-semibold text-slate-900">{log.new_value ?? '—'}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
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

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t bg-slate-50/50">
                <p className="text-xs text-slate-400">
                  {total === 0 ? 'Tidak ada data' : `Menampilkan ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} dari ${total} transaksi`}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={page <= 1} className="h-8 w-8 p-0">«</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="h-8 w-8 p-0">‹</Button>
                  <span className="text-xs text-slate-500 px-2">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="h-8 w-8 p-0">›</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="h-8 w-8 p-0">»</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
