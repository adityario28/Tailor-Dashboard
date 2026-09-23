import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
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
import GroupMemberForm from '@/components/GroupMemberForm';
import WorkerAssignModal from '@/components/WorkerAssignModal';
import { db, STATUS_FLOW, deductMaterialStock, syncGroupMember } from '@/lib/db';
import type { OrderGroup, GroupMember, Material, MaterialUsage, OrderStatus, PaymentStatus } from '@/lib/db';
import { trx } from '@/lib/supabase';
import { toast } from 'sonner';
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from '@/lib/currency';

const STATUS_COLORS: Record<OrderStatus, string> = {
  'Cuci Bahan':   'bg-blue-100 text-blue-700',
  'Potong Bahan': 'bg-orange-100 text-orange-700',
  Jahit:          'bg-purple-100 text-purple-700',
  Finishing:      'bg-yellow-100 text-yellow-700',
  'Siap Diambil': 'bg-green-100 text-green-700',
  Selesai:        'bg-emerald-100 text-emerald-700',
};

const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string }> = {
  belum_bayar: { label: 'Belum Bayar', color: 'bg-red-100 text-red-700' },
  dp:          { label: 'DP',          color: 'bg-yellow-100 text-yellow-700' },
  lunas:       { label: 'Lunas',       color: 'bg-green-100 text-green-700' },
};

