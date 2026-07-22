import { useState, useEffect, useMemo } from 'react';
import { db, MATERIAL_UNITS } from '@/lib/db';
import type { Material, MaterialUnit } from '@/lib/db';
import { trx } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/currency';
import { SortPanel } from '@/components/SortPanel';
import type { SortEntry } from '@/components/SortPanel';

// ─── Sort ─────────────────────────────────────────────────────────────────────
type SortKey = 'name' | 'unit' | 'current_stock' | 'avg_cost_per_unit' | 'low_stock_threshold';
type SortDir = 'asc' | 'desc';

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name',                label: 'Nama Bahan' },
  { key: 'unit',                label: 'Satuan' },
  { key: 'current_stock',       label: 'Stok' },
  { key: 'avg_cost_per_unit',   label: 'Rata-rata Harga' },
  { key: 'low_stock_threshold', label: 'Batas Minimum' },
];

const DEFAULT_SORT: SortEntry<SortKey>[] = [{ key: 'name', dir: 'asc' }];

function SortIcon({ col, stack }: { col: SortKey; stack: SortEntry<SortKey>[] }) {
  const idx   = stack.findIndex(s => s.key === col);
  const entry = stack[idx];
  const active = idx !== -1;
  return (
    <span className="inline-flex items-center ml-1 gap-0.5 align-middle">
      <span className="inline-flex flex-col gap-px">
        <svg width="8" height="5" viewBox="0 0 8 5" className={active && entry.dir === 'asc' ? 'text-indigo-600' : 'text-slate-300'} fill="currentColor"><path d="M4 0L8 5H0z"/></svg>
        <svg width="8" height="5" viewBox="0 0 8 5" className={active && entry.dir === 'desc' ? 'text-indigo-600' : 'text-slate-300'} fill="currentColor"><path d="M4 5L0 0H8z"/></svg>
      </span>
      {active && stack.length > 1 && (
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold leading-none">
          {idx + 1}
        </span>
      )}
    </span>
  );
}

const PAGE_SIZES = [10, 25, 50];

const EMPTY_FORM = {
  name: '',
  unit: 'pcs' as MaterialUnit,
  current_stock: '',
  avg_cost_per_unit: '',
  low_stock_threshold: '1',
};

