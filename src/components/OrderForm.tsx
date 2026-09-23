import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Combobox } from '@/components/ui/combobox';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import MeasurementSketch from '@/components/measurementSketch';
import CustomerSearch from '@/components/CustomerSearch';
import SuccessDialog from '@/components/SuccessDialog';
import QrisGenerator from '@/components/QrisGenerator';
import { db, syncCustomer, syncPreset, syncTransaction, syncTransactionItem, syncPending } from '@/lib/db';
import type { Customer, PresetCustomer, Transaction, TransactionItem } from '@/lib/db';
import { toast } from 'sonner';
import { trx, supabase } from '@/lib/supabase';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/currency';

const outfitOptions = [
  'Jas',
  'Kemeja Batik Lengan Pendek',
  'Kemeja Batik Lengan Panjang',
  'Kemeja Polos Lengan Pendek',
  'Kemeja Polos Lengan Panjang',
  'Celana',
];

const PANJANG_KAIN_DEFAULT: Record<string, number> = {
  Jas: 3,
  'Kemeja Batik Lengan Pendek': 2,
  'Kemeja Batik Lengan Panjang': 3,
  'Kemeja Polos Lengan Pendek': 1.25,
  'Kemeja Polos Lengan Panjang': 1.5,
  Celana: 1.25,
};

const LEBAR_KAIN_DEFAULT: Record<string, number> = {
  Jas: 1.5,
  'Kemeja Batik Lengan Pendek': 1.15,
  'Kemeja Batik Lengan Panjang': 1.15,
  'Kemeja Polos Lengan Pendek': 1.5,
  'Kemeja Polos Lengan Panjang': 1.5,
  Celana: 1.5,
};

type OutfitType = 'Jas' | 'Kemeja Panjang' | 'Kemeja Pendek';

const JAS_FIELDS = [
  ['panjangBadan', 'Panjang Badan'],
  ['lebarBahu', 'Lebar Bahu'],
  ['panjangLengan', 'Panjang Lengan'],
  ['lingkarLengan', 'Lingkar Lengan'],
  ['lingkarUjungLengan', 'Lingkar Ujung Lengan'],
  ['lingkarDada', 'Lingkar Dada'],
  ['lingkarPerut', 'Lingkar Perut'],
  ['lingkarPinggul', 'Lingkar Pinggul'],
] as const;

const KEMEJA_PANJANG_FIELDS = [
  ['lingkarLeher', 'Lingkar Leher'],
  ['lebarBahu', 'Lebar Bahu'],
  ['panjangLengan', 'Panjang Lengan'],
  ['lingkarDada', 'Lingkar Dada'],
  ['lingkarPerut', 'Lingkar Perut'],
  ['panjangBadan', 'Panjang Badan'],
  ['lingkarUjungLengan', 'Lingkar Ujung Lengan'],
  ['lingkarPinggul', 'Lingkar Pinggul'],
] as const;

const KEMEJA_PENDEK_FIELDS = [
  ['lingkarLeher', 'Lingkar Leher'],
  ['lebarBahu', 'Panjang Bahu'],
  ['panjangLengan', 'Panjang Lengan'],
  ['lebarPundak', 'Lebar Pundak'],
  ['lingkarDada', 'Lebar Dada'],
  ['panjangBadan', 'Panjang Badan'],
  ['lingkarLengan', 'Lingkar Lengan'],
  ['lingkarPinggul', 'Lebar Pinggul'],
] as const;

interface ItemState {
  outfitType: string;
  panjangKain: string;
  lebarKain: string;
  cuciSebelumPotong: boolean;
  measurements: Record<string, string>;
  furing: boolean;
  paddingTebal: boolean;
  paddingTipis: boolean;
  kancing: boolean;
  itemPrice: string;
  sewingFee: string;
  catatan: string;
}

interface FormState {
  selectedCustomerId: number | null;
  selectedPresetId: number | null;
  name: string;
  tag: string;
  phone: string;
  items: ItemState[];
  amountPaid: string;
  paymentMethod: 'tunai' | 'qris';
  saveAsPreset: boolean;
  presetName: string;
}

const createEmptyItem = (outfitType: string = 'Jas'): ItemState => ({
  outfitType,
  panjangKain: String(PANJANG_KAIN_DEFAULT[outfitType] ?? ''),
  lebarKain: String(LEBAR_KAIN_DEFAULT[outfitType] ?? ''),
  cuciSebelumPotong: false,
  measurements: {},
  furing: false,
  paddingTebal: false,
  paddingTipis: false,
  kancing: false,
  itemPrice: '',
  sewingFee: '',
  catatan: '',
});

function isKemejaLenganPendek(outfit: string): boolean {
  return outfit.toLowerCase().includes('kemeja') && outfit.toLowerCase().includes('pendek');
}

function isKemejaLenganPanjang(outfit: string): boolean {
  return outfit.toLowerCase().includes('kemeja') && outfit.toLowerCase().includes('panjang');
}

function getOutfitType(outfit: string): OutfitType {
  if (isKemejaLenganPendek(outfit)) return 'Kemeja Pendek';
  if (isKemejaLenganPanjang(outfit)) return 'Kemeja Panjang';
  return 'Jas';
}

function getFieldsForOutfit(outfitType: OutfitType) {
  if (outfitType === 'Kemeja Pendek') return KEMEJA_PENDEK_FIELDS;
  if (outfitType === 'Kemeja Panjang') return KEMEJA_PANJANG_FIELDS;
  return JAS_FIELDS;
}