export default function GroupOrderDetail() {
  const [group, setGroup] = useState<OrderGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupId, setGroupId] = useState(0);

  // Member form state
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [editingMember, setEditingMember] = useState<GroupMember | null>(null);

  // Worker modal state
  const [workerModal, setWorkerModal] = useState<{
    memberId: number;
    memberName: string;
    outfitType?: string;
    pendingStatus: OrderStatus;
  } | null>(null);

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);

  // Material usage state
  const [materials, setMaterials] = useState<Material[]>([]);
  const [usageList, setUsageList] = useState<(MaterialUsage & { material_name?: string; unit?: string })[]>([]);
  const [newUsageMaterialId, setNewUsageMaterialId] = useState('');
  const [newUsageQty, setNewUsageQty] = useState('');
  const [savingUsage, setSavingUsage] = useState(false);

  // Worker map for display
  const [workerMap, setWorkerMap] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get('id')) || 0;
    const src = params.get('src') as 'local' | 'remote' | null;
    if (id) {
      setGroupId(id);
      loadGroup(id, src || 'local');
      loadMaterials();
    }
  }, []);

  const loadGroup = async (id: number, source: 'local' | 'remote') => {
    setLoading(true);
    try {
      // Load group
      let groupData: OrderGroup | null = null;
      let supabaseGroupId: number | null = null;

      if (source === 'local') {
        // Try local first
        const localGroup = await db.order_group.get(id);
        if (localGroup) {
          groupData = localGroup;
          setGroup(localGroup);
        }
        // Also try remote with same ID (might match if synced)
        if (navigator.onLine) {
          const { data: remoteGroup } = await trx.from('order_group').select('*').eq('id', id).single();
          if (remoteGroup) {
            groupData = remoteGroup as OrderGroup;
            supabaseGroupId = remoteGroup.id;
            setGroup(groupData);
          }
        }
      } else {
        // Source is remote - load from Supabase directly
        if (navigator.onLine) {
          const { data: remoteGroup } = await trx.from('order_group').select('*').eq('id', id).single();
          if (remoteGroup) {
            groupData = remoteGroup as OrderGroup;
            supabaseGroupId = remoteGroup.id;
            setGroup(groupData);
          }
        }
        // Fallback to local if offline
        if (!groupData) {
          const localGroup = await db.order_group.get(id);
          if (localGroup) {
            groupData = localGroup;
            setGroup(localGroup);
          }
        }
      }

      if (!groupData) {
        setLoading(false);
        return;
      }

      // Load members
      let memberList: GroupMember[] = [];
      
      if (source === 'local') {
        // Try local first using local group_id
        const localMembers = await db.group_member.where('group_id').equals(id).toArray();
        if (localMembers.length > 0) {
          memberList = localMembers;
          setMembers(localMembers);
        }
        // Also check remote
        if (navigator.onLine && supabaseGroupId) {
          const { data: remoteMembers } = await trx.from('group_member').select('*').eq('group_id', supabaseGroupId);
          if (remoteMembers && remoteMembers.length > 0) {
            memberList = remoteMembers as GroupMember[];
            setMembers(memberList);
          }
        }
      } else {
        // Source is remote - load members from Supabase using the Supabase group_id
        if (navigator.onLine) {
          const { data: remoteMembers } = await trx.from('group_member').select('*').eq('group_id', id);
          if (remoteMembers && remoteMembers.length > 0) {
            memberList = remoteMembers as GroupMember[];
            setMembers(memberList);
          }
        }
        // Fallback to local if offline
        if (memberList.length === 0) {
          const localMembers = await db.group_member.where('group_id').equals(id).toArray();
          if (localMembers.length > 0) {
            memberList = localMembers;
            setMembers(localMembers);
          }
        }
      }

      // Load workers for display
      if (navigator.onLine) {
        const { data: wData } = await trx.from('worker').select('id, name');
        if (wData) setWorkerMap(new Map((wData as any[]).map(w => [w.id, w.name])));
      } else {
        const ws = await db.worker.toArray();
        setWorkerMap(new Map(ws.map(w => [w.id!, w.name])));
      }

      // Load material usage for this group
      await loadUsage(id);

    } catch (err) {
      console.error('loadGroup error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMaterials = async () => {
    // Always load from local first (shows updated stock after deduction)
    const local = await db.material.orderBy('name').toArray();
    setMaterials(local);
    
    // If online, sync from remote but merge with local stock values
    if (navigator.onLine) {
      const { data } = await trx.from('material').select('*').order('name');
      if (data && data.length > 0) {
        // Prefer local stock values as they reflect recent deductions
        const localMap = new Map(local.map(m => [m.id, m]));
        const merged = (data as Material[]).map(remote => {
          const localMat = localMap.get(remote.id);
          // If local has this material and it's been modified (synced=false), use local stock
          if (localMat && !localMat.synced) {
            return { ...remote, current_stock: localMat.current_stock };
          }
          return remote;
        });
        setMaterials(merged);
      }
    }
  };

  const loadUsage = async (gId: number) => {
    try {
      let list: (MaterialUsage & { material_name?: string; unit?: string })[] = [];

      if (navigator.onLine) {
        const { data } = await trx.from('material_usage').select('*').eq('group_id', gId);
        if (data && data.length > 0) {
          const matIds = [...new Set((data as any[]).map(u => u.material_id))];
          const { data: mats } = await trx.from('material').select('id, name, unit').in('id', matIds);
          const matMap = new Map<number, { name: string; unit: string }>(
            (mats ?? []).map((m: any) => [m.id, { name: m.name, unit: m.unit }])
          );
          list = (data as any[]).map(u => ({
            ...u,
            material_name: matMap.get(u.material_id)?.name ?? '—',
            unit: matMap.get(u.material_id)?.unit ?? '',
          }));
        }
      } else {
        const localUsage = await db.material_usage.where('group_id').equals(gId).toArray();
        const allMats = await db.material.toArray();
        const matMap = new Map(allMats.map(m => [m.id!, m]));
        list = localUsage.map(u => ({
          ...u,
          material_name: matMap.get(u.material_id)?.name ?? '—',
          unit: matMap.get(u.material_id)?.unit ?? '',
        }));
      }
      setUsageList(list);
    } catch (err) {
      console.error('loadUsage error:', err);
    }
  };

  const handleStatusChange = async (member: GroupMember, newStatus: OrderStatus) => {
    if (member.status === newStatus) return;

    // Intercept "Jahit" — require worker assignment
    if (newStatus === 'Jahit') {
      setWorkerModal({
        memberId: member.id!,
        memberName: member.name,
        outfitType: member.outfit_type,
        pendingStatus: newStatus,
      });
      return;
    }

    try {
      await db.group_member.update(member.id!, { status: newStatus, synced: false });
      if (navigator.onLine) {
        await trx.from('group_member').update({ status: newStatus }).eq('id', member.id);
        await db.group_member.update(member.id!, { synced: true });
      }
      loadGroup(groupId);
    } catch (err) {
      console.error('handleStatusChange error:', err);
      toast.error('Gagal mengubah status.');
    }
  };

  const handleWorkerConfirm = async (workerId: number) => {
    if (!workerModal) return;
    const { memberId, pendingStatus } = workerModal;
    try {
      await db.group_member.update(memberId, { status: pendingStatus, worker_id: workerId, synced: false });
      if (navigator.onLine) {
        await trx.from('group_member').update({ status: pendingStatus, worker_id: workerId }).eq('id', memberId);
        await db.group_member.update(memberId, { synced: true });
      }
      setWorkerModal(null);
      loadGroup(groupId);
      toast.success('Status diubah & penjahit ditugaskan.');
    } catch (err) {
      console.error('handleWorkerConfirm error:', err);
      toast.error('Gagal menyimpan penjahit.');
    }
  };

  const handlePayment = async () => {
    if (!group) return;
    const amount = parseCurrencyInput(paymentAmount);
    if (amount <= 0) {
      toast.error('Masukkan jumlah pembayaran yang valid.');
      return;
    }

    setPaymentSaving(true);
    try {
      const newAmountPaid = (group.amount_paid || 0) + amount;
      const totalPrice = group.total_price || 0;
      const newStatus: PaymentStatus = newAmountPaid >= totalPrice ? 'lunas' : 'dp';

      await db.order_group.update(groupId, { amount_paid: newAmountPaid, payment_status: newStatus, synced: false });
      if (navigator.onLine) {
        await trx.from('order_group').update({ amount_paid: newAmountPaid, payment_status: newStatus }).eq('id', groupId);
        await db.order_group.update(groupId, { synced: true });
      }

      setGroup({ ...group, amount_paid: newAmountPaid, payment_status: newStatus });
      setShowPaymentModal(false);
      setPaymentAmount('');
      toast.success('Pembayaran berhasil dicatat.');
    } catch (err) {
      console.error('handlePayment error:', err);
      toast.error('Gagal menyimpan pembayaran.');
    } finally {
      setPaymentSaving(false);
    }
  };

  const handleAddUsage = async () => {
    if (!newUsageMaterialId) {
      toast.error('Pilih bahan terlebih dahulu.');
      return;
    }

    const matId = Number(newUsageMaterialId);
    const mat = materials.find(m => m.id === matId);
    if (!mat) return;

    const qty = parseFloat(newUsageQty);
    if (!qty || qty <= 0) {
      toast.error('Masukkan jumlah yang valid.');
      return;
    }

    if (mat.current_stock < qty) {
      toast.error(`Stok ${mat.name} tidak cukup (tersedia: ${mat.current_stock} ${mat.unit}).`);
      return;
    }

    setSavingUsage(true);
    try {
      const newStock = Math.max(0, mat.current_stock - qty);

      // Update Supabase first if online
      if (navigator.onLine) {
        // Insert usage record
        const { error: usageError } = await trx.from('material_usage').insert({
          group_id: groupId,
          material_id: matId,
          quantity_used: qty,
          cost_per_unit_snapshot: mat.avg_cost_per_unit,
        });
        if (usageError) {
          console.error('Sync usage error:', usageError);
          throw usageError;
        }

        // Update material stock in Supabase
        const { error: stockError } = await trx.from('material').update({ current_stock: newStock }).eq('id', matId);
        if (stockError) {
          console.error('Update stock error:', stockError);
        }
      }

      // Also save to local Dexie for offline support
      const usagePayload: Omit<MaterialUsage, 'id'> = {
        group_id: groupId,
        material_id: matId,
        quantity_used: qty,
        cost_per_unit_snapshot: mat.avg_cost_per_unit,
        synced: navigator.onLine,
      };
      await db.material_usage.add(usagePayload);

      // Try to update local material stock (may not exist locally with same ID)
      const localMat = await db.material.get(matId);
      if (localMat) {
        await db.material.update(matId, { current_stock: newStock, synced: navigator.onLine });
      }

      toast.success('Penggunaan bahan dicatat.');
      setNewUsageMaterialId('');
      setNewUsageQty('');
      loadUsage(groupId);
      loadMaterials();
    } catch (err) {
      console.error('handleAddUsage error:', err);
      toast.error('Gagal mencatat penggunaan bahan.');
    } finally {
      setSavingUsage(false);
    }
  };

  const handleMemberSaved = () => {
    setShowMemberForm(false);
    setEditingMember(null);
    loadGroup(groupId);
    // Recalculate group total
    recalcGroupTotal();
  };

  const recalcGroupTotal = async () => {
    const allMembers = await db.group_member.where('group_id').equals(groupId).toArray();
    const total = allMembers.reduce((sum, m) => sum + (m.total_price || 0), 0);
    await db.order_group.update(groupId, { total_price: total, synced: false });
    if (navigator.onLine) {
      await trx.from('order_group').update({ total_price: total }).eq('id', groupId);
      await db.order_group.update(groupId, { synced: true });
    }
    setGroup(prev => prev ? { ...prev, total_price: total } : null);
  };

  if (loading) {
    return (
      <div className="container mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="container mx-auto">
        <p className="text-slate-500">Grup pesanan tidak ditemukan.</p>
      </div>
    );
  }

  const selesaiCount = members.filter(m => m.status === 'Selesai').length;
  const totalUsageCost = usageList.reduce((sum, u) => sum + u.quantity_used * u.cost_per_unit_snapshot, 0);
  const paymentConfig = PAYMENT_STATUS_CONFIG[group.payment_status || 'belum_bayar'];

  return (
    <div className="container mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <a href="/dashboard" className="text-slate-500 hover:text-slate-900 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </a>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">{group.name}</h1>
        {group.ref_number ? (
          <span className="text-sm font-mono text-indigo-600 bg-indigo-50 px-2 py-1 rounded">GRP-{group.ref_number}</span>
        ) : (
          <span className="text-sm text-slate-400 italic">Draft</span>
        )}
        <span className={`ml-2 px-2.5 py-1 rounded-full text-xs font-semibold ${paymentConfig.color}`}>
          {paymentConfig.label}
        </span>
      </div>

      {/* Info Card */}
      <Card className="border-2">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Pemesan</p>
              <p className="text-base font-semibold text-slate-900">{group.commissioner}</p>
              {group.commissioner_phone && (
                <p className="text-sm text-slate-500">{group.commissioner_phone}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Anggota</p>
              <p className="text-2xl font-bold text-slate-900">{members.length}</p>
              <p className="text-sm text-slate-500">{selesaiCount} selesai</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Total Nilai</p>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(group.total_price)}</p>
              <p className="text-sm text-slate-500">Dibayar: {formatCurrency(group.amount_paid)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Sisa</p>
              <p className="text-2xl font-bold text-amber-600">
                {formatCurrency(Math.max(0, (group.total_price || 0) - (group.amount_paid || 0)))}
              </p>
              <Button
                size="sm"
                onClick={() => {
                  const remaining = Math.max(0, (group.total_price || 0) - (group.amount_paid || 0));
                  setPaymentAmount(formatCurrencyInput(String(remaining)));
                  setShowPaymentModal(true);
                }}
                className="mt-2 bg-green-600 hover:bg-green-700"
                disabled={group.payment_status === 'lunas'}
              >
                Bayar
              </Button>
            </div>
          </div>
          {group.notes && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Catatan</p>
              <p className="text-sm text-slate-700">{group.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Members */}
      <Card className="border-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Daftar Anggota ({members.length})</CardTitle>
          <Button onClick={() => { setEditingMember(null); setShowMemberForm(true); }} className="bg-indigo-600 hover:bg-indigo-700">
            + Tambah Anggota
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-slate-400">Belum ada anggota. Klik "Tambah Anggota" untuk memulai.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-slate-500 text-left bg-slate-50">
                    <th className="py-3 px-4 font-medium">Nama</th>
                    <th className="py-3 px-4 font-medium">Role</th>
                    <th className="py-3 px-4 font-medium">Jenis</th>
                    <th className="py-3 px-4 font-medium">Penjahit</th>
                    <th className="py-3 px-4 font-medium">Harga</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(member => {
                    const currentIdx = STATUS_FLOW.indexOf(member.status);
                    const visibleStatuses = currentIdx >= 0 ? STATUS_FLOW.slice(currentIdx) : STATUS_FLOW;
                    const colorClass = STATUS_COLORS[member.status] ?? '';
                    const workerName = member.worker_id ? workerMap.get(member.worker_id) : null;

                    return (
                      <tr key={member.id} className="border-b hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium text-slate-900">{member.name}</td>
                        <td className="py-3 px-4 text-slate-500">{member.role || '—'}</td>
                        <td className="py-3 px-4 text-slate-600">{member.outfit_type || '—'}</td>
                        <td className="py-3 px-4">
                          {workerName ? (
                            <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-1 rounded-full">{workerName}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{formatCurrency(member.total_price)}</td>
                        <td className="py-3 px-4">
                          <Select
                            value={member.status}
                            onValueChange={(value) => handleStatusChange(member, value as OrderStatus)}
                          >
                            <SelectTrigger className={`w-auto h-auto border-0 text-xs font-semibold px-2 py-1.5 rounded-full ${colorClass}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {visibleStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-3 px-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setEditingMember(member); setShowMemberForm(true); }}
                          >
                            Lihat
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Material Usage */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle>Penggunaan Bahan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {/* Add form */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Select value={newUsageMaterialId} onValueChange={setNewUsageMaterialId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pilih bahan..." />
                </SelectTrigger>
                <SelectContent>
                  {materials.map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name} <span className="text-slate-400 text-xs">(stok: {m.current_stock} {m.unit})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-32">
              <Input
                type="number"
                min="0"
                step="0.25"
                value={newUsageQty}
                onChange={e => setNewUsageQty(e.target.value)}
                placeholder="Jumlah"
                className="h-11"
              />
            </div>
            <Button onClick={handleAddUsage} disabled={savingUsage} className="h-11 px-5 bg-indigo-600 hover:bg-indigo-700">
              {savingUsage ? 'Menyimpan...' : 'Catat'}
            </Button>
          </div>

          {/* Usage list */}
          {usageList.length === 0 ? (
            <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-lg">
              <p className="text-slate-400 text-sm">Belum ada bahan yang dicatat untuk grup ini.</p>
            </div>
          ) : (
            <div className="divide-y border rounded-lg overflow-hidden">
              {usageList.map(u => (
                <div key={u.id} className="flex items-center justify-between px-4 py-3 bg-white">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{u.material_name}</p>
                    <p className="text-xs text-slate-500">{u.quantity_used} {u.unit} x {formatCurrency(u.cost_per_unit_snapshot)}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{formatCurrency(u.quantity_used * u.cost_per_unit_snapshot)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Member Form Dialog */}
      <Dialog open={showMemberForm} onOpenChange={setShowMemberForm}>
        <DialogContent 
          className="overflow-y-auto"
          style={{ width: '95vw', maxWidth: '95vw', height: '90vh', maxHeight: '90vh' }}
        >
          <DialogHeader>
            <DialogTitle>{editingMember ? 'Detail Anggota' : 'Tambah Anggota'}</DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <GroupMemberForm
              groupId={groupId}
              groupUuid={group.uuid}
              defaultOutfitType={group.default_outfit_type || 'Jas'}
              existingMember={editingMember}
              lastMemberPrice={members.length > 0 ? members[members.length - 1].total_price : undefined}
              lastMemberSewingFee={members.length > 0 ? members[members.length - 1].sewing_fee : undefined}
              onSaved={handleMemberSaved}
              onCancel={() => setShowMemberForm(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Worker Modal */}
      {workerModal && (
        <WorkerAssignModal
          open={true}
          orderId={workerModal.memberId}
          customerName={workerModal.memberName}
          outfitType={workerModal.outfitType}
          onConfirm={(workerId) => handleWorkerConfirm(workerId)}
          onCancel={() => setWorkerModal(null)}
        />
      )}

      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pembayaran</DialogTitle>
            <DialogDescription>Catat pembayaran dari pemesan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
              <div>
                <Label className="text-xs text-slate-500">Total Nilai</Label>
                <div className="text-base font-semibold">{formatCurrency(group.total_price)}</div>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Sudah Dibayar</Label>
                <div className="text-base font-semibold text-green-600">{formatCurrency(group.amount_paid)}</div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Jumlah Bayar (Rp)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={paymentAmount}
                onChange={e => setPaymentAmount(formatCurrencyInput(e.target.value))}
                className="h-12 text-base font-semibold"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentModal(false)}>Batal</Button>
            <Button onClick={handlePayment} disabled={paymentSaving} className="bg-green-600 hover:bg-green-700">
              {paymentSaving ? 'Memproses...' : 'Bayar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
