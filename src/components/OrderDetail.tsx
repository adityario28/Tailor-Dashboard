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
import WorkerAssignModal from '@/components/WorkerAssignModal';
import QrisGenerator from '@/components/QrisGenerator';
import { db, STATUS_FLOW, deductMaterialStock } from '@/lib/db';
import type { Material, MaterialUsage, TransactionItem } from '@/lib/db';
import { trx, supabase } from '@/lib/supabase';
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
  const [dpPaymentMethod, setDpPaymentMethod] = useState<'tunai' | 'qris'>('tunai');
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'tunai' | 'qris'>('tunai');
  const [settlementAmount, setSettlementAmount] = useState('');
  
  // QRIS Payment state
  const [showQrisPaymentModal, setShowQrisPaymentModal] = useState(false);
  const [qrisPaymentAmount, setQrisPaymentAmount] = useState(0);
  const [qrisPaymentType, setQrisPaymentType] = useState<'dp' | 'settlement'>('dp');
  const [qrisCountdown, setQrisCountdown] = useState(5);
  const [isQrisSaveEnabled, setIsQrisSaveEnabled] = useState(false);
  const [paymentReceived, setPaymentReceived] = useState(false);

  // Material usage state
  const [materials, setMaterials] = useState<Material[]>([]);
  const [usageList, setUsageList] = useState<(MaterialUsage & { material_name?: string; unit?: string })[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [newUsageMaterialId, setNewUsageMaterialId] = useState<string>('');
  const [newUsageQty, setNewUsageQty] = useState('');
  const [useAll, setUseAll] = useState(false);
  const [savingUsage, setSavingUsage] = useState(false);
  const [showDeleteUsageDialog, setShowDeleteUsageDialog] = useState(false);
  const [deleteUsageTarget, setDeleteUsageTarget] = useState<MaterialUsage | null>(null);
  const [showNoMaterialWarning, setShowNoMaterialWarning] = useState(false);

  // Worker assignment state
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [pendingStatusAfterWorker, setPendingStatusAfterWorker] = useState<OrderStatus | null>(null);

  // Transaction items state (for set orders)
  const [transactionItems, setTransactionItems] = useState<TransactionItem[]>([]);
  const [activeItemIndex, setActiveItemIndex] = useState(0);

  // Update MeasurementSketch when transaction items load or active item changes
  useEffect(() => {
    const activeItem = transactionItems[activeItemIndex];
    if (!activeItem) return;

    // Delay to run after loadOrder's setTimeout (100ms)
    const timer = setTimeout(() => {
      // Update sketch outfit type
      window.dispatchEvent(new CustomEvent('outfit-update', { detail: activeItem.outfit_type || 'Jas' }));
      (window as any).__lastOutfit = activeItem.outfit_type || 'Jas';

      // Map db field names to sketch field IDs
      const fieldMap: Record<string, string> = {
        panjang_badan: 'panjangBadan',
        lebar_bahu: 'lebarBahu',
        panjang_lengan: 'panjangLengan',
        lingkar_lengan: 'lingkarLengan',
        lingkar_ujung_lengan: 'lingkarUjungLengan',
        lingkar_dada: 'lingkarDada',
        lingkar_perut: 'lingkarPerut',
        lingkar_pinggul: 'lingkarPinggul',
        lingkar_leher: 'lingkarLeher',
        lebar_pundak: 'lebarPundak',
      };

      // Dispatch measurement updates
      Object.entries(fieldMap).forEach(([dbKey, sketchId]) => {
        const value = (activeItem as any)[dbKey];
        if (value !== null && value !== undefined) {
          window.dispatchEvent(new CustomEvent('measurement-update', { detail: { id: sketchId, value: String(value) } }));
        }
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [transactionItems, activeItemIndex]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get('id')) || 0;
    const src = params.get('src') as 'local' | 'remote' | null;
    
    if (id) {
      setActualOrderId(id);
      loadOrder(id, src);
      loadMaterials();
      loadUsage(id);
      loadTransactionItems(id, src);
    }
  }, []);

  // Supabase Realtime subscription for payment status updates
  useEffect(() => {
    if (!actualOrderId || dataSource !== 'remote') return;

    const channel = supabase
      .channel(`order-${actualOrderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'trx',
          table: 'transaction',
          filter: `id=eq.${actualOrderId}`,
        },
        (payload) => {
          const newRecord = payload.new as Record<string, any>;
          const oldRecord = payload.old as Record<string, any>;

          console.log('=== REALTIME UPDATE RECEIVED ===');
          console.log('Old:', oldRecord);
          console.log('New:', newRecord);

          // Check if amount_paid actually increased (payment received)
          const oldAmountPaid = oldRecord.amount_paid || 0;
          const newAmountPaid = newRecord.amount_paid || 0;
          const paymentReceived = newAmountPaid > oldAmountPaid;

          if (paymentReceived) {
            const isLunas = newRecord.payment_status === 'lunas';
            toast.success(isLunas ? 'Pembayaran diterima! Order telah lunas.' : 'DP diterima!', {
              duration: 5000,
            });
            
            // Update local state
            setOrder(prev => prev ? { ...prev, payment_status: newRecord.payment_status, amount_paid: newRecord.amount_paid } : prev);
            
            // Close any open payment modals
            setShowDpModal(false);
            setShowSettlementModal(false);
            
            // Close QRIS modal and mark as received
            if (showQrisPaymentModal) {
              setPaymentReceived(true);
              setTimeout(() => {
                setShowQrisPaymentModal(false);
                setPaymentReceived(false);
              }, 1500);
            }
          } else {
            // Update local state for other changes (status, etc) without toast
            if (newRecord.payment_status !== oldRecord.payment_status) {
              setOrder(prev => prev ? { ...prev, payment_status: newRecord.payment_status, amount_paid: newRecord.amount_paid } : prev);
            }
          }

          // Also update if production status changed
          if (newRecord.status !== oldRecord.status) {
            setOrder(prev => prev ? { ...prev, status: newRecord.status } : prev);
            setSelectedStatus(newRecord.status);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [actualOrderId, dataSource, showQrisPaymentModal]);

  // QRIS countdown effect
  useEffect(() => {
    if (showQrisPaymentModal && !paymentReceived) {
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
  }, [showQrisPaymentModal, paymentReceived]);

  // Dedicated Realtime subscription for QRIS payment modal (auto-complete)
  useEffect(() => {
    if (!showQrisPaymentModal || !actualOrderId || paymentReceived) return;

    const channel = supabase
      .channel(`qris-payment-${actualOrderId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'trx',
          table: 'transaction',
          filter: `id=eq.${actualOrderId}`,
        },
        async (payload) => {
          const newRecord = payload.new as Record<string, any>;
          const oldRecord = payload.old as Record<string, any>;

          console.log('=== QRIS MODAL REALTIME UPDATE ===');
          console.log('Old amount_paid:', oldRecord.amount_paid);
          console.log('New amount_paid:', newRecord.amount_paid);

          // Check if payment received (amount_paid increased)
          const oldAmountPaid = oldRecord.amount_paid || 0;
          const newAmountPaid = newRecord.amount_paid || 0;

          if (newAmountPaid > oldAmountPaid) {
            console.log('Payment received! Auto-completing...');
            setPaymentReceived(true);
            setIsQrisSaveEnabled(true);
            
            const isLunas = newRecord.payment_status === 'lunas';
            
            // If this is a settlement payment, also update status to Selesai
            if (qrisPaymentType === 'settlement' && isLunas) {
              await trx.from('transaction')
                .update({ status: 'Selesai' })
                .eq('id', actualOrderId);
              
              toast.success('Pembayaran diterima! Order selesai.');
              
              // Update local order state with status
              setOrder(prev => prev ? { 
                ...prev, 
                payment_status: newRecord.payment_status, 
                amount_paid: newRecord.amount_paid,
                status: 'Selesai'
              } : prev);
              setSelectedStatus('Selesai');
            } else {
              toast.success(isLunas ? 'Pembayaran diterima! Order lunas.' : 'Pembayaran diterima!');
              
              // Update local order state
              setOrder(prev => prev ? { 
                ...prev, 
                payment_status: newRecord.payment_status, 
                amount_paid: newRecord.amount_paid 
              } : prev);
            }

            // Mark pending payment as matched
            trx.from('pending_qris_payment')
              .update({ status: 'matched', matched_at: new Date().toISOString() })
              .eq('order_id', actualOrderId)
              .eq('status', 'pending');

            // Auto close modal after showing success
            setTimeout(() => {
              setShowQrisPaymentModal(false);
              setPaymentReceived(false);
            }, 1500);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showQrisPaymentModal, actualOrderId, paymentReceived, qrisPaymentType]);

  // Auto-create pending_qris_payment when QRIS is selected in Settlement Modal
  useEffect(() => {
    if (!showSettlementModal || paymentMethod !== 'qris') return;
    
    const amount = parseCurrencyInput(settlementAmount);
    if (amount <= 0 || !actualOrderId) return;

    const ensurePendingPayment = async () => {
      try {
        // Check if pending record already exists for this order with same amount
        const { data: existing } = await trx.from('pending_qris_payment')
          .select('id, amount')
          .eq('order_id', actualOrderId)
          .eq('status', 'pending')
          .single();

        if (existing) {
          // If amount changed, update it
          if (existing.amount !== amount) {
            await trx.from('pending_qris_payment')
              .update({ amount })
              .eq('id', existing.id);
            console.log('Updated pending QRIS payment amount:', amount);
          } else {
            console.log('Pending QRIS payment already exists');
          }
          return;
        }

        // Create new pending payment
        const { error } = await trx.from('pending_qris_payment').insert({
          order_id: actualOrderId,
          amount: amount,
        });

        if (error) {
          console.error('Failed to create pending payment:', error);
        } else {
          console.log('Created pending QRIS payment for order:', actualOrderId, 'amount:', amount);
        }
      } catch (err) {
        console.error('Error in ensurePendingPayment:', err);
      }
    };

    ensurePendingPayment();
  }, [showSettlementModal, paymentMethod, settlementAmount, actualOrderId]);

  const loadTransactionItems = async (trxId: number, src: 'local' | 'remote' | null) => {
    try {
      let items: TransactionItem[] = [];
      
      if (src === 'remote' && navigator.onLine) {
        const { data } = await trx.from('transaction_item').select('*').eq('transaction_id', trxId);
        if (data && data.length > 0) {
          items = data as TransactionItem[];
        }
      } else {
        items = await db.transaction_item.where('transaction_id').equals(trxId).toArray();
        
        if (items.length === 0 && navigator.onLine) {
          const { data } = await trx.from('transaction_item').select('*').eq('transaction_id', trxId);
          if (data && data.length > 0) {
            items = data as TransactionItem[];
          }
        }
      }
      
      setTransactionItems(items);
    } catch (err) {
      console.error('loadTransactionItems error:', err);
    }
  };

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

    const matId = Number(newUsageMaterialId);
    const mat = materials.find(m => m.id === matId);
    if (!mat) { toast.error('Bahan tidak ditemukan.'); return; }

    const qty = useAll ? mat.current_stock : parseFloat(newUsageQty);
    if (!qty || qty <= 0) { toast.error(useAll ? `Stok ${mat.name} sudah habis.` : 'Masukkan jumlah yang valid.'); return; }

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
      setUseAll(false);
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
    if (!id) return;

    let orderData: Record<string, any> | null = null;
    let custName = '';
    let custPhone = '';
    let actualSource: 'local' | 'remote' | null = null;

    if (src === 'remote') {
      // Source is remote - try Supabase first
      if (navigator.onLine) {
        try {
          const { data: remoteTrx } = await trx.from('transaction').select('*').eq('id', id).single();
          if (remoteTrx) {
            orderData = remoteTrx as Record<string, any>;
            const { data: remoteCust } = await trx.from('customer').select('*').eq('id', orderData.customer_id).single();
            custName = (remoteCust as any)?.name ?? '';
            custPhone = (remoteCust as any)?.phone ?? '';
            actualSource = 'remote';
            applyOrderData(orderData, custName, custPhone, actualSource);
          }
        } catch (err) {
          console.warn('Remote fetch failed:', err);
        }
      }
      // Fallback to local if remote failed
      if (!orderData) {
        const local = await db.transactions.get(id);
        if (local) {
          orderData = local as Record<string, any>;
          const customer = await db.customer.get(local.customer_id);
          custName = customer?.name ?? '';
          custPhone = customer?.phone ?? '';
          actualSource = 'local';
          applyOrderData(orderData, custName, custPhone, actualSource);
        }
      }
    } else {
      // Source is local (or unspecified) - try local first for instant display
      const local = await db.transactions.get(id);
      if (local) {
        orderData = local as Record<string, any>;
        const customer = await db.customer.get(local.customer_id);
        custName = customer?.name ?? '';
        custPhone = customer?.phone ?? '';
        actualSource = 'local';
        applyOrderData(orderData, custName, custPhone, actualSource);
      }

      // Then refresh from remote if online
      if (navigator.onLine) {
        try {
          const { data: remoteTrx } = await trx.from('transaction').select('*').eq('id', id).single();
          if (remoteTrx) {
            orderData = remoteTrx as Record<string, any>;
            const { data: remoteCust } = await trx.from('customer').select('*').eq('id', orderData.customer_id).single();
            custName = (remoteCust as any)?.name ?? '';
            custPhone = (remoteCust as any)?.phone ?? '';
            actualSource = 'remote';
            applyOrderData(orderData, custName, custPhone, actualSource);
          }
        } catch (err) {
          // Remote failed, keep local data
          console.warn('Remote fetch failed, using local data:', err);
        }
      }
    }

    if (!orderData) {
      console.error('Order not found:', id);
    }
  };

  const applyOrderData = async (orderData: Record<string, any>, custName: string, custPhone: string, actualSource: 'local' | 'remote' | null) => {
    setOrder(orderData);
    setCustomerName(custName);
    setCustomerPhone(custPhone);
    setSelectedStatus(orderData.status as OrderStatus);
    setDataSource(actualSource);

    // Resolve worker name if assigned
    if (orderData.worker_id) {
      if (navigator.onLine) {
        const { data: wData } = await trx.from('worker').select('name').eq('id', orderData.worker_id).single();
        setWorkerName((wData as any)?.name ?? null);
      } else {
        const w = await db.worker.get(orderData.worker_id);
        setWorkerName(w?.name ?? null);
      }
    } else {
      setWorkerName(null);
    }

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
  };

  const handleStatusSave = async () => {
    // No-op if status hasn't changed
    if (selectedStatus === order?.status) {
      toast.info('Status tidak berubah.');
      return;
    }
    setIsSaving(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const id = Number(params.get('id')) || 0;
      
      // Check if status is changing to "Jahit" — require worker assignment
      const isChangingToJahit = selectedStatus === 'Jahit' && order?.status !== 'Jahit';
      if (isChangingToJahit) {
        setPendingStatusAfterWorker('Jahit');
        setShowWorkerModal(true);
        setIsSaving(false);
        return;
      }

      // Check if status is changing to "Selesai"
      const isChangingToComplete = selectedStatus === 'Selesai' && order?.status !== 'Selesai';

      // Warn if no material usage recorded yet
      if (isChangingToComplete && usageList.length === 0) {
        setShowNoMaterialWarning(true);
        setIsSaving(false);
        return;
      }

      const paymentStatus = order?.payment_status || 'belum_bayar';
      
      if (isChangingToComplete && paymentStatus !== 'lunas') {
        // Show settlement modal instead of directly saving
        const totalPrice = order?.total_price || 0;
        const amountPaid = order?.amount_paid || 0;
        const remaining = totalPrice - amountPaid;
        setSettlementAmount(formatCurrencyInput(String(remaining)));
        setShowSettlementModal(true);
        setIsSaving(false);
        return;
      }
      
      // If changing to Selesai and already lunas - just save and show completion message
      if (isChangingToComplete && paymentStatus === 'lunas') {
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
        toast.success('Order selesai! Pembayaran sudah lunas.');
        // TODO: Show print receipt dialog here when enabled
        if (order) {
          setOrder({ ...order, status: selectedStatus });
        }
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

  // Called when worker is selected from modal (initial assignment via status change)
  const handleWorkerConfirmForStatus = async (workerId: number, wName: string) => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get('id')) || 0;
    const newStatus = pendingStatusAfterWorker ?? 'Jahit';
    try {
      if (dataSource === 'local') {
        await db.transactions.update(id, { status: newStatus, worker_id: workerId, synced: false });
        if (navigator.onLine) {
          await trx.from('transaction').update({ status: newStatus, worker_id: workerId }).eq('id', id);
          await db.transactions.update(id, { synced: true });
        }
      } else if (dataSource === 'remote' && navigator.onLine) {
        await trx.from('transaction').update({ status: newStatus, worker_id: workerId }).eq('id', id);
      }
      setWorkerName(wName);
      setOrder({ ...order, status: newStatus, worker_id: workerId });
      setShowWorkerModal(false);
      setPendingStatusAfterWorker(null);
      toast.success(`Status diubah ke "Jahit" — dikerjakan oleh ${wName}.`);
    } catch (err) {
      toast.error('Gagal menyimpan penjahit.');
      console.error(err);
    }
  };

  // Called for reassignment (status stays 'Jahit', only worker_id changes)
  const handleWorkerReassign = async (workerId: number, wName: string) => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get('id')) || 0;
    try {
      if (dataSource === 'local') {
        await db.transactions.update(id, { worker_id: workerId, synced: false });
        if (navigator.onLine) {
          await trx.from('transaction').update({ worker_id: workerId }).eq('id', id);
          await db.transactions.update(id, { synced: true });
        }
      } else if (dataSource === 'remote' && navigator.onLine) {
        await trx.from('transaction').update({ worker_id: workerId }).eq('id', id);
      }
      setWorkerName(wName);
      setOrder({ ...order, worker_id: workerId });
      setShowWorkerModal(false);
      setPendingStatusAfterWorker(null);
      toast.success(`Penjahit diubah ke ${wName}.`);
    } catch (err) {
      toast.error('Gagal mengganti penjahit.');
      console.error(err);
    }
  };

  // Continue saving status to Selesai after user confirms no material warning
  const handleConfirmNoMaterial = async () => {
    setShowNoMaterialWarning(false);
    setIsSaving(true);
    
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get('id')) || 0;
    
    try {
      const paymentStatus = order?.payment_status || 'belum_bayar';
      
      if (paymentStatus !== 'lunas') {
        // Show settlement modal
        const totalPrice = order?.total_price || 0;
        const amountPaid = order?.amount_paid || 0;
        const remaining = totalPrice - amountPaid;
        setSettlementAmount(formatCurrencyInput(String(remaining)));
        setShowSettlementModal(true);
        setIsSaving(false);
        return;
      }
      
      // Already lunas - just save
      if (dataSource === 'local') {
        await db.transactions.update(id, { status: 'Selesai', synced: false });
        if (navigator.onLine) {
          await trx.from('transaction').update({ status: 'Selesai' }).eq('id', id);
          await db.transactions.update(id, { synced: true });
        }
      } else if (dataSource === 'remote' && navigator.onLine) {
        await trx.from('transaction').update({ status: 'Selesai' }).eq('id', id);
      }
      
      toast.success('Order selesai! Pembayaran sudah lunas.');
      if (order) {
        setOrder({ ...order, status: 'Selesai' });
      }
    } catch (err) {
      toast.error('Gagal menyimpan status.');
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

    // If QRIS payment, show QRIS modal and create pending payment
    if (dpPaymentMethod === 'qris') {
      try {
        console.log('Creating pending QRIS payment for DP, order:', actualOrderId, 'amount:', amount);
        
        // Create pending QRIS payment record
        const { error } = await trx.from('pending_qris_payment').insert({
          order_id: actualOrderId,
          amount: amount,
        });
        
        if (error) {
          console.error('Insert error:', error);
          toast.error('Gagal membuat pembayaran QRIS: ' + error.message);
          return;
        }
        
        console.log('Pending payment created successfully');
        setQrisPaymentAmount(amount);
        setQrisPaymentType('dp');
        setShowDpModal(false);
        setShowQrisPaymentModal(true);
        return;
      } catch (err) {
        console.error('Failed to create pending payment:', err);
        toast.error('Gagal membuat pembayaran QRIS.');
        return;
      }
    }

    // Tunai payment - save directly
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

    // If QRIS payment, just show QRIS modal (pending payment already created by useEffect)
    if (paymentMethod === 'qris') {
      setQrisPaymentAmount(amount);
      setQrisPaymentType('settlement');
      setShowSettlementModal(false);
      setShowQrisPaymentModal(true);
      return;
    }

    // Tunai payment - save directly
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
          <div className="px-3 sm:px-6 pt-4 border-b">
            <TabsList className="h-10 w-full sm:w-auto">
              <TabsTrigger value="ukuran" className="px-3 sm:px-5 text-xs sm:text-sm flex-1 sm:flex-none">Ukuran & Status</TabsTrigger>
              <TabsTrigger value="bahan" className="px-3 sm:px-5 text-xs sm:text-sm relative flex-1 sm:flex-none">
                Penggunaan Bahan
                {usageList.length > 0 && (
                  <span className="ml-1 sm:ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">
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
              <div className="px-4 sm:px-6 md:px-8 pb-6 md:pb-8 pt-6 space-y-6 bg-white">
                <div className="grid grid-cols-1 gap-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-2">
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

                  {/* Multi-item view when transaction items exist */}
                  {transactionItems.length > 0 ? (
                    <>
                      {/* Item tabs */}
                      {transactionItems.length > 1 && (
                        <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
                          {transactionItems.map((item, idx) => (
                            <button
                              key={item.id || idx}
                              type="button"
                              onClick={() => setActiveItemIndex(idx)}
                              className={`px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl text-sm sm:text-base font-semibold transition-all border-2 min-h-[44px] sm:min-h-[48px] ${
                                activeItemIndex === idx
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-slate-400'
                              }`}
                            >
                              Item {idx + 1}: {item.outfit_type}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Active item details */}
                      {(() => {
                        const activeItem = transactionItems[activeItemIndex] || transactionItems[0];
                        if (!activeItem) return null;
                        const itemFields = getFieldsForOutfit(activeItem.outfit_type || 'Jas');
                        return (
                          <>
                            <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                              <p className="text-sm font-medium text-indigo-700">
                                {activeItem.outfit_type} — {formatCurrency(activeItem.item_price)}
                              </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                              <div className="space-y-2">
                                <Label>P Kain (m)</Label>
                                <Input value={activeItem.panjang_kain ?? ''} className="h-12 border-2 bg-slate-50" disabled />
                              </div>
                              <div className="space-y-2">
                                <Label>L Kain (m)</Label>
                                <Input value={activeItem.lebar_kain ?? ''} className="h-12 border-2 bg-slate-50" disabled />
                              </div>
                              <div className="flex flex-col items-center gap-1 pb-2">
                                <Label className="text-xs text-center">Cuci Dulu?</Label>
                                <span className="text-sm font-medium px-3 py-1.5 rounded-md bg-slate-100 text-slate-600">
                                  {activeItem.cuci_sebelum_potong ? 'Ya' : 'Tidak'}
                                </span>
                              </div>
                            </div>

                            <hr />

                            {/* Measurement fields for active item */}
                            <div className="grid pl-9 pr-3 sm:px-3 grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-9 gap-y-4 sm:gap-y-6">
                              {itemFields.map(([reactId, label, dbKey], i) => {
                                const val = (activeItem as any)[dbKey] ?? '—';
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

                            {/* Accessories for active item */}
                            <div className="flex flex-wrap gap-2">
                              {activeItem.furing && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-purple-100 text-purple-700">Furing</span>}
                              {activeItem.padding_tebal && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-orange-100 text-orange-700">Padding Tebal</span>}
                              {activeItem.padding_tipis && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">Padding Tipis</span>}
                              {activeItem.kancing && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700">Kancing</span>}
                            </div>

                            {activeItem.catatan && (
                              <div className="space-y-2">
                                <Label>Catatan Item</Label>
                                <textarea
                                  value={activeItem.catatan}
                                  disabled
                                  className="w-full min-h-[80px] rounded-md border-2 border-input bg-slate-50 px-3 py-2 text-base resize-none"
                                />
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    /* Old single-item view (backward compat) */
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
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

                      <hr />

                      {/* Measurement fields */}
                      <div className="grid pl-9 pr-3 sm:px-3 grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-9 gap-y-4 sm:gap-y-6">
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
                    </>
                  )}
                </div>

                <hr />

                {/* Payment section */}
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Informasi Pembayaran</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm text-slate-500">Total Harga</Label>
                      <div className="text-lg font-semibold text-slate-900">
                        {formatCurrency(order.total_price)}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-slate-500">
                        Biaya Jahit
                        <span className="text-xs font-normal text-slate-400 ml-1">(basis komisi)</span>
                      </Label>
                      <div className="text-lg font-semibold text-indigo-600">
                        {formatCurrency((order as any).sewing_fee ?? order.total_price)}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                  {/* Worker badge — shown when status is Jahit */}
                  {order.status === 'Jahit' && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                      <div className="flex items-center gap-2">
                        <svg className="text-indigo-500 shrink-0" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <div>
                          <p className="text-xs text-indigo-500 font-medium">Dikerjakan oleh</p>
                          <p className="text-sm font-semibold text-indigo-800">
                            {workerName ?? <span className="text-indigo-400 font-normal italic">Belum ditentukan</span>}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setPendingStatusAfterWorker(null); setShowWorkerModal(true); }}
                        className="text-xs border-indigo-200 text-indigo-600 hover:bg-indigo-100"
                      >
                        Ganti Penjahit
                      </Button>
                    </div>
                  )}

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
                  <>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <Select value={newUsageMaterialId} onValueChange={v => { setNewUsageMaterialId(v); setUseAll(false); }}>
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
                        value={useAll ? (materials.find(m => m.id === Number(newUsageMaterialId))?.current_stock ?? '') : newUsageQty}
                        onChange={e => setNewUsageQty(e.target.value)}
                        placeholder="Jumlah"
                        className="h-11"
                        disabled={useAll}
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
                  {newUsageMaterialId && (
                    <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useAll}
                        onChange={e => setUseAll(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-600">
                        Gunakan semuanya
                        {(() => {
                          const mat = materials.find(m => m.id === Number(newUsageMaterialId));
                          return mat ? ` (${mat.current_stock} ${mat.unit})` : '';
                        })()}
                      </span>
                    </label>
                  )}
                </>
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
        <DialogContent className="max-w-md">
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
            
            <div className="space-y-2">
              <Label>Metode Pembayaran</Label>
              <Select value={dpPaymentMethod} onValueChange={(v) => setDpPaymentMethod(v as 'tunai' | 'qris')}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tunai">Tunai</SelectItem>
                  <SelectItem value="qris">QRIS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dpPaymentMethod === 'qris' && parseCurrencyInput(dpAmount) > 0 && (
              <QrisGenerator 
                amount={parseCurrencyInput(dpAmount)} 
                orderId={actualOrderId}
              />
            )}
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
      <Dialog open={showSettlementModal} onOpenChange={(open) => {
        if (!open && paymentMethod === 'qris') {
          // Cancel pending payment when closing modal
          trx.from('pending_qris_payment')
            .update({ status: 'cancelled' })
            .eq('order_id', actualOrderId)
            .eq('status', 'pending');
        }
        setShowSettlementModal(open);
      }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
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
              <Select value={paymentMethod} onValueChange={(v) => {
                const newMethod = v as 'tunai' | 'qris';
                // If switching from QRIS to tunai, cancel pending payment
                if (paymentMethod === 'qris' && newMethod === 'tunai') {
                  trx.from('pending_qris_payment')
                    .update({ status: 'cancelled' })
                    .eq('order_id', actualOrderId)
                    .eq('status', 'pending');
                }
                setPaymentMethod(newMethod);
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

            {paymentMethod === 'qris' && (
              <QrisGenerator 
                amount={parseCurrencyInput(settlementAmount)} 
                orderId={actualOrderId}
                hideHeader={true}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettlementModal(false)}>
              Batal
            </Button>
            <Button onClick={handleSettlement} className="bg-green-600 hover:bg-green-700">
              {paymentMethod === 'qris' ? 'Lunaskan' : 'Lunaskan & Cetak'}
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

      {/* No Material Warning Dialog */}
      <Dialog open={showNoMaterialWarning} onOpenChange={setShowNoMaterialWarning}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Belum Ada Bahan Tercatat</DialogTitle>
            <DialogDescription>
              Order ini belum memiliki catatan penggunaan bahan. Yakin ingin menyelesaikan order?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoMaterialWarning(false)}>Batal</Button>
            <Button onClick={handleConfirmNoMaterial} className="bg-amber-600 hover:bg-amber-700">
              Lanjutkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Worker Assignment Modal */}
      <WorkerAssignModal
        open={showWorkerModal}
        orderId={actualOrderId}
        customerName={customerName}
        outfitType={order?.outfit_type}
        currentWorkerId={order?.worker_id}
        onConfirm={(workerId, wName) => {
          if (pendingStatusAfterWorker) {
            handleWorkerConfirmForStatus(workerId, wName);
          } else {
            handleWorkerReassign(workerId, wName);
          }
        }}
        onCancel={() => {
          setShowWorkerModal(false);
          setPendingStatusAfterWorker(null);
        }}
      />

      {/* QRIS Payment Modal */}
      <Dialog open={showQrisPaymentModal} onOpenChange={(open) => {
        if (!open && !paymentReceived) {
          // Cancel pending payment if closing without payment
          trx.from('pending_qris_payment')
            .update({ status: 'cancelled' })
            .eq('order_id', actualOrderId)
            .eq('status', 'pending');
        }
        setShowQrisPaymentModal(open);
      }}>
        <DialogContent className="max-w-xs">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base">
              {paymentReceived ? '✅ Pembayaran Diterima!' : `QRIS ${qrisPaymentType === 'dp' ? 'DP' : 'Pelunasan'}`}
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-2">
            {paymentReceived ? (
              <div className="p-4 text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="font-semibold text-green-700">Berhasil!</p>
              </div>
            ) : (
              <QrisGenerator 
                amount={qrisPaymentAmount} 
                orderId={actualOrderId}
                hideHeader={true}
              />
            )}
          </div>

          {!paymentReceived && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs text-center text-slate-500">
                {isQrisSaveEnabled ? 'Sudah bayar? Klik Simpan' : `Tunggu ${qrisCountdown}s...`}
              </p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    trx.from('pending_qris_payment')
                      .update({ status: 'cancelled' })
                      .eq('order_id', actualOrderId)
                      .eq('status', 'pending');
                    setShowQrisPaymentModal(false);
                  }}
                  className="flex-1"
                >
                  Batal
                </Button>
                <Button 
                  size="sm"
                  onClick={async () => {
                    const currentPaid = order?.amount_paid || 0;
                    const totalPrice = order?.total_price || 0;
                    const newTotalPaid = qrisPaymentType === 'dp' ? qrisPaymentAmount : currentPaid + qrisPaymentAmount;
                    const newStatus = newTotalPaid >= totalPrice ? 'lunas' : 'dp';
                    
                    await trx.from('transaction').update({
                      amount_paid: newTotalPaid,
                      payment_status: newStatus
                    }).eq('id', actualOrderId);
                    
                    await trx.from('pending_qris_payment')
                      .update({ status: 'matched', matched_at: new Date().toISOString() })
                      .eq('order_id', actualOrderId)
                      .eq('status', 'pending');
                    
                    setOrder({ ...order, amount_paid: newTotalPaid, payment_status: newStatus as PaymentStatus });
                    setShowQrisPaymentModal(false);
                    toast.success(newStatus === 'lunas' ? 'Lunas!' : 'DP dicatat.');
                  }}
                  disabled={!isQrisSaveEnabled}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  Simpan
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
