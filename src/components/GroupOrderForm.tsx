import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { db, syncOrderGroup, generateUUID } from '@/lib/db';
import type { OrderGroup } from '@/lib/db';
import { toast } from 'sonner';

const outfitOptions = [
  'Jas',
  'Kemeja Batik Lengan Pendek',
  'Kemeja Batik Lengan Panjang',
  'Kemeja Polos Lengan Pendek',
  'Kemeja Polos Lengan Panjang',
  'Celana',
];

interface FormState {
  name: string;
  commissioner: string;
  commissionerPhone: string;
  notes: string;
  defaultOutfitType: string;
}

export default function GroupOrderForm() {
  const [formState, setFormState] = useState<FormState>({
    name: '',
    commissioner: '',
    commissionerPhone: '',
    notes: '',
    defaultOutfitType: 'Jas',
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formState.name.trim()) {
      toast.error('Masukkan nama proyek/grup.');
      return;
    }

    if (!formState.commissioner.trim()) {
      toast.error('Masukkan nama pemesan (perusahaan/penanggung jawab).');
      return;
    }

    setIsSaving(true);

    try {
      const uuid = generateUUID();
      const newGroup: OrderGroup = {
        uuid,
        name: formState.name.trim(),
        commissioner: formState.commissioner.trim(),
        commissioner_phone: formState.commissionerPhone.trim() || undefined,
        notes: formState.notes.trim() || undefined,
        default_outfit_type: formState.defaultOutfitType,
        total_price: 0,
        amount_paid: 0,
        payment_status: 'belum_bayar',
        created_at: new Date(),
        synced: false,
      };

      const groupId = await db.order_group.add(newGroup);
      const syncResult = await syncOrderGroup({ ...newGroup, id: groupId as number });

      if (!syncResult.success && syncResult.error) {
        // Show sync error but still allow local usage
        toast.error(`Peringatan: ${syncResult.error}. Data tersimpan lokal.`);
      } else {
        toast.success('Grup pesanan berhasil dibuat!');
      }
      
      // Redirect to group detail page
      window.location.href = `/group-order?id=${groupId}`;
    } catch (err: any) {
      console.error('Failed to create group order:', err);
      const errorMsg = err?.message || 'Gagal membuat grup pesanan.';
      toast.error(errorMsg);
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <a href="/dashboard" className="text-slate-500 hover:text-slate-900 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </a>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Pesanan Grup Baru</h1>
      </div>

      <Card className="border-2 shadow-xl">
        <CardHeader className="border-b bg-slate-50">
          <CardTitle>Informasi Proyek</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>
                Nama Proyek / Grup<span className="text-red-500">*</span>
              </Label>
              <Input
                value={formState.name}
                onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
                placeholder="cth: Seragam PT. ABC, Wedding Budi & Sari"
                className="h-12 text-base border-2"
              />
              <p className="text-xs text-slate-500">
                Nama ini akan muncul di dashboard sebagai identitas pesanan grup.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Nama Pemesan<span className="text-red-500">*</span>
                </Label>
                <Input
                  value={formState.commissioner}
                  onChange={(e) => setFormState(prev => ({ ...prev, commissioner: e.target.value }))}
                  placeholder="cth: PT. ABC, Pak Budi"
                  className="h-12 text-base border-2"
                />
              </div>
              <div className="space-y-2">
                <Label>No. HP / WA Pemesan</Label>
                <Input
                  value={formState.commissionerPhone}
                  onChange={(e) => setFormState(prev => ({ ...prev, commissionerPhone: e.target.value }))}
                  placeholder="08xx"
                  className="h-12 text-base border-2"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Jenis Pakaian Default</Label>
              <Combobox
                items={outfitOptions}
                value={formState.defaultOutfitType}
                placeholder="Pilih jenis pakaian"
                className="h-12 border-2"
                showClear={false}
                onChange={(value) => setFormState(prev => ({ ...prev, defaultOutfitType: value }))}
              />
              <p className="text-xs text-slate-500">
                Jenis pakaian ini akan otomatis dipilih saat menambah anggota. Bisa diganti per anggota.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Catatan</Label>
              <textarea
                value={formState.notes}
                onChange={(e) => setFormState(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Catatan tambahan untuk proyek ini..."
                className="w-full min-h-[100px] rounded-md border-2 border-input bg-background px-3 py-2 text-base resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.href = '/dashboard'}
                className="h-12 px-6"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="h-12 px-8 text-base font-bold bg-indigo-600 hover:bg-indigo-700"
              >
                {isSaving ? 'Menyimpan...' : 'Buat Grup'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
