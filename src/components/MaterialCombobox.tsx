import { useState, useRef } from 'react';
import { db } from '@/lib/db';
import type { Material, MaterialUnit } from '@/lib/db';
import { MATERIAL_UNITS } from '@/lib/db';
import { trx } from '@/lib/supabase';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface MaterialComboboxProps {
  materials: Material[];
  value: number | null;
  onValueChange: (id: number) => void;
  onMaterialCreated: (material: Material) => void;
}

export default function MaterialCombobox({ materials, value, onValueChange, onMaterialCreated }: MaterialComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createUnit, setCreateUnit] = useState<MaterialUnit>('meter');
  const [createSpecialOrder, setCreateSpecialOrder] = useState(false);
  const [creating, setCreating] = useState(false);

  const selectedMaterial = materials.find(m => m.id === value);

  const filtered = query.trim()
    ? materials.filter(m => m.name.toLowerCase().includes(query.toLowerCase()))
    : materials;

  const exactMatch = materials.some(m => m.name.toLowerCase() === query.toLowerCase().trim());

  function handleSelect(id: number) {
    onValueChange(id);
    setOpen(false);
    setQuery('');
  }

  function handleCreateClick() {
    setCreateName(query.trim());
    setCreateUnit('meter');
    setCreateSpecialOrder(false);
    setShowCreate(true);
    setOpen(false);
  }

  async function handleCreate() {
    if (!createName.trim()) { toast.error('Nama bahan tidak boleh kosong.'); return; }
    setCreating(true);
    try {
      const payload: Omit<Material, 'id'> = {
        name: createName.trim(),
        unit: createUnit,
        current_stock: 0,
        avg_cost_per_unit: 0,
        low_stock_threshold: createSpecialOrder ? 0 : 1,
        is_special_order: createSpecialOrder,
        synced: false,
      };

      const localId = await db.material.add(payload);

      if (navigator.onLine) {
        const { synced: _s, ...sp } = payload;
        const { data: ins } = await trx.from('material').insert(sp).select('id').single();
        if (ins) await db.material.update(localId, { synced: true });
      }

      const newMaterial: Material = { ...payload, id: localId };
      onMaterialCreated(newMaterial);
      onValueChange(localId);
      setShowCreate(false);
      setQuery('');
      toast.success(`Bahan "${createName.trim()}" berhasil dibuat.`);
    } catch (err) {
      console.error('MaterialCombobox create error:', err);
      toast.error('Gagal membuat bahan baru.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center justify-between w-full h-11 px-3 rounded-md border border-input bg-white text-sm text-left shadow-xs hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
          >
            {selectedMaterial ? (
              <span className="truncate">
                {selectedMaterial.name}
                <span className="ml-1.5 text-slate-400 text-xs">({selectedMaterial.unit})</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Pilih bahan...</span>
            )}
            <svg className="ml-2 shrink-0 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>
            </svg>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Cari atau buat bahan..."
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {filtered.length === 0 && !query.trim() && (
                <CommandEmpty>Belum ada bahan.</CommandEmpty>
              )}
              {filtered.length === 0 && query.trim() && !exactMatch && (
                <CommandGroup>
                  <CommandItem onSelect={handleCreateClick} className="text-indigo-600 font-medium">
                    <svg className="shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Buat bahan &quot;{query.trim()}&quot;
                  </CommandItem>
                </CommandGroup>
              )}
              {filtered.length > 0 && (
                <CommandGroup>
                  {filtered.map(m => (
                    <CommandItem
                      key={m.id}
                      value={String(m.id)}
                      onSelect={() => handleSelect(m.id!)}
                      data-checked={value === m.id ? 'true' : undefined}
                    >
                      <span>{m.name}</span>
                      {m.is_special_order && (
                        <span className="ml-1 text-[10px] font-semibold px-1 py-0.5 rounded bg-amber-100 text-amber-700">Khusus</span>
                      )}
                      <span className="ml-auto text-xs text-slate-400">
                        {m.current_stock} {m.unit}
                      </span>
                    </CommandItem>
                  ))}
                  {query.trim() && !exactMatch && (
                    <CommandItem onSelect={handleCreateClick} className="text-indigo-600 font-medium border-t mt-1 pt-2">
                      <svg className="shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14M5 12h14"/>
                      </svg>
                      Buat bahan &quot;{query.trim()}&quot;
                    </CommandItem>
                  )}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Create material dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Buat Bahan Baru</DialogTitle>
            <DialogDescription>
              Bahan baru akan tersedia langsung di daftar. Stok akan bertambah otomatis setelah pembelian dicatat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nama Bahan</Label>
              <Input
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                placeholder="Contoh: Kain Batik Jepara"
                className="h-11"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Satuan</Label>
              <Select value={createUnit} onValueChange={v => setCreateUnit(v as MaterialUnit)}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_UNITS.map(u => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer select-none hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                checked={createSpecialOrder}
                onChange={e => setCreateSpecialOrder(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-700">Bahan Khusus Order</p>
                <p className="text-xs text-slate-400">Dibeli khusus untuk 1 pesanan, tidak disimpan di stok.</p>
              </div>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Batal</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-indigo-600 hover:bg-indigo-700">
              {creating ? 'Membuat...' : 'Buat Bahan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
