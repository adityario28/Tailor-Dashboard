import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import MeasurementSketch from '@/components/measurementSketch';
import { db, syncGroupMember, generateUUID } from '@/lib/db';
import type { GroupMember, OrderStatus } from '@/lib/db';
import { toast } from 'sonner';
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
  name: string;
  role: string;
  outfitType: string;
  panjangKain: string;
  lebarKain: string;
  cuciSebelumPotong: boolean;
  measurements: Record<string, string>;
  catatan: string;
  totalPrice: string;
  sewingFee: string;
  usePreviousPrice: boolean;
}

interface GroupMemberFormProps {
  groupId: number;
  groupUuid: string;
  defaultOutfitType: string;
  existingMember?: GroupMember | null;
  lastMemberPrice?: number;
  lastMemberSewingFee?: number;
  onSaved: () => void;
  onCancel: () => void;
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

// Convert camelCase to snake_case
function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

export default function GroupMemberForm({
  groupId,
  groupUuid,
  defaultOutfitType,
  existingMember,
  lastMemberPrice,
  lastMemberSewingFee,
  onSaved,
  onCancel,
}: GroupMemberFormProps) {
  const isEditing = !!existingMember;

  const [formState, setFormState] = useState<FormState>(() => {
    if (existingMember) {
      // Load existing member data
      const measurements: Record<string, string> = {};
      const allFields = [...JAS_FIELDS, ...KEMEJA_PANJANG_FIELDS, ...KEMEJA_PENDEK_FIELDS];
      allFields.forEach(([fieldId]) => {
        const dbKey = toSnakeCase(fieldId) as keyof GroupMember;
        const val = existingMember[dbKey];
        if (val != null) measurements[fieldId] = String(val);
      });

      return {
        name: existingMember.name,
        role: existingMember.role || '',
        outfitType: existingMember.outfit_type || defaultOutfitType,
        panjangKain: existingMember.panjang_kain ? String(existingMember.panjang_kain) : '',
        lebarKain: existingMember.lebar_kain ? String(existingMember.lebar_kain) : '',
        cuciSebelumPotong: existingMember.cuci_sebelum_potong || false,
        measurements,
        catatan: existingMember.catatan || '',
        totalPrice: existingMember.total_price ? formatCurrencyInput(String(existingMember.total_price)) : '',
        sewingFee: existingMember.sewing_fee ? formatCurrencyInput(String(existingMember.sewing_fee)) : '',
        usePreviousPrice: false,
      };
    }

    return {
      name: '',
      role: '',
      outfitType: defaultOutfitType,
      panjangKain: String(PANJANG_KAIN_DEFAULT[defaultOutfitType] ?? ''),
      lebarKain: String(LEBAR_KAIN_DEFAULT[defaultOutfitType] ?? ''),
      cuciSebelumPotong: false,
      measurements: {},
      catatan: '',
      totalPrice: lastMemberPrice ? formatCurrencyInput(String(lastMemberPrice)) : '',
      sewingFee: lastMemberSewingFee ? formatCurrencyInput(String(lastMemberSewingFee)) : '',
      usePreviousPrice: !!lastMemberPrice,
    };
  });

  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const outfitTypeCategory = getOutfitType(formState.outfitType);
  const currentFields = getFieldsForOutfit(outfitTypeCategory);

  // Notify sketch on mount and outfit change
  useEffect(() => {
    (window as any).__lastOutfit = formState.outfitType;
    window.dispatchEvent(new CustomEvent('outfit-update', { detail: formState.outfitType }));

    // Send existing measurements to sketch
    Object.entries(formState.measurements).forEach(([id, value]) => {
      window.dispatchEvent(new CustomEvent('measurement-update', { detail: { id, value } }));
    });
  }, []);

  const handleOutfitChange = (outfit: string) => {
    setFormState(prev => ({
      ...prev,
      outfitType: outfit,
      panjangKain: String(PANJANG_KAIN_DEFAULT[outfit] ?? ''),
      lebarKain: String(LEBAR_KAIN_DEFAULT[outfit] ?? ''),
    }));
    (window as any).__lastOutfit = outfit;
    window.dispatchEvent(new CustomEvent('outfit-update', { detail: outfit }));
  };

  const handleMeasurementChange = (fieldId: string, value: string) => {
    setFormState(prev => ({
      ...prev,
      measurements: { ...prev.measurements, [fieldId]: value },
    }));
    window.dispatchEvent(new CustomEvent('measurement-update', { detail: { id: fieldId, value } }));
    setErrors(prev => prev.filter(e => e !== fieldId));
  };

  const handleMeasurementFocus = (fieldId: string) => {
    window.dispatchEvent(new CustomEvent('measurement-focus', { detail: fieldId }));
  };

  const handleMeasurementBlur = () => {
    window.dispatchEvent(new CustomEvent('measurement-focus', { detail: null }));
  };

  const handleUsePreviousPriceChange = (checked: boolean) => {
    setFormState(prev => ({
      ...prev,
      usePreviousPrice: checked,
      totalPrice: checked && lastMemberPrice ? formatCurrencyInput(String(lastMemberPrice)) : prev.totalPrice,
      sewingFee: checked && lastMemberSewingFee ? formatCurrencyInput(String(lastMemberSewingFee)) : prev.sewingFee,
    }));
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
      toast.error('Harap isi semua 8 field ukuran.');
      return false;
    }

    if (!formState.name.trim()) {
      toast.error('Masukkan nama anggota.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSaving(true);

    try {
      const status: OrderStatus = formState.cuciSebelumPotong ? 'Cuci Bahan' : 'Potong Bahan';
      const totalPrice = parseCurrencyInput(formState.totalPrice);
      const sewingFee = parseCurrencyInput(formState.sewingFee) || totalPrice;

      const memberData: Omit<GroupMember, 'id'> = {
        uuid: existingMember?.uuid || generateUUID(),
        group_id: groupId,
        group_uuid: groupUuid,
        name: formState.name.trim(),
        role: formState.role.trim() || undefined,
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
        catatan: formState.catatan.trim() || undefined,
        status: existingMember?.status || status,
        worker_id: existingMember?.worker_id,
        total_price: totalPrice || undefined,
        sewing_fee: sewingFee || undefined,
        created_at: existingMember?.created_at || new Date(),
        synced: false,
      };

      if (existingMember?.id) {
        // Update existing member
        await db.group_member.update(existingMember.id, memberData);
        const syncResult = await syncGroupMember({ ...memberData, id: existingMember.id });
        if (!syncResult.success && syncResult.error) {
          toast.error(`Peringatan: ${syncResult.error}. Data tersimpan lokal.`);
        } else {
          toast.success('Data anggota diperbarui.');
        }
      } else {
        // Add new member
        const memberId = await db.group_member.add(memberData);
        const syncResult = await syncGroupMember({ ...memberData, id: memberId as number });
        if (!syncResult.success && syncResult.error) {
          toast.error(`Peringatan: ${syncResult.error}. Data tersimpan lokal.`);
        } else {
          toast.success('Anggota berhasil ditambahkan.');
        }
      }

      onSaved();
    } catch (err: any) {
      console.error('Failed to save member:', err);
      const errorMsg = err?.message || 'Gagal menyimpan data anggota.';
      toast.error(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name & Role */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>
            Nama Anggota<span className="text-red-500">*</span>
          </Label>
          <Input
            value={formState.name}
            onChange={e => setFormState(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Nama orang"
            className="h-12 text-base border-2"
            disabled={isEditing}
          />
        </div>
        <div className="space-y-2">
          <Label>Role / Jabatan</Label>
          <Input
            value={formState.role}
            onChange={e => setFormState(prev => ({ ...prev, role: e.target.value }))}
            placeholder="cth: Head Chef, Manager"
            className="h-12 text-base border-2"
          />
        </div>
      </div>

      {/* Outfit Type */}
      <div className="space-y-2">
        <Label>Jenis Pakaian</Label>
        <Combobox
          items={outfitOptions}
          value={formState.outfitType}
          placeholder="Pilih jenis pakaian"
          className="h-12 border-2"
          showClear={false}
          onChange={handleOutfitChange}
        />
      </div>

      {/* Cloth dimensions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div className="space-y-2">
          <Label>P Kain (m)</Label>
          <Input
            value={formState.panjangKain}
            onChange={e => setFormState(prev => ({ ...prev, panjangKain: e.target.value }))}
            type="text"
            inputMode="decimal"
            placeholder="0,0"
            className="h-12 border-2"
          />
        </div>
        <div className="space-y-2">
          <Label>L Kain (m)</Label>
          <Input
            value={formState.lebarKain}
            onChange={e => setFormState(prev => ({ ...prev, lebarKain: e.target.value }))}
            type="text"
            inputMode="decimal"
            placeholder="0,0"
            className="h-12 border-2"
          />
        </div>
        <div className="flex flex-col items-center gap-2 pb-2">
          <Label className="text-xs text-center">Perlu Dicuci?</Label>
          <Checkbox
            checked={formState.cuciSebelumPotong}
            onCheckedChange={checked => setFormState(prev => ({ ...prev, cuciSebelumPotong: checked === true }))}
          />
        </div>
      </div>

      <hr />

      {/* Pricing */}
      <div className="space-y-4">
        {lastMemberPrice && !isEditing && (
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={formState.usePreviousPrice}
              onCheckedChange={checked => handleUsePreviousPriceChange(checked === true)}
            />
            <span className="text-sm text-slate-600">Sama dengan anggota sebelumnya</span>
          </label>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Total Harga (Rp)</Label>
            <Input
              value={formState.totalPrice}
              onChange={e => {
                const formatted = formatCurrencyInput(e.target.value);
                setFormState(prev => ({
                  ...prev,
                  totalPrice: formatted,
                  sewingFee: prev.sewingFee || formatted,
                  usePreviousPrice: false,
                }));
              }}
              type="text"
              inputMode="numeric"
              placeholder="0"
              className="h-12 border-2"
            />
          </div>
          <div className="space-y-2">
            <Label>
              Biaya Jahit (Rp)
              <span className="text-slate-400 font-normal text-xs ml-1">basis komisi</span>
            </Label>
            <Input
              value={formState.sewingFee}
              onChange={e => {
                const formatted = formatCurrencyInput(e.target.value);
                setFormState(prev => ({ ...prev, sewingFee: formatted, usePreviousPrice: false }));
              }}
              type="text"
              inputMode="numeric"
              placeholder="Sama dengan total harga"
              className="h-12 border-2"
            />
          </div>
        </div>
      </div>

      <hr />

      {/* Measurements + Sketch side by side on larger screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Measurement fields */}
        <div className="space-y-4">
          <Label className="text-base font-semibold">Ukuran (cm)</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
            {currentFields.map(([fieldId, label], i) => (
              <div key={fieldId} className="space-y-2 relative pl-8">
                <div className="absolute left-0 top-[2.25rem] -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-sm">
                  {i + 1}
                </div>
                <Label className="text-sm">{label}</Label>
                <Input
                  value={formState.measurements[fieldId] || ''}
                  onChange={e => handleMeasurementChange(fieldId, e.target.value)}
                  onFocus={() => handleMeasurementFocus(fieldId)}
                  onBlur={handleMeasurementBlur}
                  type="text"
                  inputMode="decimal"
                  placeholder="0,0"
                  className={`h-11 border-2 ${errors.includes(fieldId) ? 'border-red-500 ring-2 ring-red-200' : ''}`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Sketch */}
        <div className="bg-slate-50 rounded-lg p-4 flex flex-col items-center justify-center min-h-[400px]">
          <p className="text-sm text-slate-500 mb-2">Pratinjau Sketsa</p>
          <div className="w-full h-full" style={{ minHeight: '350px' }}>
            <MeasurementSketch />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>Catatan</Label>
        <textarea
          value={formState.catatan}
          onChange={e => setFormState(prev => ({ ...prev, catatan: e.target.value }))}
          placeholder="Catatan khusus untuk anggota ini..."
          className="w-full min-h-[80px] rounded-md border-2 border-input bg-background px-3 py-2 text-base resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} className="h-12 px-6">
          Batal
        </Button>
        <Button type="submit" disabled={isSaving} className="h-12 px-8 bg-indigo-600 hover:bg-indigo-700">
          {isSaving ? 'Menyimpan...' : isEditing ? 'Simpan Perubahan' : 'Tambah Anggota'}
        </Button>
      </div>
    </form>
  );
}
