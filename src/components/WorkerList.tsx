import { useState, useEffect, useMemo } from 'react';
import { db, loadWorkerWorkload } from '@/lib/db';
import type { Worker } from '@/lib/db';
import { trx } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function WorkerList() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workload, setWorkload] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Worker | null>(null);
  const [formName, setFormName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showToggleDialog, setShowToggleDialog] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<Worker | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      if (navigator.onLine) {
        const { data: wData } = await trx.from('worker').select('*').order('name');
        if (wData) setWorkers(wData as Worker[]);
      } else {
        setWorkers(await db.worker.orderBy('name').toArray());
      }
      setWorkload(await loadWorkerWorkload());
    } catch (err) {
      console.error('WorkerList loadData error:', err);
      toast.error('Gagal memuat data penjahit.');
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditTarget(null);
    setFormName('');
    setShowModal(true);
  }

  function openEdit(w: Worker) {
    setEditTarget(w);
    setFormName(w.name);
    setShowModal(true);
  }

  async function handleSave() {
    if (!formName.trim()) { toast.error('Nama tidak boleh kosong.'); return; }
    setSaving(true);
    try {
      if (editTarget) {
        await db.worker.update(editTarget.id!, { name: formName.trim(), synced: false });
        if (navigator.onLine) {
          await trx.from('worker').update({ name: formName.trim() }).eq('id', editTarget.id!);
          await db.worker.update(editTarget.id!, { synced: true });
        }
        toast.success('Nama penjahit diperbarui.');
      } else {
        const payload: Omit<Worker, 'id'> = { name: formName.trim(), active: true, synced: false };
        const localId = await db.worker.add(payload);
        if (navigator.onLine) {
          const { synced: _s, ...sp } = payload;
          const { data: ins } = await trx.from('worker').insert(sp).select('id').single();
          if (ins) await db.worker.update(localId, { synced: true });
        }
        toast.success('Penjahit berhasil ditambahkan.');
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      console.error('handleSave error:', err);
      toast.error('Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!toggleTarget) return;
    const newActive = !toggleTarget.active;
    try {
      await db.worker.update(toggleTarget.id!, { active: newActive, synced: false });
      if (navigator.onLine) {
        await trx.from('worker').update({ active: newActive }).eq('id', toggleTarget.id!);
        await db.worker.update(toggleTarget.id!, { synced: true });
      }
      toast.success(newActive ? `${toggleTarget.name} diaktifkan kembali.` : `${toggleTarget.name} dinonaktifkan.`);
      setShowToggleDialog(false);
      setToggleTarget(null);
      loadData();
    } catch (err) {
      console.error('handleToggleActive error:', err);
      toast.error('Gagal mengubah status penjahit.');
    }
  }

  const processed = useMemo(() => {
    if (!search.trim()) return workers;
    const q = search.toLowerCase();
    return workers.filter(w => w.name.toLowerCase().includes(q));
  }, [workers, search]);

  const activeCount = workers.filter(w => w.active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Penjahit</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeCount} penjahit aktif · {workers.length} total
          </p>
        </div>
        <Button onClick={openAdd} className="bg-indigo-600 hover:bg-indigo-700 self-start sm:self-auto">
          + Tambah Penjahit
        </Button>
      </div>

      {/* Table card */}
      <Card>
        {/* Toolbar */}
        <div className="flex items-center px-6 py-3 border-b bg-slate-50/50">
          <div className="relative w-full max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama penjahit..."
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="px-4">Nama Penjahit</TableHead>
                  <TableHead className="px-4 text-center">Order Aktif (Jahit)</TableHead>
                  <TableHead className="px-4 text-center">Status</TableHead>
                  <TableHead className="px-4 text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-12 text-center text-slate-400">
                      {search ? 'Tidak ada penjahit yang cocok.' : 'Belum ada penjahit. Tambah penjahit untuk memulai.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  processed.map(w => {
                    const count = workload.get(w.id!) ?? 0;
                    return (
                      <TableRow key={w.id} className={!w.active ? 'opacity-50' : ''}>
                        <TableCell className="px-4 font-medium text-slate-900">{w.name}</TableCell>
                        <TableCell className="px-4 text-center">
                          <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            count === 0 ? 'bg-green-100 text-green-700'
                            : count <= 2 ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                          }`}>
                            {count} order
                          </span>
                        </TableCell>
                        <TableCell className="px-4 text-center">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                            w.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${w.active ? 'bg-green-500' : 'bg-slate-400'}`} />
                            {w.active ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openEdit(w)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                              Edit
                            </button>
                            <span className="text-slate-200">|</span>
                            <button
                              onClick={() => { setToggleTarget(w); setShowToggleDialog(true); }}
                              className={`text-xs font-medium ${w.active ? 'text-amber-500 hover:text-amber-700' : 'text-green-600 hover:text-green-800'}`}
                            >
                              {w.active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Nama Penjahit' : 'Tambah Penjahit Baru'}</DialogTitle>
            <DialogDescription>
              {editTarget ? 'Perbarui nama penjahit.' : 'Masukkan nama penjahit yang akan ditambahkan.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Label>Nama Penjahit</Label>
            <Input
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="Contoh: Pak Budi"
              className="h-11"
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? 'Menyimpan...' : editTarget ? 'Simpan' : 'Tambah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toggle active dialog */}
      <Dialog open={showToggleDialog} onOpenChange={setShowToggleDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{toggleTarget?.active ? 'Nonaktifkan Penjahit?' : 'Aktifkan Penjahit?'}</DialogTitle>
            <DialogDescription>
              {toggleTarget?.active
                ? `${toggleTarget?.name} tidak akan muncul di pilihan penjahit untuk order baru. Data historis tetap tersimpan.`
                : `${toggleTarget?.name} akan muncul kembali di pilihan penjahit untuk order baru.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowToggleDialog(false)}>Batal</Button>
            <Button
              onClick={handleToggleActive}
              className={toggleTarget?.active ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'}
            >
              {toggleTarget?.active ? 'Nonaktifkan' : 'Aktifkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
