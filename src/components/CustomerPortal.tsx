import { useState, useEffect } from 'react';
import { trx } from '@/lib/supabase';

const STATUS_FLOW = ['Cuci Bahan', 'Potong Bahan', 'Jahit', 'Finishing', 'Siap Diambil'];

const STATUS_DESCRIPTIONS: Record<string, string> = {
  'Cuci Bahan':   'Kain sedang dicuci & disiapkan',
  'Potong Bahan': 'Kain sedang dipotong sesuai ukuran',
  'Jahit':        'Pakaian sedang dijahit',
  'Finishing':    'Tahap akhir & pengecekan kualitas',
  'Siap Diambil': 'Pakaian siap diambil!',
  'Selesai': 'Pesanan selesai, terima kasih!',
};

interface OrderData {
  id: number;
  customer_name: string;
  outfit_type: string;
  status: string;
  created_at: string;
}

// Map: status name → timestamp when it was reached
type StatusTimestamps = Record<string, string>;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function CustomerPortal() {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [timestamps, setTimestamps] = useState<StatusTimestamps>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('id');
    if (!token) { setNotFound(true); setLoading(false); return; }
    loadOrder(token);
  }, []);

  async function loadOrder(token: string) {
    try {
      const { data, error } = await trx
        .from('transaction')
        .select('id, status, outfit_type, created_at, customer_id')
        .eq('portal_token', token)
        .single();

      if (error || !data) { setNotFound(true); return; }

      const txId = (data as any).id;

      // Fetch customer name and status logs in parallel
      const [customerRes, logsRes] = await Promise.all([
        trx.from('customer').select('name').eq('id', (data as any).customer_id).single(),
        trx.from('transaction_log')
          .select('old_value, new_value, changed_at')
          .eq('transaction_id', txId)
          .eq('field_changed', 'status')
          .order('changed_at', { ascending: true }),
      ]);

      setOrder({
        id: txId,
        customer_name: (customerRes.data as any)?.name ?? 'Pelanggan',
        outfit_type: (data as any).outfit_type ?? 'Pakaian',
        status: (data as any).status,
        created_at: (data as any).created_at,
      });

      // Build timestamp map:
      // - First status (Cuci Bahan) started at created_at
      // - Each log entry: new_value reached at changed_at, old_value finished at changed_at
      const tsMap: StatusTimestamps = {};
      tsMap['Cuci Bahan'] = (data as any).created_at; // started at order creation

      for (const log of ((logsRes.data ?? []) as any[])) {
        // The old_value status was completed when this change happened
        if (log.old_value) tsMap[`${log.old_value}__done`] = log.changed_at;
        // The new_value status started at this change
        if (log.new_value) tsMap[log.new_value] = log.changed_at;
      }

      setTimestamps(tsMap);
    } catch (err) {
      console.error('CustomerPortal error:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500">Memuat status pesanan...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-800">Pesanan tidak ditemukan</h1>
          <p className="text-sm text-slate-500">
            Link ini tidak valid atau sudah kedaluwarsa. Silakan hubungi kami untuk informasi lebih lanjut.
          </p>
        </div>
      </div>
    );
  }

  const currentIdx = STATUS_FLOW.indexOf(order!.status);
  const isDone = order!.status === 'Selesai' || order!.status === 'Siap Diambil';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className={`${isDone ? 'bg-green-600' : 'bg-indigo-600'} text-white px-6 py-8 text-center`}>
        <p className="text-sm font-medium opacity-80 mb-1">Status Pesanan</p>
        <h1 className="text-2xl font-bold">{order!.customer_name}</h1>
        <p className="text-sm opacity-80 mt-1">{order!.outfit_type}</p>
        {order!.created_at && (
          <p className="text-xs opacity-60 mt-2">Dipesan: {formatDate(order!.created_at)}</p>
        )}
      </div>

      <div className="max-w-md mx-auto px-6 py-8 space-y-8">
        {/* Current status banner */}
        <div className={`rounded-xl p-5 text-center ${isDone ? 'bg-green-50 border border-green-200' : 'bg-indigo-50 border border-indigo-100'}`}>
          {isDone && (
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
          )}
          <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDone ? 'text-green-600' : 'text-indigo-500'}`}>
            Status Saat Ini
          </p>
          <p className={`text-2xl font-bold ${isDone ? 'text-green-700' : 'text-indigo-700'}`}>
            {order!.status}
          </p>
          <p className={`text-sm mt-1 ${isDone ? 'text-green-600' : 'text-indigo-500'}`}>
            {STATUS_DESCRIPTIONS[order!.status] ?? ''}
          </p>
          {timestamps[order!.status] && (
            <p className={`text-xs mt-2 ${isDone ? 'text-green-500' : 'text-indigo-400'}`}>
              Sejak {formatDateTime(timestamps[order!.status])}
            </p>
          )}
        </div>

        {/* Progress steps */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Progress Pengerjaan</p>
          {STATUS_FLOW.map((step, idx) => {
            const isStepDone    = idx < currentIdx;
            const isCurrent     = idx === currentIdx;
            const startedAt     = timestamps[step];
            const completedAt   = timestamps[`${step}__done`];

            return (
              <div key={step} className="flex items-start gap-3">
                {/* Icon */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  isStepDone ? 'bg-green-500' :
                  isCurrent  ? 'bg-indigo-600' :
                               'bg-slate-200'
                }`}>
                  {isStepDone ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <span className={`text-xs font-bold ${isCurrent ? 'text-white' : 'text-slate-400'}`}>{idx + 1}</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-semibold ${
                      isStepDone ? 'text-green-700' :
                      isCurrent  ? 'text-indigo-700' :
                                   'text-slate-400'
                    }`}>
                      {step}
                    </p>
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        Berlangsung
                      </span>
                    )}
                  </div>

                  <p className={`text-xs mt-0.5 ${
                    isStepDone ? 'text-green-600' :
                    isCurrent  ? 'text-indigo-400' :
                                 'text-slate-300'
                  }`}>
                    {STATUS_DESCRIPTIONS[step]}
                  </p>

                  {/* Timestamps */}
                  {isStepDone && (
                    <p className="text-xs text-green-500 mt-1">
                      ✓ Selesai{completedAt ? ` ${formatDateTime(completedAt)}` : ''}
                    </p>
                  )}
                  {isCurrent && startedAt && (
                    <p className="text-xs text-indigo-400 mt-1">
                      Dimulai {formatDateTime(startedAt)}
                    </p>
                  )}

                  {/* Connector line */}
                  {idx < STATUS_FLOW.length - 1 && (
                    <div
                      className={`mt-2 ${isStepDone ? 'bg-green-300' : 'bg-slate-200'}`}
                      style={{ marginLeft: '-22px', width: '2px', height: '16px' }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="text-center pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-400">
            Halaman ini diperbarui otomatis saat status berubah.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Pertanyaan? Hubungi kami via WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}