export default function OrderForm() {
  const [formState, setFormState] = useState<FormState>({
    selectedCustomerId: null,
    selectedPresetId: null,
    name: '',
    tag: '',
    phone: '',
    items: [createEmptyItem('Jas')],
    amountPaid: '',
    paymentMethod: 'tunai',
    saveAsPreset: false,
    presetName: '',
  });

  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [showRestoreDraft, setShowRestoreDraft] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<any>(null);
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const skipCustomerEvent = useRef(false);
  
  // QRIS Payment Modal state
  const [showQrisModal, setShowQrisModal] = useState(false);
  const [qrisCountdown, setQrisCountdown] = useState(5);
  const [isQrisSaveEnabled, setIsQrisSaveEnabled] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  const activeItem = formState.items[activeItemIndex] || formState.items[0];
  const outfitTypeCategory = getOutfitType(activeItem?.outfitType || 'Jas');
  const currentFields = getFieldsForOutfit(outfitTypeCategory);
  
  // Compute total price from all items
  const totalPrice = formState.items.reduce((sum, item) => sum + parseCurrencyInput(item.itemPrice), 0);
  const totalSewingFee = formState.items.reduce((sum, item) => sum + (parseCurrencyInput(item.sewingFee) || parseCurrencyInput(item.itemPrice)), 0);

  // QRIS Modal countdown effect
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

  // Supabase Realtime subscription for payment detection
  useEffect(() => {
    if (!showQrisModal || !pendingOrderId) return;

    const channel = supabase
      .channel(`new-order-payment-${pendingOrderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'trx',
          table: 'transaction',
          filter: `id=eq.${pendingOrderId}`,
        },
        (payload) => {
          const newRecord = payload.new as Record<string, any>;
          const oldRecord = payload.old as Record<string, any>;

          console.log('=== REALTIME UPDATE RECEIVED ===');
          console.log('Old:', oldRecord);
          console.log('New:', newRecord);

          // Check if payment received (amount_paid increased or status changed to dp/lunas)
          if (
            (newRecord.payment_status === 'lunas' || newRecord.payment_status === 'dp') &&
            newRecord.payment_status !== oldRecord.payment_status
          ) {
            console.log('Payment status changed! Closing modal...');
            setPaymentReceived(true);
            setIsQrisSaveEnabled(true);
            toast.success('Pembayaran diterima! Order akan disimpan otomatis...');
            
            // Auto close modal and complete
            setTimeout(() => {
              setShowQrisModal(false);
              completeOrderAfterPayment();
            }, 1500);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showQrisModal, pendingOrderId]);

  // Auto-save draft (debounced 3 seconds)
  useEffect(() => {
    // Don't auto-save if form is empty
    const hasData = formState.name || formState.items.some(item => Object.keys(item.measurements).length > 0);
    if (!hasData) return;

    const timer = setTimeout(async () => {
      try {
        const draftData = {
          data: JSON.stringify(formState),
          customer_name: formState.name || 'Draft',
          outfit_type: formState.items.map(i => i.outfitType).join(' + '),
          updated_at: new Date(),
        };

        if (draftId) {
          // Update existing draft
          await db.draft.update(draftId, draftData);
        } else {
          // Create new draft
          const id = await db.draft.add(draftData);
          setDraftId(id as number);
        }
      } catch (err) {
        console.error('Failed to save draft:', err);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [formState, draftId]);

  // Check for existing draft on mount
  useEffect(() => {
    async function checkDraft() {
      const drafts = await db.draft.orderBy('updated_at').reverse().limit(1).toArray();
      if (drafts.length > 0) {
        setPendingDraft(drafts[0]);
        setShowRestoreDraft(true);
      }
    }
    checkDraft();
  }, []);

  useEffect(() => {
    syncPending();
    window.addEventListener('online', () => syncPending());
    return () => window.removeEventListener('online', () => syncPending());
  }, []);

  // Listen to customer-selected event
  useEffect(() => {
    const handleCustomerSelected = (e: Event) => {
      if (skipCustomerEvent.current) {
        skipCustomerEvent.current = false;
        return;
      }
      
      const { isNew, customer, preset, typedName } = (e as CustomEvent).detail;
      
      if (isNew) {
        // Reset form but keep the typed name
        const nameToKeep = typedName || '';
        setFormState({
          selectedCustomerId: null,
          selectedPresetId: null,
          name: nameToKeep,
          tag: '',
          phone: '',
          items: [createEmptyItem('Jas')],
          amountPaid: '',
          saveAsPreset: false,
          presetName: '',
        });
        setActiveItemIndex(0);
        setErrors([]);
        return;
      }

      const newMeasurements: Record<string, string> = {};
      
      if (preset) {
        // Load preset measurements
        const allPossibleFields = [...JAS_FIELDS, ...KEMEJA_PANJANG_FIELDS, ...KEMEJA_PENDEK_FIELDS];
        allPossibleFields.forEach(([fieldId]) => {
          const dbKey = fieldId.replace(/([A-Z])/g, '_$1').toLowerCase() as keyof PresetCustomer;
          if (preset[dbKey] != null) {
            newMeasurements[fieldId] = String(preset[dbKey]);
          }
        });

        const presetItem: ItemState = {
          outfitType: preset.outfit_type ?? 'Jas',
          panjangKain: preset.panjang_kain ? String(preset.panjang_kain) : '',
          lebarKain: preset.lebar_kain ? String(preset.lebar_kain) : '',
          cuciSebelumPotong: !!preset.cuci_sebelum_potong,
          measurements: newMeasurements,
          furing: false,
          paddingTebal: false,
          paddingTipis: false,
          kancing: false,
          itemPrice: '',
          sewingFee: '',
          catatan: preset.catatan ?? '',
        };

        setFormState(prev => ({
          ...prev,
          selectedCustomerId: customer.id,
          selectedPresetId: preset.id ?? null,
          name: customer.name ?? '',
          tag: customer.tag ?? '',
          phone: customer.phone ?? '',
          items: [presetItem],
        }));
        setActiveItemIndex(0);

        // Notify sketch
        window.dispatchEvent(new CustomEvent('outfit-update', { detail: preset.outfit_type }));
        Object.entries(newMeasurements).forEach(([id, value]) => {
          window.dispatchEvent(new CustomEvent('measurement-update', { detail: { id, value } }));
        });
        (window as any).__lastOutfit = preset.outfit_type;
      } else {
        // Ukuran baru - keep customer info, reset items
        setFormState(prev => ({
          ...prev,
          selectedCustomerId: customer.id,
          selectedPresetId: null,
          name: customer.name ?? '',
          tag: customer.tag ?? '',
          phone: customer.phone ?? '',
          items: [createEmptyItem('Jas')],
        }));
        setActiveItemIndex(0);
      }
    };

    window.addEventListener('customer-selected', handleCustomerSelected);
    return () => window.removeEventListener('customer-selected', handleCustomerSelected);
  }, []);

  // Listen to outfit-changed event from Combobox - update active item
  useEffect(() => {
    const handleOutfitChanged = (e: Event) => {
      const outfit = (e as CustomEvent).detail;
      setFormState(prev => {
        const newItems = [...prev.items];
        newItems[activeItemIndex] = {
          ...newItems[activeItemIndex],
          outfitType: outfit,
          panjangKain: String(PANJANG_KAIN_DEFAULT[outfit] ?? ''),
          lebarKain: String(LEBAR_KAIN_DEFAULT[outfit] ?? ''),
        };
        return { ...prev, items: newItems };
      });
      (window as any).__lastOutfit = outfit;
      window.dispatchEvent(new CustomEvent('outfit-update', { detail: outfit }));
    };

    window.addEventListener('outfit-changed', handleOutfitChanged);
    return () => window.removeEventListener('outfit-changed', handleOutfitChanged);
  }, [activeItemIndex]);

  const resetForm = () => {
    setFormState({
      selectedCustomerId: null,
      selectedPresetId: null,
      name: '',
      tag: '',
      phone: '',
      items: [createEmptyItem('Jas')],
      amountPaid: '',
      paymentMethod: 'tunai',
      saveAsPreset: false,
      presetName: '',
    });
    setActiveItemIndex(0);
    setErrors([]);
    window.dispatchEvent(new CustomEvent('measurement-reset'));
  };

  const handleMeasurementChange = (fieldId: string, value: string) => {
    setFormState(prev => {
      const newItems = [...prev.items];
      newItems[activeItemIndex] = {
        ...newItems[activeItemIndex],
        measurements: { ...newItems[activeItemIndex].measurements, [fieldId]: value },
      };
      return { ...prev, items: newItems };
    });
    window.dispatchEvent(new CustomEvent('measurement-update', { detail: { id: fieldId, value } }));
    
    // Clear error for this field
    setErrors(prev => prev.filter(e => e !== fieldId));
  };

  const handleMeasurementFocus = (fieldId: string) => {
    window.dispatchEvent(new CustomEvent('measurement-focus', { detail: fieldId }));
  };

  const handleMeasurementBlur = () => {
    window.dispatchEvent(new CustomEvent('measurement-focus', { detail: null }));
  };

  const parseVal = (val: string) => parseFloat(val.replace(',', '.')) || 0;

  const validateForm = (): boolean => {
    // Validate all items
    for (let i = 0; i < formState.items.length; i++) {
      const item = formState.items[i];
      const itemOutfitType = getOutfitType(item.outfitType);
      const itemFields = getFieldsForOutfit(itemOutfitType);
      const emptyFields: string[] = [];

      itemFields.forEach(([fieldId]) => {
        if (!parseVal(item.measurements[fieldId] || '')) {
          emptyFields.push(fieldId);
        }
      });

      if (emptyFields.length > 0) {
        setActiveItemIndex(i);
        setErrors(emptyFields);
        toast.error(`Item ${i + 1} (${item.outfitType}): Harap isi semua 8 field ukuran.`);
        return false;
      }
    }

    if (!formState.name.trim()) {
      toast.error('Masukkan nama pelanggan.');
      return false;
    }

    return true;
  };

  // Helper to build outfit_type display string
  const getOutfitTypeDisplay = (): string => {
    const types = formState.items.map(i => i.outfitType);
    if (types.length === 1) return types[0];
    if (types.length === 2) return types.join(' + ');
    return `${types.length} item`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setErrors([]);

    // If QRIS payment and has amount to pay, pre-create order first
    const amountPaid = parseCurrencyInput(formState.amountPaid);
    if (formState.paymentMethod === 'qris' && amountPaid > 0) {
      await preCreateOrderForQris();
      return;
    }

    // Otherwise proceed with normal save
    await saveOrder();
  };

  // Pre-create order for QRIS payment - creates order with pending_payment status
  const preCreateOrderForQris = async () => {
    setIsCreatingOrder(true);
    setPaymentReceived(false);
    
    try {
      // 1. Resolve customer_id
      let customerId = formState.selectedCustomerId;
      let supabaseCustomerId: number | null = null;

      if (!customerId) {
        const newCustomer: Customer = {
          name: formState.name.trim(),
          tag: formState.tag.trim() || undefined,
          phone: formState.phone.trim() || undefined,
          total_trx: 0,
          synced: false,
        };
        customerId = (await db.customer.add(newCustomer)) as number;
        supabaseCustomerId = await syncCustomer({ ...newCustomer, id: customerId });
      } else if (navigator.onLine) {
        const localCustomer = await db.customer.get(customerId);
        if (localCustomer?.name) {
          const { data } = await trx.from('customer').select('id').eq('name', localCustomer.name).single();
          if (data?.id) supabaseCustomerId = data.id as number;
        }
      }

      // 2. Optionally save preset
      let presetId = formState.selectedPresetId;
      let supabasePresetId: number | undefined;

      if (formState.saveAsPreset && !presetId) {
        for (let i = 0; i < formState.items.length; i++) {
          const item = formState.items[i];
          const presetName = formState.items.length === 1
            ? (formState.presetName.trim() || item.outfitType)
            : `${formState.presetName.trim() || 'Set'} - ${item.outfitType}`;
          const newPreset = {
            customer_id: customerId,
            preset_name: presetName,
            outfit_type: item.outfitType,
            panjang_kain: parseVal(item.panjangKain),
            lebar_kain: parseVal(item.lebarKain),
            cuci_sebelum_potong: item.cuciSebelumPotong,
            panjang_badan: parseVal(item.measurements.panjangBadan || ''),
            lebar_bahu: parseVal(item.measurements.lebarBahu || ''),
            panjang_lengan: parseVal(item.measurements.panjangLengan || ''),
            lingkar_lengan: parseVal(item.measurements.lingkarLengan || ''),
            lingkar_ujung_lengan: parseVal(item.measurements.lingkarUjungLengan || ''),
            lingkar_dada: parseVal(item.measurements.lingkarDada || ''),
            lingkar_perut: parseVal(item.measurements.lingkarPerut || ''),
            lingkar_pinggul: parseVal(item.measurements.lingkarPinggul || ''),
            lingkar_leher: parseVal(item.measurements.lingkarLeher || '') || undefined,
            lebar_pundak: parseVal(item.measurements.lebarPundak || '') || undefined,
            catatan: item.catatan,
            synced: false,
          };
          const savedPresetId = (await db.preset_customer.add(newPreset)) as number;
          const spid = await syncPreset(
            { ...newPreset, id: savedPresetId },
            supabaseCustomerId ?? undefined
          );
          if (i === 0) {
            presetId = savedPresetId;
            supabasePresetId = spid ?? undefined;
          }
        }
      }

      // 3. Determine initial status
      const needsCuci = formState.items.some(item => item.cuciSebelumPotong);
      const status = needsCuci ? 'Cuci Bahan' : 'Potong Bahan';

      // 4. Create transaction with pending_payment status (amount_paid = 0 initially)
      const amountPaid = parseCurrencyInput(formState.amountPaid);
      
      const newTrx: Transaction = {
        customer_id: customerId,
        preset_id: presetId ?? undefined,
        outfit_type: getOutfitTypeDisplay(),
        status,
        total_price: totalPrice || undefined,
        sewing_fee: totalSewingFee || undefined,
        amount_paid: 0, // Will be updated by webhook when payment received
        payment_status: 'belum_bayar', // Will be updated by webhook
        created_at: new Date(),
        synced: false,
      };
      
      const trxId = (await db.transactions.add(newTrx)) as number;
      const supabaseTrxId = await syncTransaction(
        { ...newTrx, id: trxId },
        supabaseCustomerId ?? undefined,
        supabasePresetId
      );

      // 5. Create transaction_items
      for (const item of formState.items) {
        const itemData: Omit<TransactionItem, 'id'> = {
          transaction_id: trxId,
          outfit_type: item.outfitType,
          panjang_kain: parseVal(item.panjangKain),
          lebar_kain: parseVal(item.lebarKain),
          cuci_sebelum_potong: item.cuciSebelumPotong,
          panjang_badan: parseVal(item.measurements.panjangBadan || ''),
          lebar_bahu: parseVal(item.measurements.lebarBahu || ''),
          panjang_lengan: parseVal(item.measurements.panjangLengan || ''),
          lingkar_lengan: parseVal(item.measurements.lingkarLengan || ''),
          lingkar_ujung_lengan: parseVal(item.measurements.lingkarUjungLengan || ''),
          lingkar_dada: parseVal(item.measurements.lingkarDada || ''),
          lingkar_perut: parseVal(item.measurements.lingkarPerut || ''),
          lingkar_pinggul: parseVal(item.measurements.lingkarPinggul || ''),
          lingkar_leher: parseVal(item.measurements.lingkarLeher || '') || undefined,
          lebar_pundak: parseVal(item.measurements.lebarPundak || '') || undefined,
          furing: item.furing,
          padding_tebal: item.paddingTebal,
          padding_tipis: item.paddingTipis,
          kancing: item.kancing,
          catatan: item.catatan,
          item_price: parseCurrencyInput(item.itemPrice) || undefined,
          sewing_fee: parseCurrencyInput(item.sewingFee) || parseCurrencyInput(item.itemPrice) || undefined,
          synced: false,
        };
        const itemId = (await db.transaction_item.add(itemData)) as number;
        await syncTransactionItem({ ...itemData, id: itemId }, supabaseTrxId ?? undefined);
      }

      // 6. Create pending QRIS payment record for webhook matching
      if (supabaseTrxId) {
        await trx.from('pending_qris_payment').insert({
          order_id: supabaseTrxId,
          amount: amountPaid,
        });
      }

      // Store order ID for QRIS reference and Realtime subscription
      setPendingOrderId(supabaseTrxId || trxId);
      setShowQrisModal(true);
      
    } catch (err) {
      console.error(err);
      toast.error('Gagal membuat pesanan.');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Complete order after payment received (cleanup)
  const completeOrderAfterPayment = async () => {
    // Clear draft
    if (draftId) {
      await db.draft.delete(draftId);
      setDraftId(null);
    }
    
    setPendingOrderId(null);
    setPaymentReceived(false);
    resetForm();
    window.dispatchEvent(new CustomEvent('order-success'));
  };

  // Manual save from QRIS modal (when user confirms payment received)
  const handleManualQrisSave = async () => {
    if (!pendingOrderId) return;
    
    try {
      const amountPaid = parseCurrencyInput(formState.amountPaid);
      const paymentStatus = amountPaid >= totalPrice ? 'lunas' : 'dp';
      
      // Update order with payment info
      await trx
        .from('transaction')
        .update({
          amount_paid: amountPaid,
          payment_status: paymentStatus,
        })
        .eq('id', pendingOrderId);
      
      // Also update local DB
      const localOrder = await db.transactions.where('synced').equals(1).first();
      if (localOrder) {
        await db.transactions.update(localOrder.id!, {
          amount_paid: amountPaid,
          payment_status: paymentStatus,
        });
      }
      
      setShowQrisModal(false);
      await completeOrderAfterPayment();
      
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan pembayaran.');
    }
  };

  // Cancel QRIS order (delete the pre-created order)
  const handleCancelQrisOrder = async () => {
    if (pendingOrderId) {
      try {
        // Mark pending payment as cancelled
        await trx.from('pending_qris_payment')
          .update({ status: 'cancelled' })
          .eq('order_id', pendingOrderId);
        
        // Delete from Supabase
        await trx.from('transaction_item').delete().eq('transaction_id', pendingOrderId);
        await trx.from('transaction').delete().eq('id', pendingOrderId);
        
        toast.info('Pesanan dibatalkan.');
      } catch (err) {
        console.error('Failed to delete pending order:', err);
      }
    }
    
    setPendingOrderId(null);
    setPaymentReceived(false);
    setShowQrisModal(false);
  };

  const saveOrder = async () => {
    try {
      // 1. Resolve customer_id
      let customerId = formState.selectedCustomerId;
      let supabaseCustomerId: number | null = null;

      if (!customerId) {
        const newCustomer: Customer = {
          name: formState.name.trim(),
          tag: formState.tag.trim() || undefined,
          phone: formState.phone.trim() || undefined,
          total_trx: 0,
          synced: false,
        };
        customerId = (await db.customer.add(newCustomer)) as number;
        supabaseCustomerId = await syncCustomer({ ...newCustomer, id: customerId });
      } else if (navigator.onLine) {
        const localCustomer = await db.customer.get(customerId);
        if (localCustomer?.name) {
          const { data } = await trx.from('customer').select('id').eq('name', localCustomer.name).single();
          if (data?.id) supabaseCustomerId = data.id as number;
        }
      }

      // 2. Optionally save preset (save one preset per item)
      let presetId = formState.selectedPresetId;
      let supabasePresetId: number | undefined;

      if (formState.saveAsPreset && !presetId) {
        for (let i = 0; i < formState.items.length; i++) {
          const item = formState.items[i];
          const presetName = formState.items.length === 1
            ? (formState.presetName.trim() || item.outfitType)
            : `${formState.presetName.trim() || 'Set'} - ${item.outfitType}`;
          const newPreset = {
            customer_id: customerId,
            preset_name: presetName,
            outfit_type: item.outfitType,
            panjang_kain: parseVal(item.panjangKain),
            lebar_kain: parseVal(item.lebarKain),
            cuci_sebelum_potong: item.cuciSebelumPotong,
            panjang_badan: parseVal(item.measurements.panjangBadan || ''),
            lebar_bahu: parseVal(item.measurements.lebarBahu || ''),
            panjang_lengan: parseVal(item.measurements.panjangLengan || ''),
            lingkar_lengan: parseVal(item.measurements.lingkarLengan || ''),
            lingkar_ujung_lengan: parseVal(item.measurements.lingkarUjungLengan || ''),
            lingkar_dada: parseVal(item.measurements.lingkarDada || ''),
            lingkar_perut: parseVal(item.measurements.lingkarPerut || ''),
            lingkar_pinggul: parseVal(item.measurements.lingkarPinggul || ''),
            lingkar_leher: parseVal(item.measurements.lingkarLeher || '') || undefined,
            lebar_pundak: parseVal(item.measurements.lebarPundak || '') || undefined,
            catatan: item.catatan,
            synced: false,
          };
          const savedPresetId = (await db.preset_customer.add(newPreset)) as number;
          const spid = await syncPreset(
            { ...newPreset, id: savedPresetId },
            supabaseCustomerId ?? undefined
          );
          // Use first preset for transaction reference
          if (i === 0) {
            presetId = savedPresetId;
            supabasePresetId = spid ?? undefined;
          }
        }
      }

      // 3. Determine initial status (if any item has cuci_sebelum_potong)
      const needsCuci = formState.items.some(item => item.cuciSebelumPotong);
      const status = needsCuci ? 'Cuci Bahan' : 'Potong Bahan';

      // 4. Calculate totals
      const amountPaid = parseCurrencyInput(formState.amountPaid);
      let paymentStatus: 'belum_bayar' | 'dp' | 'lunas' = 'belum_bayar';
      if (amountPaid > 0) {
        paymentStatus = amountPaid >= totalPrice ? 'lunas' : 'dp';
      }

      // 5. Create transaction (parent) - no measurements, just totals and display hint
      const newTrx: Transaction = {
        customer_id: customerId,
        preset_id: presetId ?? undefined,
        outfit_type: getOutfitTypeDisplay(),
        status,
        total_price: totalPrice || undefined,
        sewing_fee: totalSewingFee || undefined,
        amount_paid: amountPaid || 0,
        payment_status: paymentStatus,
        created_at: new Date(),
        synced: false,
      };
      const trxId = (await db.transactions.add(newTrx)) as number;
      const supabaseTrxId = await syncTransaction(
        { ...newTrx, id: trxId },
        supabaseCustomerId ?? undefined,
        supabasePresetId
      );

      // 6. Create transaction_items for each piece
      for (const item of formState.items) {
        const itemData: Omit<TransactionItem, 'id'> = {
          transaction_id: trxId,
          outfit_type: item.outfitType,
          panjang_kain: parseVal(item.panjangKain),
          lebar_kain: parseVal(item.lebarKain),
          cuci_sebelum_potong: item.cuciSebelumPotong,
          panjang_badan: parseVal(item.measurements.panjangBadan || ''),
          lebar_bahu: parseVal(item.measurements.lebarBahu || ''),
          panjang_lengan: parseVal(item.measurements.panjangLengan || ''),
          lingkar_lengan: parseVal(item.measurements.lingkarLengan || ''),
          lingkar_ujung_lengan: parseVal(item.measurements.lingkarUjungLengan || ''),
          lingkar_dada: parseVal(item.measurements.lingkarDada || ''),
          lingkar_perut: parseVal(item.measurements.lingkarPerut || ''),
          lingkar_pinggul: parseVal(item.measurements.lingkarPinggul || ''),
          lingkar_leher: parseVal(item.measurements.lingkarLeher || '') || undefined,
          lebar_pundak: parseVal(item.measurements.lebarPundak || '') || undefined,
          furing: item.furing,
          padding_tebal: item.paddingTebal,
          padding_tipis: item.paddingTipis,
          kancing: item.kancing,
          catatan: item.catatan,
          item_price: parseCurrencyInput(item.itemPrice) || undefined,
          sewing_fee: parseCurrencyInput(item.sewingFee) || parseCurrencyInput(item.itemPrice) || undefined,
          synced: false,
        };
        const itemId = (await db.transaction_item.add(itemData)) as number;
        await syncTransactionItem({ ...itemData, id: itemId }, supabaseTrxId ?? undefined);
      }

      // Clear draft on successful save
      if (draftId) {
        await db.draft.delete(draftId);
        setDraftId(null);
      }

      resetForm();
      window.dispatchEvent(new CustomEvent('order-success'));
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan data.');
    }
  };

  const handleRestoreDraft = () => {
    if (pendingDraft) {
      const restored = JSON.parse(pendingDraft.data);
      
      // Set flag to skip customer-selected event
      skipCustomerEvent.current = true;
      
      // Handle old draft format (flat) vs new format (items array)
      if (restored.items) {
        // New format with items array
        setFormState(restored);
        setActiveItemIndex(0);
        
        // Notify sketch with first item's outfit
        const firstItem = restored.items[0];
        if (firstItem) {
          window.dispatchEvent(new CustomEvent('outfit-update', { detail: firstItem.outfitType }));
          Object.entries(firstItem.measurements || {}).forEach(([id, value]) => {
            window.dispatchEvent(new CustomEvent('measurement-update', { detail: { id, value } }));
          });
          (window as any).__lastOutfit = firstItem.outfitType;
        }
      } else {
        // Old format - convert to new items array format
        const convertedItem: ItemState = {
          outfitType: restored.outfitType || 'Jas',
          panjangKain: restored.panjangKain || '',
          lebarKain: restored.lebarKain || '',
          cuciSebelumPotong: restored.cuciSebelumPotong || false,
          measurements: restored.measurements || {},
          furing: restored.furing || false,
          paddingTebal: restored.paddingTebal || false,
          paddingTipis: restored.paddingTipis || false,
          kancing: restored.kancing || false,
          itemPrice: restored.totalPrice || '',
          sewingFee: restored.sewingFee || '',
          catatan: restored.catatan || '',
        };
        setFormState({
          selectedCustomerId: restored.selectedCustomerId,
          selectedPresetId: restored.selectedPresetId,
          name: restored.name || '',
          tag: restored.tag || '',
          phone: restored.phone || '',
          items: [convertedItem],
          amountPaid: restored.amountPaid || '',
          saveAsPreset: restored.saveAsPreset || false,
          presetName: restored.presetName || '',
        });
        setActiveItemIndex(0);
        
        // Notify sketch
        window.dispatchEvent(new CustomEvent('outfit-update', { detail: restored.outfitType }));
        Object.entries(restored.measurements || {}).forEach(([id, value]) => {
          window.dispatchEvent(new CustomEvent('measurement-update', { detail: { id, value } }));
        });
        (window as any).__lastOutfit = restored.outfitType;
      }
      
      setDraftId(pendingDraft.id);
      setShowRestoreDraft(false);
      
      // If draft has a registered customer, notify CustomerSearch
      if (restored.selectedCustomerId) {
        window.dispatchEvent(new CustomEvent('draft-restore', { detail: { name: restored.name } }));
        setIsDraftRestored(false);
      } else {
        // New customer draft - use direct input mode
        setIsDraftRestored(true);
      }
      
      toast.success('Draft dipulihkan');
    }
  };

  const handleDiscardDraft = async () => {
    if (pendingDraft?.id) {
      await db.draft.delete(pendingDraft.id);
    }
    setShowRestoreDraft(false);
    setPendingDraft(null);
  };

  return (
    <div className="container mx-auto space-y-6">
      {/* Draft Restore Dialog */}
      {showRestoreDraft && (
        <Alert className="border-blue-500 bg-blue-50">
          <AlertTitle>Draft Ditemukan</AlertTitle>
          <AlertDescription>
            <p className="mb-3">
              Pesanan terakhir untuk <strong>{pendingDraft?.customer_name}</strong> ({pendingDraft?.outfit_type}) belum selesai.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleRestoreDraft} size="sm" variant="default">
                Lanjutkan Draft
              </Button>
              <Button onClick={handleDiscardDraft} size="sm" variant="outline">
                Mulai Baru
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertTitle>Tips Tablet!</AlertTitle>
        <AlertDescription>
          Sketsa di sebelah kanan menunjukkan lokasi pengukuran. Angka akan update secara otomatis saat Anda mengetik di formulir kiri.
        </AlertDescription>
      </Alert>

      <Card className="overflow-hidden border-2 shadow-xl">
        <CardHeader>
          <CardTitle>Pesanan Baru</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          {/* BAGIAN KIRI: Form Input */}
          <div className="px-4 sm:px-6 md:px-8 pb-6 md:pb-8 pt-6 space-y-6 bg-white">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-2">
                    <Label>
                      Nama Pelanggan<span className="text-red-500">*</span>
                    </Label>
                    {isDraftRestored ? (
                      <Input
                        value={formState.name}
                        onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Nama pelanggan"
                        className="h-12 text-base border-2"
                      />
                    ) : (
                      <CustomerSearch />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>No. HP / WA</Label>
                    <Input
                      value={formState.phone}
                      onChange={(e) => setFormState(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="08xx"
                      className="h-12 text-base border-2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tag <span className="text-slate-400 font-normal text-xs">(internal)</span></Label>
                    <Input
                      value={formState.tag}
                      onChange={(e) => setFormState(prev => ({ ...prev, tag: e.target.value }))}
                      placeholder="cth: karangjati, BPR"
                      className="h-12 text-base border-2"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>
                    Pilih Jenis Pakaian<span className="text-red-500">*</span>
                  </Label>
                  <Combobox
                    items={outfitOptions}
                    value={activeItem.outfitType}
                    placeholder="Pilih jenis pakaian"
                    className="h-12 border-2"
                    showClear={false}
                    eventName="outfit-changed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  <div className="space-y-2">
                    <Label>
                      P Kain (m)<span className="text-slate-400 font-normal text-xs"> otomatis</span>
                    </Label>
                    <Input
                      value={activeItem.panjangKain}
                      onChange={(e) => setFormState(prev => {
                        const newItems = [...prev.items];
                        newItems[activeItemIndex] = { ...newItems[activeItemIndex], panjangKain: e.target.value };
                        return { ...prev, items: newItems };
                      })}
                      type="text"
                      inputMode="decimal"
                      placeholder="0,0"
                      className="h-12 border-2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      L Kain (m)<span className="text-slate-400 font-normal text-xs"> otomatis</span>
                    </Label>
                    <Input
                      value={activeItem.lebarKain}
                      onChange={(e) => setFormState(prev => {
                        const newItems = [...prev.items];
                        newItems[activeItemIndex] = { ...newItems[activeItemIndex], lebarKain: e.target.value };
                        return { ...prev, items: newItems };
                      })}
                      type="text"
                      inputMode="decimal"
                      placeholder="0,0"
                      className="h-12 border-2"
                    />
                  </div>
                  <div className="flex flex-col items-center gap-2 pb-2">
                    <Label htmlFor="cuciSebelumPotong" className="whitespace-nowrap text-xs text-center">
                      Perlu Dicuci Dulu?
                    </Label>
                    <Checkbox
                      id="cuciSebelumPotong"
                      checked={activeItem.cuciSebelumPotong}
                      onCheckedChange={(checked) => setFormState(prev => {
                        const newItems = [...prev.items];
                        newItems[activeItemIndex] = { ...newItems[activeItemIndex], cuciSebelumPotong: checked === true };
                        return { ...prev, items: newItems };
                      })}
                    />
                  </div>
                </div>
              </div>

              <hr />

              {/* Item tabs for multi-item orders */}
              {formState.items.length > 1 && (
                <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
                  {formState.items.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setActiveItemIndex(idx);
                        window.dispatchEvent(new CustomEvent('outfit-update', { detail: item.outfitType }));
                        Object.entries(item.measurements).forEach(([id, value]) => {
                          window.dispatchEvent(new CustomEvent('measurement-update', { detail: { id, value } }));
                        });
                        (window as any).__lastOutfit = item.outfitType;
                      }}
                      className={`px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl text-sm sm:text-base font-semibold transition-all border-2 min-h-[44px] sm:min-h-[48px] ${
                        activeItemIndex === idx
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-slate-400'
                      }`}
                    >
                      Item {idx + 1}: {item.outfitType}
                    </button>
                  ))}
                </div>
              )}

              {/* Per-item price fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Harga Item Ini (Rp)</Label>
                  <Input
                    value={activeItem.itemPrice}
                    onChange={(e) => {
                      const formatted = formatCurrencyInput(e.target.value);
                      setFormState(prev => {
                        const newItems = [...prev.items];
                        newItems[activeItemIndex] = { 
                          ...newItems[activeItemIndex], 
                          itemPrice: formatted,
                          sewingFee: newItems[activeItemIndex].sewingFee || formatted,
                        };
                        return { ...prev, items: newItems };
                      });
                    }}
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    className="h-12 border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Biaya Jahit Item (Rp)
                    <span className="text-slate-400 font-normal text-xs ml-1">basis komisi</span>
                  </Label>
                  <Input
                    value={activeItem.sewingFee}
                    onChange={(e) => {
                      const formatted = formatCurrencyInput(e.target.value);
                      setFormState(prev => {
                        const newItems = [...prev.items];
                        newItems[activeItemIndex] = { ...newItems[activeItemIndex], sewingFee: formatted };
                        return { ...prev, items: newItems };
                      });
                    }}
                    type="text"
                    inputMode="numeric"
                    placeholder="Sama dengan harga item"
                    className="h-12 border-2"
                  />
                </div>
              </div>

              {/* Total and payment - shown when more than 1 item or always */}
              <div className="p-4 rounded-lg bg-slate-50 border space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Total Harga ({formState.items.length} item)</span>
                  <span className="text-lg font-bold text-slate-900">{formatCurrencyInput(String(totalPrice))}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Uang Muka / DP (Rp)</Label>
                    <Input
                      value={formState.amountPaid}
                      onChange={(e) => {
                        const formatted = formatCurrencyInput(e.target.value);
                        setFormState(prev => ({ ...prev, amountPaid: formatted }));
                      }}
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      className="h-12 border-2 bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Sisa Pembayaran (Rp)</Label>
                    <Input
                      value={formatCurrencyInput(String(Math.max(0, totalPrice - parseCurrencyInput(formState.amountPaid))))}
                      disabled
                      className="h-12 border-2 bg-slate-100"
                    />
                  </div>
                </div>
                
                {/* Lunas badge when DP >= Total */}
                {totalPrice > 0 && parseCurrencyInput(formState.amountPaid) >= totalPrice && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                    <svg className="text-green-600 shrink-0" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <span className="text-green-700 font-semibold">Pembayaran Lunas</span>
                  </div>
                )}
              </div>

              <hr />

              {/* Measurement fields */}
              <div className="grid pl-9 pr-3 sm:px-3 grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-9 gap-y-4 sm:gap-y-6">
                {currentFields.map(([fieldId, label], i) => (
                  <div key={fieldId} className="space-y-2 relative">
                    <div className="absolute left-[-1.75rem] top-[2.75rem] -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-sm">
                      {i + 1}
                    </div>
                    <Label>{label} (cm)</Label>
                    <Input
                      value={activeItem.measurements[fieldId] || ''}
                      onChange={(e) => handleMeasurementChange(fieldId, e.target.value)}
                      onFocus={() => handleMeasurementFocus(fieldId)}
                      onBlur={handleMeasurementBlur}
                      type="text"
                      inputMode="decimal"
                      placeholder="0,0"
                      className={`h-12 border-2 ${errors.includes(fieldId) ? 'border-red-500 ring-2 ring-red-200' : ''}`}
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4 sm:gap-y-6">
                {[
                  ['Furing', 'furing'],
                  ['Padding Tebal', 'paddingTebal'],
                  ['Padding Tipis', 'paddingTipis'],
                  ['Kancing', 'kancing'],
                ].map(([label, key]) => (
                  <div key={key} className="flex flex-col items-center gap-2">
                    <Label htmlFor={key} className="whitespace-nowrap text-center text-xs">
                      {label}
                    </Label>
                    <Checkbox
                      id={key}
                      checked={activeItem[key as keyof ItemState] as boolean}
                      onCheckedChange={(checked) => setFormState(prev => {
                        const newItems = [...prev.items];
                        newItems[activeItemIndex] = { ...newItems[activeItemIndex], [key]: checked === true };
                        return { ...prev, items: newItems };
                      })}
                    />
                  </div>
                ))}
              </div>

              {/* Save as preset option */}
              <div className="flex items-center gap-3 p-3 rounded-md bg-slate-50 border">
                <Checkbox
                  id="saveAsPreset"
                  checked={formState.saveAsPreset}
                  onCheckedChange={(checked) => setFormState(prev => ({ ...prev, saveAsPreset: checked === true }))}
                />
                <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <Label htmlFor="saveAsPreset" className="cursor-pointer">
                    Simpan sebagai profil ukuran?
                    {formState.items.length > 1 && (
                      <span className="text-xs text-slate-500 ml-1">({formState.items.length} profil)</span>
                    )}
                  </Label>
                  <Input
                    value={formState.presetName}
                    onChange={(e) => setFormState(prev => ({ ...prev, presetName: e.target.value }))}
                    placeholder={formState.items.length > 1 ? "Nama profil (cth: Pak Budi)" : "Nama profil (cth: Jas Nikahan)"}
                    className="h-9 border-2 flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>
                  Catatan Item<span className="text-slate-400 font-normal text-xs"> (opsional)</span>
                </Label>
                <textarea
                  value={activeItem.catatan}
                  onChange={(e) => setFormState(prev => {
                    const newItems = [...prev.items];
                    newItems[activeItemIndex] = { ...newItems[activeItemIndex], catatan: e.target.value };
                    return { ...prev, items: newItems };
                  })}
                  placeholder="Tambahkan catatan khusus untuk item ini..."
                  className="w-full min-h-[80px] rounded-md border-2 border-input bg-background px-3 py-2 text-base resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              {/* Add another item button */}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const newItem = createEmptyItem('Celana');
                    setFormState(prev => ({ ...prev, items: [...prev.items, newItem] }));
                    setActiveItemIndex(formState.items.length);
                    window.dispatchEvent(new CustomEvent('outfit-update', { detail: 'Celana' }));
                    (window as any).__lastOutfit = 'Celana';
                  }}
                  className="h-12 flex-1 border-dashed border-2 text-indigo-600 hover:bg-indigo-50"
                >
                  + Tambah Pakaian Lain
                </Button>
                {formState.items.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (formState.items.length <= 1) return;
                      setFormState(prev => {
                        const newItems = prev.items.filter((_, idx) => idx !== activeItemIndex);
                        return { ...prev, items: newItems };
                      });
                      setActiveItemIndex(Math.max(0, activeItemIndex - 1));
                    }}
                    className="h-12 px-4 border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Hapus Item Ini
                  </Button>
                )}
              </div>

              {/* Payment method section - before submit */}
              {totalPrice > 0 && parseCurrencyInput(formState.amountPaid) > 0 && (
                <div className="space-y-3 p-4 bg-slate-50 rounded-xl border">
                  <Label className="text-base font-semibold">
                    Metode Pembayaran {parseCurrencyInput(formState.amountPaid) >= totalPrice ? '(Lunas)' : '(DP)'}
                  </Label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setFormState(prev => ({ ...prev, paymentMethod: 'tunai' }))}
                      className={`flex-1 py-3 px-4 rounded-xl text-sm sm:text-base font-semibold border-2 transition-all ${
                        formState.paymentMethod === 'tunai'
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                      }`}
                    >
                      💵 Tunai
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormState(prev => ({ ...prev, paymentMethod: 'qris' }))}
                      className={`flex-1 py-3 px-4 rounded-xl text-sm sm:text-base font-semibold border-2 transition-all ${
                        formState.paymentMethod === 'qris'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                      }`}
                    >
                      📱 QRIS
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" className="h-14 px-10 text-lg font-bold bg-indigo-600 hover:bg-indigo-700">
                  Simpan Pesanan
                </Button>
              </div>
            </form>
          </div>

          {/* BAGIAN KANAN: Live Sketch */}
          <div className="p-6 bg-slate-50 flex flex-col justify-center items-center min-h-[600px]">
            <p className="text-sm text-slate-500 mb-3 font-medium">Pratinjau Sketsa</p>
            <div className="w-full h-full" style={{ minHeight: '500px' }}>
              <MeasurementSketch />
            </div>
          </div>
        </div>
      </Card>

      {/* QRIS Payment Modal */}
      <Dialog open={showQrisModal} onOpenChange={(open) => {
        if (!open && pendingOrderId && !paymentReceived) {
          // User trying to close - ask for confirmation
          if (confirm('Batalkan pesanan ini?')) {
            handleCancelQrisOrder();
          }
        } else {
          setShowQrisModal(open);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {paymentReceived ? '✅ Pembayaran Diterima!' : 'Pembayaran QRIS'}
            </DialogTitle>
            <DialogDescription>
              {paymentReceived 
                ? 'Pembayaran berhasil diterima. Order akan disimpan otomatis.'
                : `Minta customer scan QR code untuk membayar ${parseCurrencyInput(formState.amountPaid) >= totalPrice ? 'lunas' : 'DP'}.`
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {/* Order reference */}
            {pendingOrderId && (
              <div className="mb-4 p-3 bg-slate-100 rounded-lg text-center">
                <p className="text-xs text-slate-500">Reference ID</p>
                <p className="text-lg font-mono font-bold text-slate-800">ORDER-{pendingOrderId}</p>
              </div>
            )}
            
            {/* Payment status indicator */}
            {paymentReceived ? (
              <div className="p-6 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-green-700">Pembayaran Berhasil!</p>
                <p className="text-sm text-slate-500 mt-1">Menyimpan pesanan...</p>
              </div>
            ) : (
              <QrisGenerator 
                amount={parseCurrencyInput(formState.amountPaid)} 
                orderId={pendingOrderId || undefined}
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
                  onClick={handleCancelQrisOrder}
                  className="flex-1"
                >
                  Batalkan
                </Button>
                <Button 
                  onClick={handleManualQrisSave}
                  disabled={!isQrisSaveEnabled}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  {isQrisSaveEnabled ? 'Simpan Manual' : `Tunggu ${qrisCountdown}s...`}
                </Button>
              </div>
              <p className="text-xs text-center text-slate-400 mt-2">
                Order akan otomatis tersimpan saat pembayaran diterima
              </p>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <SuccessDialog />
    </div>
  );
}
