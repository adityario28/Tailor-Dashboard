import { useState, useEffect, useMemo } from 'react';
import { db, STATUS_FLOW } from '@/lib/db';
import { trx, supabase } from '@/lib/supabase';
import type { OrderStatus, Transaction, Customer, PaymentStatus, OrderGroup, GroupMember } from '@/lib/db';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SortPanel } from '@/components/SortPanel';
import type { SortEntry } from '@/components/SortPanel';
import WorkerAssignModal from '@/components/WorkerAssignModal';
import QrisGenerator from '@/components/QrisGenerator';
import { toast } from 'sonner';
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from '@/lib/currency';

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
  _type: 'individual';
  _itemCount: number;
}

interface GroupOrderRow {
  id: number;
  _customerName: string;
  _source: 'local' | 'remote';
  _type: 'group';
  name: string;
  commissioner: string;
  default_outfit_type?: string;
  payment_status?: PaymentStatus;
  created_at?: Date;
  memberCount: number;
  selesaiCount: number;
  ref_number?: number;
}

type TableRow = TransactionRow | GroupOrderRow;

const STATUS_COLORS: Record<OrderStatus, string> = {
  'Cuci Bahan':   'bg-blue-100 text-blue-700',
  'Potong Bahan': 'bg-orange-100 text-orange-700',
  Jahit:          'bg-purple-100 text-purple-700',
  Finishing:      'bg-yellow-100 text-yellow-700',
  'Siap Diambil': 'bg-green-100 text-green-700',
  Selesai:        'bg-emerald-100 text-emerald-700',
};

const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string }> = {
  belum_bayar: { label: 'Belum Bayar', color: 'bg-red-100 text-red-700' },
  dp:          { label: 'DP',          color: 'bg-yellow-100 text-yellow-700' },
  lunas:       { label: 'Lunas',       color: 'bg-green-100 text-green-700' },
};

const PAYMENT_SORT_ORDER: Record<string, number> = { belum_bayar: 0, dp: 1, lunas: 2 };
const STATUS_SORT_ORDER: Record<string, number>  = { 'Cuci Bahan': 0, 'Potong Bahan': 1, 'Jahit': 2, 'Finishing': 3, 'Siap Diambil': 4, 'Selesai': 5 };

const PAGE_SIZES = [10, 25, 50];

