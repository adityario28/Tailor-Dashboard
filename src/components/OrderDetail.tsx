import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import MeasurementSketch from '@/components/measurementSketch';
import { db, STATUS_FLOW, deductMaterialStock } from '@/lib/db';
import type { Material, MaterialUsage } from '@/lib/db';
import { trx } from '@/lib/supabase';
import type { OrderStatus, Transaction, Customer, PaymentStatus } from '@/lib/db';
import { toast } from 'sonner';
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from '@/lib/currency';

interface OrderDetailProps {
  orderId: number;
  source?: 'local' | 'remote' | null;
}

const JAS_FIELDS: [string, string, string][] = [
  ['panjangBadan', 'Panjang Badan', 'panjang_badan'],
  ['lebarBahu', 'Lebar Bahu', 'lebar_bahu'],
  ['panjangLengan', 'Panjang Lengan', 'panjang_lengan'],
  ['lingkarLengan', 'Lingkar Lengan', 'lingkar_lengan'],
  ['lingkarUjungLengan', 'Lingkar Ujung Lengan', 'lingkar_ujung_lengan'],
  ['lingkarDada', 'Lingkar Dada', 'lingkar_dada'],
  ['lingkarPerut', 'Lingkar Perut', 'lingkar_perut'],
  ['lingkarPinggul', 'Lingkar Pinggul', 'lingkar_pinggul'],
];

const KEMEJA_PANJANG_FIELDS: [string, string, string][] = [
  ['lingkarLeher', 'Lingkar Leher', 'lingkar_leher'],
  ['lebarBahu', 'Lebar Bahu', 'lebar_bahu'],
  ['panjangLengan', 'Panjang Lengan', 'panjang_lengan'],
  ['lingkarDada', 'Lingkar Dada', 'lingkar_dada'],
  ['lingkarPerut', 'Lingkar Perut', 'lingkar_perut'],
  ['panjangBadan', 'Panjang Badan', 'panjang_badan'],
  ['lingkarUjungLengan', 'Lingkar Ujung Lengan', 'lingkar_ujung_lengan'],
  ['lingkarPinggul', 'Lingkar Pinggul', 'lingkar_pinggul'],
];

const KEMEJA_PENDEK_FIELDS: [string, string, string][] = [
  ['lingkarLeher', 'Lingkar Leher', 'lingkar_leher'],
  ['lebarBahu', 'Panjang Bahu', 'lebar_bahu'],
  ['panjangLengan', 'Panjang Lengan', 'panjang_lengan'],
  ['lebarPundak', 'Lebar Pundak', 'lebar_pundak'],
  ['lingkarDada', 'Lebar Dada', 'lingkar_dada'],
  ['panjangBadan', 'Panjang Badan', 'panjang_badan'],
  ['lingkarLengan', 'Lingkar Lengan', 'lingkar_lengan'],
  ['lingkarPinggul', 'Lebar Pinggul', 'lingkar_pinggul'],
];

function isKemejaLenganPendek(outfit: string): boolean {
  return outfit.toLowerCase().includes('kemeja') && outfit.toLowerCase().includes('pendek');
}

function isKemejaLenganPanjang(outfit: string): boolean {
  return outfit.toLowerCase().includes('kemeja') && outfit.toLowerCase().includes('panjang');
}

function getFieldsForOutfit(outfit: string) {
  if (isKemejaLenganPendek(outfit)) return KEMEJA_PENDEK_FIELDS;
  if (isKemejaLenganPanjang(outfit)) return KEMEJA_PANJANG_FIELDS;
  return JAS_FIELDS;
}

