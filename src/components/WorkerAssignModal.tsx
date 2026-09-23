import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { loadActiveWorkers, loadWorkerWorkload } from '@/lib/db';
import type { Worker } from '@/lib/db';

interface WorkerAssignModalProps {
  open: boolean;
  orderId: number;
  customerName: string;
  outfitType?: string;
  currentWorkerId?: number;
  onConfirm: (workerId: number, workerName: string) => void;
  onCancel: () => void;
}

export default function WorkerAssignModal({
  open,
  orderId,
  customerName,
  outfitType,
  currentWorkerId,
  onConfirm,
  onCancel,
}: WorkerAssignModalProps) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workload, setWorkload] = useState<Map<number, number>>(new Map());
  const [selected, setSelected] = useState<number | null>(currentWorkerId ?? null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      setSelected(currentWorkerId ?? null);
      loadData();
    }
  }, [open, currentWorkerId]);

  async function loadData() {
    setLoading(true);
    try {
      const [ws, wl] = await Promise.all([loadActiveWorkers(), loadWorkerWorkload()]);
      setWorkers(ws);
      setWorkload(wl);
    } catch (err) {
      console.error('WorkerAssignModal loadData error:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleConfirm() {
    if (!selected) return;
    const worker = workers.find(w => w.id === selected);
    if (!worker) return;
    onConfirm(selected, worker.name);
  }

  const isReassign = currentWorkerId !== undefined && currentWorkerId !== null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isReassign ? 'Ganti Penjahit' : 'Pilih Penjahit'}</DialogTitle>
          <DialogDescription>
            Order #{orderId} — {customerName}
            {outfitType && <span className="ml-1 text-slate-500">({outfitType})</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 rounded-lg bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : workers.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-slate-500">Belum ada penjahit aktif.</p>
              <a href="/workers" className="text-xs text-indigo-600 hover:underline mt-1 block">
                Tambah penjahit di halaman Penjahit →
              </a>
            </div>
          ) : (
            <div className="space-y-2">
              {workers.map(w => {
                const count = workload.get(w.id!) ?? 0;
                const isActive = selected === w.id;
                const isCurrent = currentWorkerId === w.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => setSelected(w.id!)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 text-left transition-all ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Radio indicator */}
                      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        isActive ? 'border-indigo-600' : 'border-slate-300'
                      }`}>
                        {isActive && <span className="w-2 h-2 rounded-full bg-indigo-600" />}
                      </span>
                      <div>
                        <p className={`text-sm font-medium ${isActive ? 'text-indigo-800' : 'text-slate-800'}`}>
                          {w.name}
                          {isCurrent && (
                            <span className="ml-2 text-xs text-indigo-500 font-normal">(saat ini)</span>
                          )}
                        </p>
                      </div>
                    </div>
                    {/* Workload badge */}
                    <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${
                      count === 0
                        ? 'bg-green-100 text-green-700'
                        : count <= 2
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {count} order aktif
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Batal</Button>
          <Button
            onClick={handleConfirm}
            disabled={!selected || loading || workers.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isReassign ? 'Ganti Penjahit' : 'Konfirmasi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
