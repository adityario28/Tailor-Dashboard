import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { trx } from '@/lib/supabase';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';

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
};

export default function AuditLogList() {
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const pageSize = 10;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: allLogs, count: totalCount } = await trx.from('transaction_log')
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
    new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Audit Log</h1>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Cari nama pelanggan atau ID transaksi..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <span className="text-sm text-slate-500">{total} perubahan tercatat</span>
          </div>
        </CardHeader>
      </Card>

      {loading ? (
        <Card>
          <CardHeader><CardTitle>Memuat...</CardTitle></CardHeader>
        </Card>
      ) : transactions.length === 0 ? (
        <Card>
          <CardHeader><CardTitle>Tidak ada data</CardTitle></CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {transactions.map(tx => (
            <Card key={tx.id} className="overflow-hidden cursor-pointer" onClick={() => setExpanded(expanded === tx.id ? null : tx.id)}>
              <div className="w-full flex items-center justify-between px-6 py-0 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  {expanded === tx.id
                    ? <ChevronDown className="w-5 h-5 text-slate-400" />
                    : <ChevronRight className="w-5 h-5 text-slate-400" />
                  }
                  <div>
                    <span className="font-semibold text-slate-900">
                      {tx.customer_name} - {tx.outfit_type || 'Pakaian'} <span className="text-slate-400 font-normal">(Transaksi #{tx.id}{tx.created_at ? ` - ${formatDateOnly(tx.created_at)}` : ''})</span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{tx.logs.length} perubahan</span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    tx.status === 'Siap Diambil' ? 'bg-green-100 text-green-700' :
                    tx.status === 'Finishing' ? 'bg-yellow-100 text-yellow-700' :
                    tx.status === 'Jahit' ? 'bg-purple-100 text-purple-700' :
                    tx.status === 'Potong Bahan' ? 'bg-orange-100 text-orange-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {tx.status}
                  </span>
                </div>
              </div>

              {expanded === tx.id && (
                <div className="border-t bg-slate-50">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Jenis Perubahan</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Perubahan Status</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Perubahan Ukuran</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Tanggal Perubahan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tx.logs.map(log => {
                        const isStatus = log.field_changed === 'status';
                        const isSize = log.field_changed !== 'status' && log.field_changed !== 'outfit_type';
                        const changeType = isStatus ? 'status' : 'ukuran';
                        
                        return (
                          <tr key={log.id} className="bg-white">
                            <td className="px-6 py-3">
                              <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full ${
                                changeType === 'status' 
                                  ? 'bg-blue-100 text-blue-700' 
                                  : 'bg-purple-100 text-purple-700'
                              }`}>
                                {changeType}
                              </span>
                            </td>
                            <td className="px-6 py-3">
                              {isStatus ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                                    {log.old_value ?? '—'}
                                  </span>
                                  <span className="text-slate-400">→</span>
                                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
                                    {log.new_value ?? '—'}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-sm">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3">
                              {isSize ? (
                                <div className="text-sm text-slate-700">
                                  <span className="font-medium">{FIELD_LABELS[log.field_changed] ?? log.field_changed}:</span>{' '}
                                  <span className="text-slate-500">{log.old_value ?? '—'}</span>
                                  <span className="text-slate-400 mx-1">→</span>
                                  <span className="font-semibold text-slate-900">{log.new_value ?? '—'}</span>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-sm">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">
                              {formatDate(log.changed_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Sebelumnya
              </Button>
              <span className="text-sm text-slate-500 px-3">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Selanjutnya
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