export default function OrderDetail({ orderId, source }: OrderDetailProps) {
  const [order, setOrder] = useState<Record<string, any> | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>('Cuci Bahan');
  const [isSaving, setIsSaving] = useState(false);
  const [dataSource, setDataSource] = useState<'local' | 'remote' | null>(null);
  const [actualOrderId, setActualOrderId] = useState(0);
  
  const [showDpModal, setShowDpModal] = useState(false);
  const [dpAmount, setDpAmount] = useState('');
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'tunai' | 'qris'>('tunai');
  const [settlementAmount, setSettlementAmount] = useState('');

  // Material usage state
  const [materials, setMaterials] = useState<Material[]>([]);
  const [usageList, setUsageList] = useState<(MaterialUsage & { material_name?: string; unit?: string })[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [newUsageMaterialId, setNewUsageMaterialId] = useState<string>('');
  const [newUsageQty, setNewUsageQty] = useState('');
  const [savingUsage, setSavingUsage] = useState(false);
  const [showDeleteUsageDialog, setShowDeleteUsageDialog] = useState(false);
  const [deleteUsageTarget, setDeleteUsageTarget] = useState<MaterialUsage | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get('id')) || 0;
    const src = params.get('src') as 'local' | 'remote' | null;
    
    console.log('Reading from URL - id:', id, 'src:', src);
    
    if (id) {
      setActualOrderId(id);
      loadOrder(id, src);
      loadMaterials();
      loadUsage(id);
    }
  }, []);

  const loadMaterials = async () => {
    if (navigator.onLine) {
      const { data, error } = await trx.from('material').select('*').order('name');
      if (!error && data) { setMaterials(data as Material[]); return; }
    }
    const local = await db.material.orderBy('name').toArray();
    setMaterials(local);
  };

  const loadUsage = async (orderId: number) => {
    setUsageLoading(true);
    try {
      let list: (MaterialUsage & { material_name?: string; unit?: string })[] = [];

      if (navigator.onLine) {
        const { data, error } = await trx
          .from('material_usage')
          .select('*')
          .eq('transaction_id', orderId);
        if (!error && data && data.length > 0) {
          const matIds = [...new Set((data as any[]).map((u: any) => u.material_id))];
          const { data: mats } = await trx.from('material').select('id, name, unit').in('id', matIds);
          const matMap = new Map<number, { name: string; unit: string }>(
            (mats ?? []).map((m: any) => [m.id, { name: m.name, unit: m.unit }])
          );
          list = (data as any[]).map((u: any) => ({
            ...u,
            material_name: matMap.get(u.material_id)?.name ?? '—',
            unit: matMap.get(u.material_id)?.unit ?? '',
          }));
          setUsageList(list);
          return;
        }
      }

      // Offline fallback: Dexie
      const localUsage = await db.material_usage
        .where('transaction_id').equals(orderId).toArray();
      const allMats = await db.material.toArray();
      const matMap = new Map(allMats.map(m => [m.id!, m]));
      list = localUsage.map(u => ({
        ...u,
        material_name: matMap.get(u.material_id)?.name ?? '—',
        unit: matMap.get(u.material_id)?.unit ?? '',
      }));
      setUsageList(list);
    } catch (err) {
      console.error('loadUsage error:', err);
    } finally {
      setUsageLoading(false);
    }
  };

  const handleAddUsage = async () => {
    if (!newUsageMaterialId) { toast.error('Pilih bahan terlebih dahulu.'); return; }
    const qty = parseFloat(newUsageQty);
    if (!qty || qty <= 0) { toast.error('Masukkan jumlah yang valid.'); return; }

    const matId = Number(newUsageMaterialId);
    const mat = materials.find(m => m.id === matId);
    if (!mat) { toast.error('Bahan tidak ditemukan.'); return; }

    // Check stock
    if (mat.current_stock < qty) {
      toast.error(`Stok ${mat.name} tidak cukup (tersedia: ${mat.current_stock} ${mat.unit}).`);
      return;
    }

    setSavingUsage(true);
    try {
      const usagePayload: Omit<MaterialUsage, 'id'> = {
        transaction_id: actualOrderId,
        material_id: matId,
        quantity_used: qty,
        cost_per_unit_snapshot: mat.avg_cost_per_unit,
        synced: false,
      };

      const localId = await db.material_usage.add(usagePayload);

      // Deduct stock
      await deductMaterialStock(matId, qty);

      // Sync to Supabase if online
      if (navigator.onLine) {
        const { synced: _s, ...sp } = usagePayload as any;
        const { error } = await trx.from('material_usage').insert(sp);
        if (!error) await db.material_usage.update(localId, { synced: true });
      }

      toast.success('Penggunaan bahan dicatat.');
      setNewUsageMaterialId('');
      setNewUsageQty('');
      loadUsage(actualOrderId);
      loadMaterials(); // refresh stock
    } catch (err) {
      console.error('handleAddUsage error:', err);
      toast.error('Gagal mencatat penggunaan bahan.');
    } finally {
      setSavingUsage(false);
    }
  };

  const handleDeleteUsage = async () => {
    if (!deleteUsageTarget) return;
    try {
      // Restore stock
      await deductMaterialStock(deleteUsageTarget.material_id, -deleteUsageTarget.quantity_used);

      if (deleteUsageTarget.id) {
        await db.material_usage.delete(deleteUsageTarget.id);
        if (navigator.onLine) {
          await trx.from('material_usage').delete().eq('id', deleteUsageTarget.id);
        }
      }

      toast.success('Penggunaan bahan dihapus & stok dikembalikan.');
      setShowDeleteUsageDialog(false);
      setDeleteUsageTarget(null);
      loadUsage(actualOrderId);
      loadMaterials();
    } catch (err) {
      console.error('handleDeleteUsage error:', err);
      toast.error('Gagal menghapus penggunaan bahan.');
    }
  };

  const loadOrder = async (id: number, src: 'local' | 'remote' | null) => {
    console.log('loadOrder called with orderId:', id, 'source:', src);
    if (!id) return;

    let orderData: Record<string, any> | null = null;
    let custName = '';
    let custPhone = '';
    let actualSource: 'local' | 'remote' | null = null;

    if (src === 'local') {
      console.log('Fetching from local...');
      const local = await db.transactions.get(id);
      if (local) {
        orderData = local as Record<string, any>;
        const customer = await db.customer.get(local.customer_id);
        custName = customer?.name ?? '';
        custPhone = customer?.phone ?? '';
        actualSource = 'local';
      }
    } else if (src === 'remote' && navigator.onLine) {
      console.log('Fetching from remote...');
      const { data: remoteTrx, error } = await trx.from('transaction').select('*').eq('id', id).single();
      console.log('Remote transaction:', remoteTrx, 'error:', error);
      if (remoteTrx) {
        orderData = remoteTrx as Record<string, any>;
        const { data: remoteCust } = await trx.from('customer').select('*').eq('id', orderData.customer_id).single();
        custName = (remoteCust as any)?.name ?? '';
        custPhone = (remoteCust as any)?.phone ?? '';
        actualSource = 'remote';
      }
    } else {
      const local = await db.transactions.get(id);
      if (local) {
        orderData = local as Record<string, any>;
        const customer = await db.customer.get(local.customer_id);
        custName = customer?.name ?? '';
        custPhone = customer?.phone ?? '';
        actualSource = 'local';
      } else if (navigator.onLine) {
        const { data: remoteTrx } = await trx.from('transaction').select('*').eq('id', id).single();
        if (remoteTrx) {
          orderData = remoteTrx as Record<string, any>;
          const { data: remoteCust } = await trx.from('customer').select('*').eq('id', orderData.customer_id).single();
          custName = (remoteCust as any)?.name ?? '';
          custPhone = (remoteCust as any)?.phone ?? '';
          actualSource = 'remote';
        }
      }
    }

    console.log('Final orderData:', orderData);
    if (orderData) {
      setOrder(orderData);
      setCustomerName(custName);
      setCustomerPhone(custPhone);
      setSelectedStatus(orderData.status as OrderStatus);
      setDataSource(actualSource);

      // Notify sketch component (with delay to ensure it's mounted)
      const outfit = orderData.outfit_type ?? '';
      const fields = getFieldsForOutfit(outfit);
      
      setTimeout(() => {
        (window as any).__lastOutfit = outfit;
        window.dispatchEvent(new CustomEvent('outfit-update', { detail: outfit }));
        
        fields.forEach(([reactId, , dbKey]) => {
          const value = orderData[dbKey];
          if (value != null) {
            window.dispatchEvent(new CustomEvent('measurement-update', {
              detail: { id: reactId, value: String(value) },
            }));
          }
        });
      }, 100);
    }
  };

  const handleStatusSave = async () => {
    setIsSaving(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const id = Number(params.get('id')) || 0;
      
      // Check if status is changing to "Siap Diambil"
      const isChangingToReady = selectedStatus === 'Siap Diambil' && order?.status !== 'Siap Diambil';

      // Warn if no material usage recorded yet
      if (isChangingToReady && usageList.length === 0) {
        const confirmed = window.confirm(
          'Belum ada bahan yang dicatat untuk order ini. Lanjutkan perubahan status?'
        );
        if (!confirmed) { setIsSaving(false); return; }
      }

      const paymentStatus = order?.payment_status || 'belum_bayar';
      
      if (isChangingToReady && paymentStatus !== 'lunas') {
        // Show settlement modal instead of directly saving
        const totalPrice = order?.total_price || 0;
        const amountPaid = order?.amount_paid || 0;
        const remaining = totalPrice - amountPaid;
        setSettlementAmount(formatCurrencyInput(String(remaining)));
        setShowSettlementModal(true);
        setIsSaving(false);
        return;
      }
      
      if (dataSource === 'local') {
        await db.transactions.update(id, { status: selectedStatus, synced: false });
        if (navigator.onLine) {
          await trx.from('transaction').update({ status: selectedStatus }).eq('id', id);
          await db.transactions.update(id, { synced: true });
        }
      } else if (dataSource === 'remote') {
        if (navigator.onLine) {
          await trx.from('transaction').update({ status: selectedStatus }).eq('id', id);
        }
      }
      toast.success(`Status diperbarui ke "${selectedStatus}"`);
      
      if (order) {
        setOrder({ ...order, status: selectedStatus });
      }
    } catch (err) {
      toast.error('Gagal menyimpan status. Silakan coba lagi.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDpPayment = async () => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get('id')) || 0;
    const amount = parseCurrencyInput(dpAmount);
    
    if (amount <= 0) {
      toast.error('Masukkan jumlah DP yang valid.');
      return;
    }

    try {
      const totalPrice = order?.total_price || 0;
      const newPaymentStatus: PaymentStatus = amount >= totalPrice ? 'lunas' : 'dp';
      
      if (dataSource === 'local') {
        await db.transactions.update(id, { amount_paid: amount, payment_status: newPaymentStatus, synced: false });
        if (navigator.onLine) {
          await trx.from('transaction').update({ amount_paid: amount, payment_status: newPaymentStatus }).eq('id', id);
          await db.transactions.update(id, { synced: true });
        }
      } else if (dataSource === 'remote' && navigator.onLine) {
        await trx.from('transaction').update({ amount_paid: amount, payment_status: newPaymentStatus }).eq('id', id);
      }
      
      setOrder({ ...order, amount_paid: amount, payment_status: newPaymentStatus });
      setShowDpModal(false);
      setDpAmount('');
      toast.success('DP berhasil dicatat.');
    } catch (err) {
      toast.error('Gagal menyimpan DP.');
      console.error(err);
    }
  };

  const handleSettlement = async () => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get('id')) || 0;
    const amount = parseCurrencyInput(settlementAmount);
    
    if (amount <= 0) {
      toast.error('Masukkan jumlah pembayaran yang valid.');
      return;
    }

    try {
      const currentPaid = order?.amount_paid || 0;
      const newTotalPaid = currentPaid + amount;
      
      if (dataSource === 'local') {
        await db.transactions.update(id, { 
          amount_paid: newTotalPaid, 
          payment_status: 'lunas',
          status: selectedStatus,
          synced: false 
        });
        if (navigator.onLine) {
          await trx.from('transaction').update({ 
            amount_paid: newTotalPaid, 
            payment_status: 'lunas',
            status: selectedStatus
          }).eq('id', id);
          await db.transactions.update(id, { synced: true });
        }
      } else if (dataSource === 'remote' && navigator.onLine) {
        await trx.from('transaction').update({ 
          amount_paid: newTotalPaid, 
          payment_status: 'lunas',
          status: selectedStatus
        }).eq('id', id);
      }
      
      setOrder({ ...order, amount_paid: newTotalPaid, payment_status: 'lunas', status: selectedStatus });
      setShowSettlementModal(false);
      toast.success('Pembayaran lunas! Status diperbarui.');
      
      // TODO: Print receipt here
    } catch (err) {
      toast.error('Gagal menyimpan pembayaran.');
      console.error(err);
    }
  };

  if (!order) {
    return (
      <div className="container mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-slate-500 hover:text-slate-900 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </a>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Detail Pesanan</h1>
        </div>
        <Card className="overflow-hidden border-2 shadow-xl">
          <CardHeader>
            <CardTitle>Memuat...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const outfit = order.outfit_type ?? '';
  const fields = getFieldsForOutfit(outfit);
  const currentIdx = STATUS_FLOW.indexOf(selectedStatus);

  const totalUsageCost = usageList.reduce(
    (sum, u) => sum + u.quantity_used * u.cost_per_unit_snapshot, 0
  );

  return (
    <div className="container mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <a href="/dashboard" className="text-slate-500 hover:text-slate-900 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </a>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Detail Pesanan</h1>
      </div>

      <Card className="overflow-hidden border-2 shadow-xl">
        <CardHeader className="border-b bg-slate-50">
          <CardTitle>Pesanan #{actualOrderId} — {customerName}</CardTitle>
        </CardHeader>

        <Tabs defaultValue="ukuran" className="w-full">
          <div className="px-6 pt-4 border-b">
            <TabsList className="h-10">
              <TabsTrigger value="ukuran" className="px-5">Ukuran & Status</TabsTrigger>
              <TabsTrigger value="bahan" className="px-5 relative">
                Penggunaan Bahan
                {usageList.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">
                    {usageList.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── TAB 1: Ukuran & Status ── */}
          <TabsContent value="ukuran" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {/* KIRI: Fields display-only */}
              <div className="px-8 pb-8 pt-6 space-y-6 bg-white">
                <div className="grid grid-cols-1 gap-6">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-2">
                      <Label>Nama Pelanggan</Label>
                      <Input value={customerName} className="h-12 text-base border-2 bg-slate-50" disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>No. HP / WA</Label>
                      <Input value={customerPhone} className="h-12 text-base border-2 bg-slate-50" disabled />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Jenis Pakaian</Label>
                    <Input value={outfit} className="h-12 text-base border-2 bg-slate-50" disabled />
                  </div>

                  <div className="grid grid-cols-3 gap-4 items-end">
                    <div className="space-y-2">
                      <Label>P Kain (m)</Label>
                      <Input value={order.panjang_kain ?? ''} className="h-12 border-2 bg-slate-50" disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>L Kain (m)</Label>
                      <Input value={order.lebar_kain ?? ''} className="h-12 border-2 bg-slate-50" disabled />
                    </div>
                    <div className="flex flex-col items-center gap-1 pb-2">
                      <Label className="text-xs text-center">Cuci Dulu?</Label>
                      <span className="text-sm font-medium px-3 py-1.5 rounded-md bg-slate-100 text-slate-600">
                        {order.cuci_sebelum_potong ? 'Ya' : 'Tidak'}
                      </span>
                    </div>
                  </div>
                </div>

                <hr />

                {/* Measurement fields */}
                <div className="grid px-3 grid-cols-2 gap-x-9 gap-y-6">
                  {fields.map(([reactId, label, dbKey], i) => {
                    const val = order[dbKey] ?? '—';
                    return (
                      <div key={reactId} className="space-y-2 relative">
                        <div className="absolute left-[-1.75rem] top-[2.75rem] -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-sm">
                          {i + 1}
                        </div>
                        <Label>{label} (cm)</Label>
                        <Input value={val} disabled className="h-12 border-2 bg-slate-50" />
                      </div>
                    );
                  })}
                </div>

                {order.catatan && (
                  <div className="space-y-2">
                    <Label>Catatan</Label>
                    <textarea
                      value={order.catatan}
                      disabled
                      className="w-full min-h-[80px] rounded-md border-2 border-input bg-slate-50 px-3 py-2 text-base resize-none"
                    />
                  </div>
                )}

                <hr />

                {/* Payment section */}
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Informasi Pembayaran</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm text-slate-500">Total Harga</Label>
                      <div className="text-lg font-semibold text-slate-900">
                        {formatCurrency(order.total_price)}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-slate-500">Sudah Dibayar</Label>
                      <div className="text-lg font-semibold text-green-600">
                        {formatCurrency(order.amount_paid)}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-slate-500">Sisa Pembayaran</Label>
                      <div className="text-lg font-semibold text-amber-600">
                        {formatCurrency(Math.max(0, (order.total_price || 0) - (order.amount_paid || 0)))}
                      </div>
                    </div>
                  </div>
                  
                  {order.payment_status === 'belum_bayar' && (
                    <Button
                      onClick={() => setShowDpModal(true)}
                      className="w-full h-12 bg-amber-600 hover:bg-amber-700 font-semibold"
                    >
                      Bayar DP
                    </Button>
                  )}
                </div>

                <hr />

                {/* Status update section */}
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Ubah Status</Label>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1 space-y-2">
                      <Label className="text-sm text-slate-500">Status berikutnya</Label>
                      <Select value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as OrderStatus)}>
                        <SelectTrigger className="h-12 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_FLOW.map((s, i) => (
                            <SelectItem key={s} value={s} disabled={i < currentIdx}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={handleStatusSave}
                      disabled={isSaving}
                      className="h-12 px-6 bg-indigo-600 hover:bg-indigo-700 font-semibold"
                    >
                      {isSaving ? 'Menyimpan...' : 'Simpan Status'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* KANAN: Sketch */}
              <div className="p-6 bg-slate-50 flex flex-col justify-center items-center min-h-[600px]">
                <p className="text-sm text-slate-500 mb-3 font-medium">Pratinjau Sketsa</p>
                <div className="w-full h-full" style={{ minHeight: '500px' }}>
                  <MeasurementSketch />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── TAB 2: Penggunaan Bahan ── */}
          <TabsContent value="bahan" className="mt-0 px-6 py-6">
            <div className="space-y-6">

              {/* Summary */}
              {usageList.length > 0 && (
                <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                  <div>
                    <p className="text-sm text-indigo-600 font-medium">Total Biaya Bahan</p>
                    <p className="text-2xl font-bold text-indigo-700">{formatCurrency(totalUsageCost)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-indigo-500">{usageList.length} jenis bahan</p>
                  </div>
                </div>
              )}

              {/* Add usage form */}
              <div className="space-y-3">
                <Label className="text-base font-semibold text-slate-700">Tambah Penggunaan Bahan</Label>
                {materials.length === 0 ? (
                  <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <svg className="shrink-0 text-amber-500" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <p className="text-sm text-amber-700">
                      Belum ada bahan terdaftar.{' '}
                      <a href="/materials" className="underline font-medium">Tambah bahan</a> terlebih dahulu.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <Select value={newUsageMaterialId} onValueChange={setNewUsageMaterialId}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Pilih bahan..." />
                        </SelectTrigger>
                        <SelectContent>
                          {materials.map(m => (
                            <SelectItem key={m.id} value={String(m.id)}>
                              <span>{m.name}</span>
                              <span className="ml-2 text-slate-400 text-xs">
                                (stok: {m.current_stock} {m.unit})
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-full sm:w-36">
                      <Input
                        type="number"
                        min="0"
                        step="0.25"
                        value={newUsageQty}
                        onChange={e => setNewUsageQty(e.target.value)}
                        placeholder="Jumlah"
                        className="h-11"
                      />
                    </div>
                    <Button
                      onClick={handleAddUsage}
                      disabled={savingUsage}
                      className="h-11 px-5 bg-indigo-600 hover:bg-indigo-700 shrink-0"
                    >
                      {savingUsage ? 'Menyimpan...' : 'Catat'}
                    </Button>
                  </div>
                )}
              </div>

              {/* Usage list */}
              <div className="space-y-2">
                <Label className="text-base font-semibold text-slate-700">Bahan Terpakai</Label>
                {usageLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                  </div>
                ) : usageList.length === 0 ? (
                  <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-lg">
                    <p className="text-slate-400 text-sm">Belum ada bahan yang dicatat untuk order ini.</p>
                  </div>
                ) : (
                  <div className="divide-y border rounded-lg overflow-hidden">
                    {usageList.map((u) => (
                      <div key={u.id} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{u.material_name}</p>
                          <p className="text-xs text-slate-500">
                            {u.quantity_used} {u.unit} × {formatCurrency(u.cost_per_unit_snapshot)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-slate-700">
                            {formatCurrency(u.quantity_used * u.cost_per_unit_snapshot)}
                          </span>
                          <button
                            onClick={() => { setDeleteUsageTarget(u); setShowDeleteUsageDialog(true); }}
                            className="text-slate-300 hover:text-red-500 transition-colors"
                            aria-label="Hapus"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                              <path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      {/* DP Payment Modal */}
      <Dialog open={showDpModal} onOpenChange={setShowDpModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bayar DP (Uang Muka)</DialogTitle>
            <DialogDescription>
              Masukkan jumlah uang muka yang dibayarkan pelanggan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Total Harga</Label>
              <div className="text-lg font-semibold">
                {formatCurrency(order?.total_price)}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Jumlah DP (Rp)</Label>
              <Input
                type="text"
                value={dpAmount}
                onChange={(e) => {
                  const formatted = formatCurrencyInput(e.target.value);
                  setDpAmount(formatted);
                }}
                placeholder="0"
                className="h-12 text-base"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDpModal(false)}>
              Batal
            </Button>
            <Button onClick={handleDpPayment} className="bg-indigo-600 hover:bg-indigo-700">
              Simpan DP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settlement Modal */}
      <Dialog open={showSettlementModal} onOpenChange={setShowSettlementModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pelunasan Pembayaran</DialogTitle>
            <DialogDescription>
              Pesanan siap diambil. Selesaikan pembayaran pelanggan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Total Harga</Label>
                <div className="text-base font-semibold">
                  {formatCurrency(order?.total_price)}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">DP Dibayar</Label>
                <div className="text-base font-semibold text-green-600">
                  {formatCurrency(order?.amount_paid)}
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Sisa Pembayaran (Rp)</Label>
              <Input
                type="text"
                value={settlementAmount}
                onChange={(e) => {
                  const formatted = formatCurrencyInput(e.target.value);
                  setSettlementAmount(formatted);
                }}
                className="h-12 text-base font-semibold"
              />
            </div>

            <div className="space-y-2">
              <Label>Metode Pembayaran</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as 'tunai' | 'qris')}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tunai">Tunai</SelectItem>
                  <SelectItem value="qris">QRIS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === 'qris' && (
              <div className="p-4 border-2 border-dashed border-slate-300 rounded-lg text-center">
                <div className="w-48 h-48 mx-auto bg-slate-100 rounded-lg flex items-center justify-center">
                  <span className="text-slate-400 text-sm">QR Code Placeholder</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Scan QR code untuk pembayaran {formatCurrency(parseCurrencyInput(settlementAmount))}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettlementModal(false)}>
              Batal
            </Button>
            <Button onClick={handleSettlement} className="bg-green-600 hover:bg-green-700">
              Lunaskan & Cetak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Usage Dialog */}
      <Dialog open={showDeleteUsageDialog} onOpenChange={setShowDeleteUsageDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Penggunaan Bahan?</DialogTitle>
            <DialogDescription>
              Stok <strong>{deleteUsageTarget?.material_id && materials.find(m => m.id === deleteUsageTarget.material_id)?.name}</strong> akan dikembalikan sebesar <strong>{deleteUsageTarget?.quantity_used}</strong> unit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteUsageDialog(false)}>Batal</Button>
            <Button onClick={handleDeleteUsage} className="bg-red-600 hover:bg-red-700">Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
