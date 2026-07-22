import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Combobox } from '@/components/ui/combobox';
import { Checkbox } from '@/components/ui/checkbox';
import MeasurementSketch from '@/components/measurementSketch';
import CustomerSearch from '@/components/CustomerSearch';
import SuccessDialog from '@/components/SuccessDialog';
import { db, syncCustomer, syncPreset, syncTransaction, syncPending } from '@/lib/db';
import type { Customer, PresetCustomer, Transaction } from '@/lib/db';
import { toast } from 'sonner';
import { trx } from '@/lib/supabase';
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

interface FormState {
  selectedCustomerId: number | null;
  selectedPresetId: number | null;
  name: string;
  phone: string;
  outfitType: string;
  panjangKain: string;
  lebarKain: string;
  cuciSebelumPotong: boolean;
  measurements: Record<string, string>;
  catatan: string;
  saveAsPreset: boolean;
  presetName: string;
  furing: boolean;
  paddingTebal: boolean;
  paddingTipis: boolean;
  kancing: boolean;
  totalPrice: string;
  amountPaid: string;
}

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
    phone: '',
    outfitType: 'Jas',
    panjangKain: String(PANJANG_KAIN_DEFAULT['Jas']),
    lebarKain: String(LEBAR_KAIN_DEFAULT['Jas']),
    cuciSebelumPotong: false,
    measurements: {},
    catatan: '',
    saveAsPreset: false,
    presetName: '',
    furing: false,
    paddingTebal: false,
    paddingTipis: false,
    kancing: false,
    totalPrice: '',
    amountPaid: '',
  });

  const [errors, setErrors] = useState<string[]>([]);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [showRestoreDraft, setShowRestoreDraft] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<any>(null);
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const skipCustomerEvent = useRef(false);

  const outfitTypeCategory = getOutfitType(formState.outfitType);
  const currentFields = getFieldsForOutfit(outfitTypeCategory);

  // Auto-save draft (debounced 3 seconds)
  useEffect(() => {
    // Don't auto-save if form is empty
    if (!formState.name && Object.keys(formState.measurements).length === 0) return;

    const timer = setTimeout(async () => {
      try {
        const draftData = {
          data: JSON.stringify(formState),
          customer_name: formState.name || 'Draft',
          outfit_type: formState.outfitType,
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
        // Reset form but keep the typed name (don't dispatch measurement-reset to preserve CustomerSearch input)
        const nameToKeep = typedName || '';
        setFormState({
          selectedCustomerId: null,
          selectedPresetId: null,
          name: nameToKeep,
          phone: '',
          outfitType: 'Jas',
          panjangKain: String(PANJANG_KAIN_DEFAULT['Jas']),
          lebarKain: String(LEBAR_KAIN_DEFAULT['Jas']),
          cuciSebelumPotong: false,
          measurements: {},
          catatan: '',
          saveAsPreset: false,
          presetName: '',
          furing: false,
          paddingTebal: false,
          paddingTipis: false,
          kancing: false,
          totalPrice: '',
          amountPaid: '',
        });
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

        setFormState(prev => ({
          ...prev,
          selectedCustomerId: customer.id,
          selectedPresetId: preset.id ?? null,
          name: customer.name ?? '',
          phone: customer.phone ?? '',
          outfitType: preset.outfit_type ?? 'Jas',
          panjangKain: preset.panjang_kain ? String(preset.panjang_kain) : '',
          lebarKain: preset.lebar_kain ? String(preset.lebar_kain) : '',
          cuciSebelumPotong: !!preset.cuci_sebelum_potong,
          measurements: newMeasurements,
          catatan: preset.catatan ?? '',
        }));

        // Notify sketch
        window.dispatchEvent(new CustomEvent('outfit-update', { detail: preset.outfit_type }));
        Object.entries(newMeasurements).forEach(([id, value]) => {
          window.dispatchEvent(new CustomEvent('measurement-update', { detail: { id, value } }));
        });
        (window as any).__lastOutfit = preset.outfit_type;
      } else {
        // Ukuran baru - keep customer info, clear measurements
        setFormState(prev => ({
          ...prev,
          selectedCustomerId: customer.id,
          selectedPresetId: null,
          name: customer.name ?? '',
          phone: customer.phone ?? '',
          measurements: {},
        }));
      }
    };

    window.addEventListener('customer-selected', handleCustomerSelected);
    return () => window.removeEventListener('customer-selected', handleCustomerSelected);
  }, []);

  // Listen to outfit-changed event from Combobox
  useEffect(() => {
    const handleOutfitChanged = (e: Event) => {
      const outfit = (e as CustomEvent).detail;
      setFormState(prev => ({
        ...prev,
        outfitType: outfit,
        panjangKain: String(PANJANG_KAIN_DEFAULT[outfit] ?? ''),
        lebarKain: String(LEBAR_KAIN_DEFAULT[outfit] ?? ''),
      }));
      (window as any).__lastOutfit = outfit;
      window.dispatchEvent(new CustomEvent('outfit-update', { detail: outfit }));
    };

    window.addEventListener('outfit-changed', handleOutfitChanged);
    return () => window.removeEventListener('outfit-changed', handleOutfitChanged);
  }, []);

  const resetForm = () => {
    setFormState({
      selectedCustomerId: null,
      selectedPresetId: null,
      name: '',
      phone: '',
      outfitType: 'Jas',
      panjangKain: String(PANJANG_KAIN_DEFAULT['Jas']),
      lebarKain: String(LEBAR_KAIN_DEFAULT['Jas']),
      cuciSebelumPotong: false,
      measurements: {},
      catatan: '',
      saveAsPreset: false,
      presetName: '',
      furing: false,
      paddingTebal: false,
      paddingTipis: false,
      kancing: false,
      totalPrice: '',
      amountPaid: '',
    });
    setErrors([]);
    window.dispatchEvent(new CustomEvent('measurement-reset'));
  };

  const handleMeasurementChange = (fieldId: string, value: string) => {
    setFormState(prev => ({
      ...prev,
      measurements: { ...prev.measurements, [fieldId]: value },
    }));
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
    const emptyFields: string[] = [];

    currentFields.forEach(([fieldId]) => {
      if (!parseVal(formState.measurements[fieldId] || '')) {
        emptyFields.push(fieldId);
      }
    });

    if (emptyFields.length > 0) {
      setErrors(emptyFields);
      toast.error('Harap isi semua 8 field ukuran sebelum menyimpan.');
      return false;
    }

    if (!formState.name.trim()) {
      toast.error('Masukkan nama pelanggan.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setErrors([]);

    const measurements = {
      outfit_type: formState.outfitType,
      panjang_kain: parseVal(formState.panjangKain),
      lebar_kain: parseVal(formState.lebarKain),
      cuci_sebelum_potong: formState.cuciSebelumPotong,
      panjang_badan: parseVal(formState.measurements.panjangBadan || ''),
      lebar_bahu: parseVal(formState.measurements.lebarBahu || ''),
      panjang_lengan: parseVal(formState.measurements.panjangLengan || ''),
      lingkar_lengan: parseVal(formState.measurements.lingkarLengan || ''),
      lingkar_ujung_lengan: parseVal(formState.measurements.lingkarUjungLengan || ''),
      lingkar_dada: parseVal(formState.measurements.lingkarDada || ''),
      lingkar_perut: parseVal(formState.measurements.lingkarPerut || ''),
      lingkar_pinggul: parseVal(formState.measurements.lingkarPinggul || ''),
      lingkar_leher: parseVal(formState.measurements.lingkarLeher || '') || undefined,
      lebar_pundak: parseVal(formState.measurements.lebarPundak || '') || undefined,
      catatan: formState.catatan,
    };

    try {
      // 1. Resolve customer_id
      let customerId = formState.selectedCustomerId;
      let supabaseCustomerId: number | null = null;

      if (!customerId) {
        const newCustomer: Customer = {
          name: formState.name.trim(),
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
        const presetName = formState.presetName.trim() || formState.outfitType;
        const newPreset = {
          customer_id: customerId,
          preset_name: presetName,
          ...measurements,
          synced: false,
        };
        presetId = (await db.preset_customer.add(newPreset)) as number;
        const spid = await syncPreset(
          { ...newPreset, id: presetId },
          supabaseCustomerId ?? undefined
        );
        supabasePresetId = spid ?? undefined;
      }

      // 3. Save transaction
      const status = formState.cuciSebelumPotong ? 'Cuci Bahan' : 'Potong Bahan';
      const totalPrice = parseCurrencyInput(formState.totalPrice);
      const amountPaid = parseCurrencyInput(formState.amountPaid);
      
      let paymentStatus: 'belum_bayar' | 'dp' | 'lunas' = 'belum_bayar';
      if (amountPaid > 0) {
        paymentStatus = amountPaid >= totalPrice ? 'lunas' : 'dp';
      }
      
      const newTrx: Transaction = {
        customer_id: customerId,
        preset_id: presetId ?? undefined,
        ...measurements,
        status,
        total_price: totalPrice || undefined,
        amount_paid: amountPaid || 0,
        payment_status: paymentStatus,
        created_at: new Date(),
        synced: false,
      };
      const trxId = (await db.transactions.add(newTrx)) as number;
      await syncTransaction(
        { ...newTrx, id: trxId },
        supabaseCustomerId ?? undefined,
        supabasePresetId
      );

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
      
      setFormState(restored);
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
      
      // Notify sketch
      window.dispatchEvent(new CustomEvent('outfit-update', { detail: restored.outfitType }));
      Object.entries(restored.measurements).forEach(([id, value]) => {
        window.dispatchEvent(new CustomEvent('measurement-update', { detail: { id, value } }));
      });
      (window as any).__lastOutfit = restored.outfitType;
      
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
          <div className="px-8 pb-8 pt-6 space-y-6 bg-white">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-2">
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
                </div>

                <div className="space-y-2">
                  <Label>
                    Pilih Jenis Pakaian<span className="text-red-500">*</span>
                  </Label>
                  <Combobox
                    items={outfitOptions}
                    value={formState.outfitType}
                    placeholder="Pilih jenis pakaian"
                    className="h-12 border-2"
                    showClear={false}
                    eventName="outfit-changed"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4 items-end">
                  <div className="space-y-2">
                    <Label>
                      P Kain (m)<span className="text-slate-400 font-normal text-xs"> otomatis</span>
                    </Label>
                    <Input
                      value={formState.panjangKain}
                      onChange={(e) => setFormState(prev => ({ ...prev, panjangKain: e.target.value }))}
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
                      value={formState.lebarKain}
                      onChange={(e) => setFormState(prev => ({ ...prev, lebarKain: e.target.value }))}
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
                      checked={formState.cuciSebelumPotong}
                      onCheckedChange={(checked) => setFormState(prev => ({ ...prev, cuciSebelumPotong: checked === true }))}
                    />
                  </div>
                </div>
              </div>

              <hr />

              {/* Payment fields */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Total Harga (Rp)</Label>
                  <Input
                    value={formState.totalPrice}
                    onChange={(e) => {
                      const formatted = formatCurrencyInput(e.target.value);
                      setFormState(prev => ({ ...prev, totalPrice: formatted }));
                    }}
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    className="h-12 border-2"
                  />
                </div>
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
                    className="h-12 border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sisa Pembayaran (Rp)</Label>
                  <Input
                    value={formatCurrencyInput(String(Math.max(0, parseCurrencyInput(formState.totalPrice) - parseCurrencyInput(formState.amountPaid))))}
                    disabled
                    className="h-12 border-2 bg-slate-50"
                  />
                </div>
              </div>

              <hr />

              {/* Measurement fields */}
              <div className="grid px-3 grid-cols-2 gap-x-9 gap-y-6">
                {currentFields.map(([fieldId, label], i) => (
                  <div key={fieldId} className="space-y-2 relative">
                    <div className="absolute left-[-1.75rem] top-[2.75rem] -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-sm">
                      {i + 1}
                    </div>
                    <Label>{label} (cm)</Label>
                    <Input
                      value={formState.measurements[fieldId] || ''}
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

              <div className="grid grid-cols-4 gap-x-4 gap-y-6">
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
                      checked={formState[key as keyof FormState] as boolean}
                      onCheckedChange={(checked) => setFormState(prev => ({ ...prev, [key]: checked === true }))}
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
                <div className="flex-1 flex items-center gap-3">
                  <Label htmlFor="saveAsPreset" className="cursor-pointer">
                    Simpan sebagai profil ukuran?
                  </Label>
                  <Input
                    value={formState.presetName}
                    onChange={(e) => setFormState(prev => ({ ...prev, presetName: e.target.value }))}
                    placeholder="Nama profil (cth: Jas Nikahan)"
                    className="h-9 border-2 flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>
                  Catatan<span className="text-slate-400 font-normal text-xs"> (opsional)</span>
                </Label>
                <textarea
                  value={formState.catatan}
                  onChange={(e) => setFormState(prev => ({ ...prev, catatan: e.target.value }))}
                  placeholder="Tambahkan catatan khusus..."
                  className="w-full min-h-[80px] rounded-md border-2 border-input bg-background px-3 py-2 text-base resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

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

      <SuccessDialog />
    </div>
  );
}