export default function MaterialList() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Material | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortStack, setSortStack] = useState<SortEntry<SortKey>[]>(DEFAULT_SORT);

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

  useEffect(() => {
    loadMaterials();
  }, []);

  async function loadMaterials() {
    setLoading(true);
    try {
      // Prefer Supabase when online; fall back to Dexie
      if (navigator.onLine) {
        const { data, error } = await trx.from('material').select('*').order('name');
        if (!error && data) {
          setMaterials(data as Material[]);
          setLoading(false);
          return;
        }
      }
      const local = await db.material.orderBy('name').toArray();
      setMaterials(local);
    } catch (err) {
      console.error('loadMaterials error:', err);
      toast.error('Gagal memuat data bahan.');
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(m: Material) {
    setEditTarget(m);
    setForm({
      name: m.name,
      unit: m.unit,
      current_stock: String(m.current_stock),
      avg_cost_per_unit: String(m.avg_cost_per_unit),
      low_stock_threshold: String(m.low_stock_threshold),
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Nama bahan tidak boleh kosong.');
      return;
    }
    setSaving(true);
    try {
      const payload: Omit<Material, 'id'> = {
        name: form.name.trim(),
        unit: form.unit,
        current_stock: parseFloat(form.current_stock) || 0,
        avg_cost_per_unit: parseFloat(form.avg_cost_per_unit) || 0,
        low_stock_threshold: parseFloat(form.low_stock_threshold) || 1,
        synced: false,
      };

      if (editTarget) {
        // Update
        await db.material.update(editTarget.id!, payload);
        if (navigator.onLine) {
          const { id: _id, synced: _s, ...supabasePayload } = payload as any;
          await trx.from('material').update(supabasePayload).eq('id', editTarget.id!);
          await db.material.update(editTarget.id!, { synced: true });
        }
        toast.success('Bahan berhasil diperbarui.');
      } else {
        // Insert
        const newId = await db.material.add(payload);
        if (navigator.onLine) {
          const { synced: _s, ...supabasePayload } = payload;
          const { data: inserted, error } = await trx
            .from('material')
            .insert(supabasePayload)
            .select('id')
            .single();
          if (!error && inserted) {
            await db.material.update(newId, { synced: true });
          }
        }
        toast.success('Bahan berhasil ditambahkan.');
      }
      setShowModal(false);
      loadMaterials();
    } catch (err) {
      console.error('handleSave error:', err);
      toast.error('Gagal menyimpan bahan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await db.material.delete(deleteTarget.id!);
      if (navigator.onLine) {
        await trx.from('material').delete().eq('id', deleteTarget.id!);
      }
      toast.success('Bahan dihapus.');
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      loadMaterials();
    } catch (err) {
      console.error('handleDelete error:', err);
      toast.error('Gagal menghapus bahan.');
    }
  }

  const lowStockCount = materials.filter(m => m.current_stock <= m.low_stock_threshold).length;

  const processed = useMemo(() => {
    let data = materials;
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.unit.toLowerCase().includes(q)
      );
    }
    if (sortStack.length > 0) {
      data = [...data].sort((a, b) => {
        for (const { key, dir } of sortStack) {
          let cmp = 0;
          if (key === 'name') cmp = a.name.localeCompare(b.name);
          else if (key === 'unit') cmp = a.unit.localeCompare(b.unit);
          else if (key === 'current_stock') cmp = a.current_stock - b.current_stock;
          else if (key === 'avg_cost_per_unit') cmp = a.avg_cost_per_unit - b.avg_cost_per_unit;
          else if (key === 'low_stock_threshold') cmp = a.low_stock_threshold - b.low_stock_threshold;
          if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
        }
        return 0;
      });
    }
    return data;
  }, [materials, search, sortStack]);

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const paginated  = processed.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Bahan & Stok</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {materials.length} jenis bahan tercatat
            {lowStockCount > 0 && (
              <span className="ml-2 text-red-500 font-medium">
                · {lowStockCount} stok menipis
              </span>
            )}
          </p>
        </div>
        <Button onClick={openAdd} className="bg-indigo-600 hover:bg-indigo-700 self-start sm:self-auto">
          + Tambah Bahan
        </Button>
      </div>

      {/* Alert stok rendah */}
      {!loading && lowStockCount > 0 && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <svg className="shrink-0 mt-0.5 text-red-500" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-700">Stok menipis</p>
            <p className="text-sm text-red-600">
              {materials.filter(m => m.current_stock <= m.low_stock_threshold).map(m => m.name).join(', ')} perlu segera diisi ulang.
            </p>
          </div>
        </div>
      )}

      {/* Table card */}
      <Card>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b bg-slate-50/50">
          <div className="flex items-center gap-2 w-full max-w-sm">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <Input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Cari nama bahan atau satuan..."
                className="pl-8 h-9 text-sm"
              />
            </div>
            <SortPanel stack={sortStack} onChange={setSortStack} columns={SORT_COLUMNS} defaultStack={DEFAULT_SORT} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-500 hidden sm:block">Tampilkan</span>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-9 w-20 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-slate-500 hidden sm:block">baris</span>
          </div>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="px-4">Nama Bahan</TableHead>
                    <TableHead className="px-4">Satuan</TableHead>
                    <TableHead className="px-4 text-right">Stok</TableHead>
                    <TableHead className="px-4 text-right">Rata-rata Harga</TableHead>
                    <TableHead className="px-4 text-right">Batas Minimum</TableHead>
                    <TableHead className="px-4 text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-slate-400">
                        {search ? 'Tidak ada bahan yang cocok.' : 'Belum ada bahan. Tambah bahan baru untuk memulai.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map(m => {
                      const isLow = m.current_stock <= m.low_stock_threshold;
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="px-4 font-medium text-slate-900">{m.name}</TableCell>
                          <TableCell className="px-4 text-slate-500 capitalize">{m.unit}</TableCell>
                          <TableCell className="px-4 text-right">
                            <span className={`inline-flex items-center gap-1.5 font-semibold ${isLow ? 'text-red-600' : 'text-slate-800'}`}>
                              {isLow && (
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                              )}
                              {m.current_stock} {m.unit}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 text-right text-slate-700">{formatCurrency(m.avg_cost_per_unit)}</TableCell>
                          <TableCell className="px-4 text-right text-slate-500">{m.low_stock_threshold} {m.unit}</TableCell>
                          <TableCell className="px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => openEdit(m)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                                Edit
                              </button>
                              <span className="text-slate-200">|</span>
                              <button onClick={() => { setDeleteTarget(m); setShowDeleteDialog(true); }} className="text-xs text-red-500 hover:text-red-700 font-medium">
                                Hapus
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              {/* Pagination footer */}
              <div className="flex items-center justify-between px-6 py-3 border-t bg-slate-50/50">
                <p className="text-xs text-slate-400">
                  {processed.length === 0
                    ? 'Tidak ada data'
                    : `Menampilkan ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, processed.length)} dari ${processed.length} bahan`}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={safePage <= 1} className="h-8 w-8 p-0">«</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} className="h-8 w-8 p-0">‹</Button>
                  <span className="text-xs text-slate-500 px-2">{safePage} / {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="h-8 w-8 p-0">›</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} className="h-8 w-8 p-0">»</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Bahan' : 'Tambah Bahan Baru'}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? 'Perbarui data bahan. Rata-rata harga akan diperbarui otomatis saat ada pembelian baru.'
                : 'Isi data bahan awal. Stok akan bertambah otomatis saat mencatat pembelian.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nama Bahan</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Contoh: Benang Hitam"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label>Satuan</Label>
              <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v as MaterialUnit }))}>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stok Awal</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  value={form.current_stock}
                  onChange={e => setForm(f => ({ ...f, current_stock: e.target.value }))}
                  placeholder="0"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Batas Minimum Stok</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  value={form.low_stock_threshold}
                  onChange={e => setForm(f => ({ ...f, low_stock_threshold: e.target.value }))}
                  placeholder="1"
                  className="h-11"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Rata-rata Harga Awal (Rp per satuan)</Label>
              <Input
                type="number"
                min="0"
                value={form.avg_cost_per_unit}
                onChange={e => setForm(f => ({ ...f, avg_cost_per_unit: e.target.value }))}
                placeholder="0"
                className="h-11"
              />
              <p className="text-xs text-slate-400">Akan diperbarui otomatis menggunakan rata-rata tertimbang setiap pembelian.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? 'Menyimpan...' : editTarget ? 'Simpan Perubahan' : 'Tambah Bahan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Bahan?</DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.name}</strong> akan dihapus dari daftar bahan. Data penggunaan bahan pada order yang sudah ada tidak akan terhapus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Batal</Button>
            <Button onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