function formatDateTime(date: string | Date | undefined) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OrdersTable() {
  const [rows, setRows] = useState<TableRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [period, setPeriod]             = useState<Period>('all');
  const [sortStack, setSortStack]       = useState<SortEntry<SortKey>[]>(DEFAULT_SORT);
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(10);
  const [workerMap, setWorkerMap]       = useState<Map<number, string>>(new Map());

  // Worker assignment modal state
  const [workerModal, setWorkerModal] = useState<{
    open: boolean;
    trId: number;
    source: 'local' | 'remote';
    customerName: string;
    outfitType?: string;
    pendingStatus: OrderStatus;
  } | null>(null);

  // Settlement modal state
  const [settlementModal, setSettlementModal] = useState<{
    trId: number;
    source: 'local' | 'remote';
    customerName: string;
    totalPrice: number;
    amountPaid: number;
  } | null>(null);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementSaving, setSettlementSaving] = useState(false);
  const [settlementPaymentMethod, setSettlementPaymentMethod] = useState<'tunai' | 'qris'>('tunai');

  // QRIS Payment modal state
  const [showQrisModal, setShowQrisModal] = useState(false);
  const [qrisOrderId, setQrisOrderId] = useState<number | null>(null);
  const [qrisAmount, setQrisAmount] = useState(0);
  const [qrisCountdown, setQrisCountdown] = useState(5);
  const [isQrisSaveEnabled, setIsQrisSaveEnabled] = useState(false);
  const [paymentReceived, setPaymentReceived] = useState(false);

  // QRIS countdown effect
  useEffect(() => {
    if (showQrisModal && !paymentReceived) {
      setQrisCountdown(5);
      setIsQrisSaveEnabled(false);
      
      const interval = setInterval(() => {
        setQrisCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setIsQrisSaveEnabled(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [showQrisModal, paymentReceived]);

  // Auto-create pending_qris_payment when QRIS is selected in Settlement Modal
  useEffect(() => {
    if (!settlementModal || settlementPaymentMethod !== 'qris') return;
    
    const amount = parseCurrencyInput(settlementAmount);
    if (amount <= 0) return;

    const ensurePendingPayment = async () => {
      try {
        // Check if pending record already exists
        const { data: existing } = await trx.from('pending_qris_payment')
          .select('id, amount')
          .eq('order_id', settlementModal.trId)
          .eq('status', 'pending')
          .single();

        if (existing) {
          // If amount changed, update it
          if (existing.amount !== amount) {
            await trx.from('pending_qris_payment')
              .update({ amount })
              .eq('id', existing.id);
            console.log('Updated pending QRIS payment amount:', amount);
          }
          return;
        }

        // Create new pending payment
        const { error } = await trx.from('pending_qris_payment').insert({
          order_id: settlementModal.trId,
          amount: amount,
        });

        if (error) {
          console.error('Failed to create pending payment:', error);
        } else {
          console.log('Created pending QRIS payment for order:', settlementModal.trId, 'amount:', amount);
        }
      } catch (err) {
        console.error('Error in ensurePendingPayment:', err);
      }
    };

    ensurePendingPayment();
  }, [settlementModal, settlementPaymentMethod, settlementAmount]);

  // Realtime subscription for Settlement Modal QRIS payment (auto-complete)
  useEffect(() => {
    if (!settlementModal || settlementPaymentMethod !== 'qris') return;

    const channel = supabase
      .channel(`settlement-payment-${settlementModal.trId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'trx',
          table: 'transaction',
          filter: `id=eq.${settlementModal.trId}`,
        },
        async (payload) => {
          const newRecord = payload.new as Record<string, any>;
          const oldRecord = payload.old as Record<string, any>;

          const oldAmountPaid = oldRecord.amount_paid || 0;
          const newAmountPaid = newRecord.amount_paid || 0;

          if (newAmountPaid > oldAmountPaid) {
            // Payment received - update status to Selesai
            await trx.from('transaction')
              .update({ status: 'Selesai' })
              .eq('id', settlementModal.trId);

            // Mark pending payment as matched
            await trx.from('pending_qris_payment')
              .update({ status: 'matched', matched_at: new Date().toISOString() })
              .eq('order_id', settlementModal.trId)
              .eq('status', 'pending');

            toast.success('Pembayaran diterima! Order selesai.');
            setSettlementModal(null);
            loadDashboard(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [settlementModal, settlementPaymentMethod]);

  // Realtime subscription for QRIS payment
  useEffect(() => {
    if (!showQrisModal || !qrisOrderId) return;

    const channel = supabase
      .channel(`dashboard-payment-${qrisOrderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'trx',
          table: 'transaction',
          filter: `id=eq.${qrisOrderId}`,
        },
        (payload) => {
          const newRecord = payload.new as Record<string, any>;
          const oldRecord = payload.old as Record<string, any>;

          if (
            (newRecord.payment_status === 'lunas' || newRecord.payment_status === 'dp') &&
            newRecord.payment_status !== oldRecord.payment_status
          ) {
            setPaymentReceived(true);
            toast.success('Pembayaran diterima!');
            
            setTimeout(() => {
              setShowQrisModal(false);
              setPaymentReceived(false);
              loadDashboard(true);
            }, 1500);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showQrisModal, qrisOrderId]);

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

  const loadDashboard = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [localTrx, localCustomers, localGroups, localGroupMembers, localTrxItems] = await Promise.all([
        db.transactions.toArray(),
        db.customer.toArray(),
        db.order_group.toArray(),
        db.group_member.toArray(),
        db.transaction_item.toArray(),
      ]);
      const localCustomerMap = new Map(localCustomers.map(c => [c.id, c]));
      // Count items per local transaction
      const localItemCounts = new Map<number, number>();
      for (const item of localTrxItems) {
        localItemCounts.set(item.transaction_id, (localItemCounts.get(item.transaction_id) || 0) + 1);
      }
      const allRows: TableRow[] = [];

      // Process individual transactions
      const trxRows = new Map<string, TransactionRow>();
      for (const t of localTrx) {
        trxRows.set(`local-${t.id}`, {
          ...t, id: t.id!,
          _customerName: localCustomerMap.get(t.customer_id)?.name ?? 'Pelanggan',
          _source: 'local',
          _type: 'individual',
          _itemCount: localItemCounts.get(t.id!) || 0,
        });
      }

      if (navigator.onLine) {
        const [{ data: remoteTrx }, { data: remoteCustomers }, { data: remoteTrxItems }] = await Promise.all([
          trx.from('transaction').select('*'),
          trx.from('customer').select('*'),
          trx.from('transaction_item').select('id, transaction_id'),
        ]);
        const remoteCustomerMap = new Map((remoteCustomers as Customer[] ?? []).map(c => [c.id, c]));
        // Count items per remote transaction
        const remoteItemCounts = new Map<number, number>();
        for (const item of (remoteTrxItems as any[] ?? [])) {
          remoteItemCounts.set(item.transaction_id, (remoteItemCounts.get(item.transaction_id) || 0) + 1);
        }
        
        // Build set of remote IDs for deduplication
        const remoteIds = new Set((remoteTrx as Transaction[] ?? []).map(t => t.id));
        
        for (const t of (remoteTrx as Transaction[] ?? [])) {
          const customerName = remoteCustomerMap.get(t.customer_id)?.name ?? 'Pelanggan';
          
          // Find matching local by supabase_id (primary) or legacy fingerprint (fallback)
          const matchingLocalKey = [...trxRows.entries()].find(([, r]) => {
            if (r._source !== 'local' || !r.synced) return false;
            // Primary: match by supabase_id
            if (r.supabase_id && r.supabase_id === t.id) return true;
            // Fallback: legacy fingerprint match (for old records without supabase_id)
            return localCustomerMap.get(r.customer_id)?.name === customerName &&
              r.outfit_type === t.outfit_type &&
              r.panjang_kain === t.panjang_kain &&
              r.panjang_badan === t.panjang_badan;
          })?.[0];
          
          if (matchingLocalKey) {
            trxRows.delete(matchingLocalKey);
          }
          trxRows.set(`remote-${t.id}`, { ...t, id: t.id!, _customerName: customerName, _source: 'remote', _type: 'individual', _itemCount: remoteItemCounts.get(t.id!) || 0 });
        }
        
        // Also remove any local records that have supabase_id matching a remote (in case loop order missed it)
        for (const [key, r] of trxRows.entries()) {
          if (r._source === 'local' && r.supabase_id && remoteIds.has(r.supabase_id)) {
            trxRows.delete(key);
          }
        }
      }
      allRows.push(...trxRows.values());

      // Process group orders
      const groupRows = new Map<string, GroupOrderRow>();
      for (const g of localGroups) {
        const members = localGroupMembers.filter(m => m.group_id === g.id);
        groupRows.set(`local-group-${g.id}`, {
          id: g.id!,
          _customerName: g.name,
          _source: 'local',
          _type: 'group',
          name: g.name,
          commissioner: g.commissioner,
          default_outfit_type: g.default_outfit_type,
          payment_status: g.payment_status,
          created_at: g.created_at,
          memberCount: members.length,
          selesaiCount: members.filter(m => m.status === 'Selesai').length,
          ref_number: g.ref_number,
        });
      }

      if (navigator.onLine) {
        const [{ data: remoteGroups }, { data: remoteMembers }] = await Promise.all([
          trx.from('order_group').select('*'),
          trx.from('group_member').select('*'),
        ]);
        for (const g of (remoteGroups as OrderGroup[] ?? [])) {
          const members = (remoteMembers as GroupMember[] ?? []).filter(m => m.group_id === g.id);
          // Check if we have a matching local group
          const matchingLocalKey = [...groupRows.entries()].find(([, r]) =>
            r._source === 'local' && r.name === g.name
          )?.[0];
          if (matchingLocalKey) {
            groupRows.delete(matchingLocalKey);
          }
          groupRows.set(`remote-group-${g.id}`, {
            id: g.id!,
            _customerName: g.name,
            _source: 'remote',
            _type: 'group',
            name: g.name,
            commissioner: g.commissioner,
            default_outfit_type: g.default_outfit_type,
            payment_status: g.payment_status,
            created_at: g.created_at,
            memberCount: members.length,
            selesaiCount: members.filter(m => m.status === 'Selesai').length,
            ref_number: g.ref_number,
          });
        }
      }
      allRows.push(...groupRows.values());

      setRows(allRows);

      // Load worker names for display
      if (navigator.onLine) {
        const { data: wData } = await trx.from('worker').select('id, name');
        if (wData) {
          setWorkerMap(new Map((wData as any[]).map((w: any) => [w.id, w.name])));
        }
      } else {
        const ws = await db.worker.toArray();
        setWorkerMap(new Map(ws.map(w => [w.id!, w.name])));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      // Signal Astro to swap skeleton
      window.dispatchEvent(new CustomEvent('table-ready'));
    }
  };

  useEffect(() => { loadDashboard(); }, []);
  useEffect(() => { setPage(1); }, [search, period, sortStack]);

  const handleStatusChange = async (trId: number, source: 'local' | 'remote', newStatus: OrderStatus, customerName: string, outfitType?: string) => {
    // No-op if status hasn't changed
    const current = rows.find(t => t._type === 'individual' && t.id === trId) as TransactionRow | undefined;
    if (!current || current.status === newStatus) return;

    // Intercept "Selesai" — require payment settlement
    if (newStatus === 'Selesai') {
      const payStatus = (current as any)?.payment_status || 'belum_bayar';
      if (payStatus !== 'lunas') {
        const totalPrice = (current as any)?.total_price ?? 0;
        const amountPaid = (current as any)?.amount_paid ?? 0;
        const remaining = Math.max(0, totalPrice - amountPaid);
        setSettlementModal({ trId, source, customerName, totalPrice, amountPaid });
        setSettlementAmount(formatCurrencyInput(String(remaining)));
        return;
      }
    }

    // Intercept "Jahit" — require worker assignment
    if (newStatus === 'Jahit') {
      setWorkerModal({ open: true, trId, source, customerName, outfitType, pendingStatus: newStatus });
      return;
    }
    try {
      if (source === 'local') await db.transactions.update(trId, { status: newStatus, synced: false });
      if (navigator.onLine) {
        await trx.from('transaction').update({ status: newStatus }).eq('id', trId);
        if (source === 'local') await db.transactions.update(trId, { synced: true });
      }
      loadDashboard(true);
    } catch (err) { console.error('Error updating status:', err); }
  };

  const handleSettlement = async () => {
    if (!settlementModal) return;
    const { trId, source, totalPrice, amountPaid } = settlementModal;
    const paidNow = parseCurrencyInput(settlementAmount);
    
    // If QRIS payment, just show QRIS modal (pending payment already created by useEffect)
    if (settlementPaymentMethod === 'qris') {
      setQrisOrderId(trId);
      setQrisAmount(paidNow);
      setSettlementModal(null);
      setShowQrisModal(true);
      return;
    }

    // Tunai payment - save directly
    const newAmountPaid = amountPaid + paidNow;

    setSettlementSaving(true);
    try {
      const updates: Record<string, any> = {
        status: 'Selesai',
        amount_paid: newAmountPaid,
        payment_status: newAmountPaid >= totalPrice ? 'lunas' : 'dp',
      };

      if (source === 'local') await db.transactions.update(trId, { ...updates, synced: false });
      if (navigator.onLine) {
        await trx.from('transaction').update(updates).eq('id', trId);
        if (source === 'local') await db.transactions.update(trId, { synced: true });
      }

      toast.success('Pembayaran dilunaskan & status diubah ke Selesai.');
      setSettlementModal(null);
      loadDashboard(true);
    } catch (err) {
      console.error('handleSettlement error:', err);
      toast.error('Gagal melunasi pembayaran.');
    } finally {
      setSettlementSaving(false);
    }
  };

  const handleWorkerConfirm = async (workerId: number) => {
    if (!workerModal) return;
    const { trId, source, pendingStatus } = workerModal;
    try {
      if (source === 'local') {
        await db.transactions.update(trId, { status: pendingStatus, worker_id: workerId, synced: false });
        if (navigator.onLine) {
          await trx.from('transaction').update({ status: pendingStatus, worker_id: workerId }).eq('id', trId);
          await db.transactions.update(trId, { synced: true });
        }
      } else if (navigator.onLine) {
        await trx.from('transaction').update({ status: pendingStatus, worker_id: workerId }).eq('id', trId);
      }
      setWorkerModal(null);
      loadDashboard(true);
    } catch (err) {
      console.error('handleWorkerConfirm error:', err);
    }
  };

  function compareRows(a: TableRow, b: TableRow, key: SortKey): number {
    // For sorting, treat groups and individuals similarly
    switch (key) {
      case '_customerName': return a._customerName.localeCompare(b._customerName);
      case 'outfit_type': {
        const aOutfit = a._type === 'individual' ? (a as TransactionRow).outfit_type : (a as GroupOrderRow).default_outfit_type;
        const bOutfit = b._type === 'individual' ? (b as TransactionRow).outfit_type : (b as GroupOrderRow).default_outfit_type;
        return (aOutfit ?? '').localeCompare(bOutfit ?? '');
      }
      case 'created_at': {
        const da = a.created_at ? new Date(a.created_at as any).getTime() : 0;
        const db_ = b.created_at ? new Date(b.created_at as any).getTime() : 0;
        return da - db_;
      }
      case 'payment_status': {
        const aStatus = a._type === 'individual' ? (a as TransactionRow).payment_status : (a as GroupOrderRow).payment_status;
        const bStatus = b._type === 'individual' ? (b as TransactionRow).payment_status : (b as GroupOrderRow).payment_status;
        return (PAYMENT_SORT_ORDER[aStatus ?? 'belum_bayar'] ?? 0) - (PAYMENT_SORT_ORDER[bStatus ?? 'belum_bayar'] ?? 0);
      }
      case 'status': {
        // For groups, use a pseudo-status based on progress
        if (a._type === 'group' || b._type === 'group') return 0; // Groups don't have a single status
        return (STATUS_SORT_ORDER[(a as TransactionRow).status] ?? 0) - (STATUS_SORT_ORDER[(b as TransactionRow).status] ?? 0);
      }
      default: return 0;
    }
  }

  // ─── Pipeline: period → search → multi-sort ─────────────────────────────────
  const processed = useMemo(() => {
    let data = rows;

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
      data = data.filter(t => {
        if (t._type === 'individual') {
          const row = t as TransactionRow;
          return row._customerName.toLowerCase().includes(q) ||
            (row.outfit_type ?? '').toLowerCase().includes(q);
        } else {
          const row = t as GroupOrderRow;
          return row.name.toLowerCase().includes(q) ||
            row.commissioner.toLowerCase().includes(q) ||
            (row.default_outfit_type ?? '').toLowerCase().includes(q);
        }
      });
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
  }, [rows, period, search, sortStack]);

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
    <>
    <div className="space-y-4 w-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2 w-full sm:max-w-sm">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama pelanggan, jenis pakaian..." className="pl-8 h-9 text-sm" />
          </div>
          <SortPanel stack={sortStack} onChange={setSortStack} columns={SORT_COLUMNS} defaultStack={DEFAULT_SORT} />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto shrink-0 overflow-x-auto max-w-full">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${period === p.key ? 'bg-white text-indigo-600 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="w-full max-w-full overflow-x-auto">
      <table className="w-full text-sm min-w-[700px]">
        <thead>
          <tr className="border-b text-slate-500 text-left">
            <th className="pb-3 pl-4 sm:pl-6 font-medium">Nama Pelanggan</th>
            <th className="pb-3 font-medium min-w-[90px]">Jenis</th>
            <th className="pb-3 font-medium">Penjahit</th>
            <th className="pb-3 pl-4 font-medium whitespace-nowrap">Tanggal Order</th>
            <th className="pb-3 font-medium whitespace-nowrap">Status Bayar</th>
            <th className="pb-3 pr-4 sm:pr-6 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {paginated.length === 0 ? (
            <tr><td colSpan={6} className="py-10 text-center text-slate-400">
              {search || period !== 'all' ? 'Tidak ada pesanan yang cocok.' : 'Belum ada pesanan.'}
            </td></tr>
          ) : paginated.map(row => {
            // Group order row
            if (row._type === 'group') {
              const g = row as GroupOrderRow;
              const paymentStatus = (g.payment_status || 'belum_bayar') as PaymentStatus;
              const paymentConfig = PAYMENT_STATUS_CONFIG[paymentStatus];
              return (
                <tr key={`group-${g._source}-${g.id}`} className="border-b last:border-0 hover:bg-indigo-50/50 cursor-pointer bg-indigo-50/30"
                  onClick={() => window.location.href = `/group-order?id=${g.id}&src=${g._source}`}>
                  <td className="py-3 pl-4 sm:pl-6">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-indigo-100 text-indigo-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                      </span>
                      <span className="font-medium text-slate-900">{g.name}</span>
                      <span className="text-xs text-slate-400">({g.memberCount} orang)</span>
                      {g.ref_number ? (
                        <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">GRP-{g.ref_number}</span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Draft</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 text-slate-600 min-w-[90px]">{g.default_outfit_type || 'Beragam'}</td>
                  <td className="py-3 whitespace-nowrap">
                    <span className="text-slate-300">—</span>
                  </td>
                  <td className="py-3 pl-4 text-slate-500 whitespace-nowrap">{formatDateTime(g.created_at)}</td>
                  <td className="py-3">
                    <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${paymentConfig.color}`}>{paymentConfig.label}</span>
                  </td>
                  <td className="py-3 pr-4 sm:pr-6">
                    <span className="inline-block text-xs font-semibold px-2 py-1.5 rounded-full bg-slate-100 text-slate-700">
                      {g.selesaiCount} / {g.memberCount} Selesai
                    </span>
                  </td>
                </tr>
              );
            }

            // Individual transaction row
            const t = row as TransactionRow;
            const currentIdx      = STATUS_FLOW.indexOf(t.status as OrderStatus);
            const visibleStatuses = currentIdx >= 0 ? STATUS_FLOW.slice(currentIdx, currentIdx + 2) : STATUS_FLOW;
            const colorClass      = STATUS_COLORS[t.status] ?? '';
            const paymentStatus   = (t.payment_status || 'belum_bayar') as PaymentStatus;
            const paymentConfig   = PAYMENT_STATUS_CONFIG[paymentStatus];
            const workerName      = t.worker_id ? workerMap.get(t.worker_id) : null;
            const isSetOrder      = t._itemCount > 1;
            return (
              <tr key={`${t._source}-${t.id}`} className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                onClick={() => window.location.href = `/order?id=${t.id}&src=${t._source}`}>
                <td className="py-3 pl-4 sm:pl-6 font-medium text-slate-900">{t._customerName}</td>
                <td className="py-3 text-slate-600 min-w-[90px]">
                  <div className="flex items-center gap-1.5">
                    <span>{t.outfit_type || 'Pakaian'}</span>
                    {isSetOrder && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 whitespace-nowrap">
                        {t._itemCount} pcs
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 whitespace-nowrap">
                  {workerName
                    ? <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-1 rounded-full whitespace-nowrap">{workerName}</span>
                    : <span className="text-slate-300">—</span>
                  }
                </td>
                <td className="py-3 pl-4 text-slate-500 whitespace-nowrap">{formatDateTime(t.created_at)}</td>
                <td className="py-3">
                  <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${paymentConfig.color}`}>{paymentConfig.label}</span>
                </td>
                <td className="py-3 pr-4 sm:pr-6" onClick={e => e.stopPropagation()}>
                  <Select value={t.status} onValueChange={value => handleStatusChange(t.id, t._source, value as OrderStatus, t._customerName, t.outfit_type)}>
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
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t px-4 sm:px-6">
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

    {/* Worker Assignment Modal */}
    {workerModal && (
      <WorkerAssignModal
        open={workerModal.open}
        orderId={workerModal.trId}
        customerName={workerModal.customerName}
        outfitType={workerModal.outfitType}
        onConfirm={(workerId) => handleWorkerConfirm(workerId)}
        onCancel={() => setWorkerModal(null)}
      />
    )}

    {/* Settlement Modal */}
    <Dialog open={!!settlementModal} onOpenChange={(open) => {
      if (!open && settlementPaymentMethod === 'qris' && settlementModal) {
        // Cancel pending payment when closing modal
        trx.from('pending_qris_payment')
          .update({ status: 'cancelled' })
          .eq('order_id', settlementModal.trId)
          .eq('status', 'pending');
      }
      if (!open) setSettlementModal(null);
    }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pelunasan Pembayaran</DialogTitle>
          <DialogDescription>
            Pesanan <strong>{settlementModal?.customerName}</strong> siap diselesaikan. Selesaikan pembayaran terlebih dahulu.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Total Harga</Label>
              <div className="text-base font-semibold">
                {formatCurrency(settlementModal?.totalPrice)}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Sudah Dibayar</Label>
              <div className="text-base font-semibold text-green-600">
                {formatCurrency(settlementModal?.amountPaid)}
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Bayar Sekarang (Rp)</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={settlementAmount}
              onChange={(e) => setSettlementAmount(formatCurrencyInput(e.target.value))}
              className="h-12 text-base font-semibold"
            />
          </div>

          <div className="space-y-2">
            <Label>Metode Pembayaran</Label>
            <Select value={settlementPaymentMethod} onValueChange={(v) => {
              const newMethod = v as 'tunai' | 'qris';
              // If switching from QRIS to tunai, cancel pending payment
              if (settlementPaymentMethod === 'qris' && newMethod === 'tunai' && settlementModal) {
                trx.from('pending_qris_payment')
                  .update({ status: 'cancelled' })
                  .eq('order_id', settlementModal.trId)
                  .eq('status', 'pending');
              }
              setSettlementPaymentMethod(newMethod);
            }}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tunai">Tunai</SelectItem>
                <SelectItem value="qris">QRIS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {settlementPaymentMethod === 'qris' && settlementModal && (
            <QrisGenerator 
              amount={parseCurrencyInput(settlementAmount)} 
              orderId={settlementModal.trId}
              hideHeader={true}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSettlementModal(null)}>Batal</Button>
          <Button onClick={handleSettlement} disabled={settlementSaving} className="bg-green-600 hover:bg-green-700">
            {settlementSaving ? 'Memproses...' : (settlementPaymentMethod === 'qris' ? 'Lunaskan' : 'Lunaskan & Selesai')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* QRIS Payment Modal */}
    <Dialog open={showQrisModal} onOpenChange={(open) => {
      if (!open && !paymentReceived) {
        trx.from('pending_qris_payment')
          .update({ status: 'cancelled' })
          .eq('order_id', qrisOrderId)
          .eq('status', 'pending');
      }
      setShowQrisModal(open);
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {paymentReceived ? '✅ Pembayaran Diterima!' : 'Pembayaran QRIS'}
          </DialogTitle>
          <DialogDescription>
            {paymentReceived 
              ? 'Pembayaran berhasil. Status akan diperbarui.'
              : 'Minta customer scan QR code untuk membayar.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {paymentReceived ? (
            <div className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-green-700">Pembayaran Berhasil!</p>
            </div>
          ) : (
            <QrisGenerator 
              amount={qrisAmount} 
              orderId={qrisOrderId || undefined}
              hideHeader={true}
            />
          )}
        </div>

        {!paymentReceived && (
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <div className="text-center text-sm text-slate-500 mb-2">
              {isQrisSaveEnabled ? (
                <p>Sudah terima pembayaran? Klik "Simpan Manual"</p>
              ) : (
                <p>Menunggu pembayaran... ({qrisCountdown}s)</p>
              )}
            </div>
            <div className="flex gap-2 w-full">
              <Button 
                variant="outline" 
                onClick={() => {
                  trx.from('pending_qris_payment')
                    .update({ status: 'cancelled' })
                    .eq('order_id', qrisOrderId)
                    .eq('status', 'pending');
                  setShowQrisModal(false);
                }}
                className="flex-1"
              >
                Batalkan
              </Button>
              <Button 
                onClick={async () => {
                  if (!qrisOrderId) return;
                  
                  // Manual save
                  const updates = {
                    status: 'Selesai',
                    amount_paid: qrisAmount,
                    payment_status: 'lunas',
                  };
                  
                  await trx.from('transaction').update(updates).eq('id', qrisOrderId);
                  
                  await trx.from('pending_qris_payment')
                    .update({ status: 'matched', matched_at: new Date().toISOString() })
                    .eq('order_id', qrisOrderId)
                    .eq('status', 'pending');
                  
                  setShowQrisModal(false);
                  toast.success('Pembayaran dilunaskan & status diubah ke Selesai.');
                  loadDashboard(true);
                }}
                disabled={!isQrisSaveEnabled}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              >
                {isQrisSaveEnabled ? 'Simpan Manual' : `Tunggu ${qrisCountdown}s...`}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
