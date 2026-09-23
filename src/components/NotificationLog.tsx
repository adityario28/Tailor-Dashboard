import { useState, useEffect, useMemo } from 'react';
import { trx } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface NotifLog {
  id: number;
  transaction_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  status_sent: string | null;
  message: string | null;
  wa_status: string;
  error_msg: string | null;
  sent_at: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const PAGE_SIZE = 25;

export default function NotificationLog() {
  const [logs, setLogs] = useState<NotifLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedMsg, setExpandedMsg] = useState<number | null>(null);

  useEffect(() => { loadLogs(); }, []);

  async function loadLogs() {
    setLoading(true);
    try {
      const { data, error } = await trx
        .from('notification_log')
        .select('*')
        .order('sent_at', { ascending: false });

      if (error) { console.error('NotificationLog error:', error); return; }
      setLogs((data ?? []) as NotifLog[]);
    } catch (err) {
      console.error('NotificationLog error:', err);
    } finally {
      setLoading(false);
    }
  }

  const processed = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter(l =>
      (l.customer_name ?? '').toLowerCase().includes(q) ||
      (l.customer_phone ?? '').includes(q) ||
      (l.status_sent ?? '').toLowerCase().includes(q)
    );
  }, [logs, search]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = processed.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const successCount = logs.filter(l => l.wa_status === 'success').length;
  const failedCount  = logs.filter(l => l.wa_status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Log Notifikasi WA</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {logs.length} notifikasi terkirim ·{' '}
            <span className="text-green-600 font-medium">{successCount} berhasil</span>
            {failedCount > 0 && (
              <span className="text-red-500 font-medium ml-1">· {failedCount} gagal</span>
            )}
          </p>
        </div>
        <Button variant="outline" onClick={loadLogs} className="self-start sm:self-auto">
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 shadow-xs px-5 py-4">
          <p className="text-xs font-medium text-slate-500">Total</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{logs.length}</p>
        </div>
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 shadow-xs px-5 py-4">
          <p className="text-xs font-medium text-slate-500">Berhasil</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{successCount}</p>
        </div>
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 shadow-xs px-5 py-4">
          <p className="text-xs font-medium text-slate-500">Gagal</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{failedCount}</p>
        </div>
      </div>

      {/* Table */}
      <Card>
        {/* Toolbar */}
        <div className="flex items-center px-6 py-3 border-b bg-slate-50/50">
          <div className="relative w-full max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Cari nama, nomor, atau status..."
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <Table className="min-w-[650px]">
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="px-4">Waktu Kirim</TableHead>
                    <TableHead className="px-4">Pelanggan</TableHead>
                    <TableHead className="px-4">No. WA</TableHead>
                    <TableHead className="px-4">Status Dikirim</TableHead>
                    <TableHead className="px-4 text-center">Hasil</TableHead>
                    <TableHead className="px-4 text-right">Pesan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-slate-400">
                        {search ? 'Tidak ada hasil yang cocok.' : 'Belum ada log notifikasi.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="px-4 text-xs text-slate-500 whitespace-nowrap">
                          {formatDate(log.sent_at)}
                        </TableCell>
                        <TableCell className="px-4 font-medium text-slate-800">
                          {log.customer_name ?? '—'}
                        </TableCell>
                        <TableCell className="px-4 text-slate-600 text-xs">
                          {log.customer_phone ?? '—'}
                        </TableCell>
                        <TableCell className="px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                            {log.status_sent ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            log.wa_status === 'success'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${log.wa_status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                            {log.wa_status === 'success' ? 'Berhasil' : 'Gagal'}
                          </span>
                          {log.wa_status === 'failed' && log.error_msg && (
                            <p className="text-xs text-red-400 mt-0.5 truncate max-w-[120px]" title={log.error_msg}>
                              {log.error_msg}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="px-4 text-right">
                          <button
                            onClick={() => setExpandedMsg(expandedMsg === log.id ? null : log.id)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            {expandedMsg === log.id ? 'Tutup' : 'Lihat'}
                          </button>
                        </TableCell>
                        {expandedMsg === log.id && (
                          <TableCell colSpan={6} className="px-4 py-0 bg-slate-50 border-b">
                            <div className="py-3">
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Isi Pesan</p>
                              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans bg-white border rounded-lg p-3">
                                {log.message ?? '—'}
                              </pre>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-6 py-3 border-t bg-slate-50/50">
                <p className="text-xs text-slate-400">
                  {processed.length === 0
                    ? 'Tidak ada data'
                    : `Menampilkan ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, processed.length)} dari ${processed.length} log`}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={safePage <= 1} className="h-8 w-8 p-0">«</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} className="h-8 w-8 p-0">‹</Button>
                  <span className="text-xs text-slate-500 px-2">{safePage} / {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="h-8 w-8 p-0">›</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} className="h-8 w-8 p-0">»</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
