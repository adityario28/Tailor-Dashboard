import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MeasurementSketch from '@/components/measurementSketch';
import { db, STATUS_FLOW } from '@/lib/db';
import { trx } from '@/lib/supabase';
import type { OrderStatus, Transaction, Customer } from '@/lib/db';
import { toast } from 'sonner';

interface OrderDetailProps {
  orderId: number;
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

export default function OrderDetail({ orderId }: OrderDetailProps) {
  const [order, setOrder] = useState<Record<string, any> | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>('Cuci Bahan');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const loadOrder = async () => {
    if (!orderId) return;

    let orderData: Record<string, any> | null = null;
    let custName = '';
    let custPhone = '';

    // Try local first
    const local = await db.transaction.get(orderId);
    if (local) {
      orderData = local as Record<string, any>;
      const customer = await db.customer.get(local.customer_id);
      custName = customer?.name ?? '';
      custPhone = customer?.phone ?? '';
    } else if (navigator.onLine) {
      // Try Supabase
      const { data: remoteTrx } = await trx.from('transaction').select('*').eq('id', orderId).single();
      if (remoteTrx) {
        orderData = remoteTrx as Record<string, any>;
        const { data: remoteCust } = await trx.from('customer').select('*').eq('id', orderData.customer_id).single();
        custName = (remoteCust as any)?.name ?? '';
        custPhone = (remoteCust as any)?.phone ?? '';
      }
    }

    if (orderData) {
      setOrder(orderData);
      setCustomerName(custName);
      setCustomerPhone(custPhone);
      setSelectedStatus(orderData.status as OrderStatus);

      // Notify sketch component
      const outfit = orderData.outfit_type ?? '';
      const fields = getFieldsForOutfit(outfit);
      
      fields.forEach(([reactId, , dbKey]) => {
        window.dispatchEvent(new CustomEvent('measurement-update', {
          detail: { id: reactId, value: String(orderData[dbKey] ?? '') },
        }));
      });
      
      (window as any).__lastOutfit = outfit;
      window.dispatchEvent(new CustomEvent('outfit-update', { detail: outfit }));
    }
  };

  const handleStatusSave = async () => {
    setIsSaving(true);
    try {
      const local = await db.transaction.get(orderId);
      if (local) {
        await db.transaction.update(orderId, { status: selectedStatus, synced: false });
      }
      if (navigator.onLine) {
        await trx.from('transaction').update({ status: selectedStatus }).eq('id', orderId);
        if (local) await db.transaction.update(orderId, { synced: true });
      }
      toast.success(`Status diperbarui ke "${selectedStatus}"`);
      
      // Update local state
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
          <CardTitle>Pesanan #{orderId} — {customerName}</CardTitle>
        </CardHeader>
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

            {/* Status update section */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">Ubah Status</Label>
              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-2">
                  <Label className="text-sm text-slate-500">Status berikutnya</Label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value as OrderStatus)}
                    className="w-full h-12 rounded-md border-2 border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {STATUS_FLOW.map((s, i) => (
                      <option key={s} value={s} disabled={i < currentIdx}>
                        {s}
                      </option>
                    ))}
                  </select>
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
      </Card>
    </div>
  );
}
