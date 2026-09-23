import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/currency';
import { supabase, trx } from '@/lib/supabase';
import { toast, Toaster } from 'sonner';

interface Order {
  id: number;
  customer_name: string;
  outfit_type: string;
  total_price: number;
  amount_paid: number;
  payment_status: string;
  created_at: string;
}

export default function PaymentReconcile() {
  const [amount, setAmount] = useState('');
  const [matchingOrders, setMatchingOrders] = useState<Order[]>([]);
  const [allPendingOrders, setAllPendingOrders] = useState<Order[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdating, setIsUpdating] = useState<number | null>(null);

  // Load all pending orders on mount
  useEffect(() => {
    loadPendingOrders();
  }, []);

  const loadPendingOrders = async () => {
    try {
      const { data, error } = await trx
        .from('transaction')
        .select('id, customer_name, outfit_type, total_price, amount_paid, payment_status, created_at')
        .in('payment_status', ['pending', 'dp', 'belum_lunas'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setAllPendingOrders(data || []);
    } catch (err) {
      console.error('Error loading orders:', err);
    }
  };

  const searchMatchingOrders = () => {
    const searchAmount = parseCurrencyInput(amount);
    if (searchAmount <= 0) {
      toast.error('Masukkan nominal yang valid');
      return;
    }

    setIsSearching(true);
    
    // Find orders where remaining amount matches (with tolerance)
    const tolerance = 1000; // 1000 rupiah tolerance
    const matches = allPendingOrders.filter(order => {
      const remaining = (order.total_price || 0) - (order.amount_paid || 0);
      return Math.abs(remaining - searchAmount) <= tolerance;
    });

    setMatchingOrders(matches);
    setIsSearching(false);

    if (matches.length === 0) {
      toast.info(`Tidak ada order dengan sisa bayar Rp ${searchAmount.toLocaleString('id-ID')}`);
    } else {
      toast.success(`Ditemukan ${matches.length} order yang cocok`);
    }
  };

  const markAsPaid = async (order: Order, paidAmount?: number) => {
    setIsUpdating(order.id);
    
    try {
      const amountToPay = paidAmount || parseCurrencyInput(amount);
      const newAmountPaid = (order.amount_paid || 0) + amountToPay;
      const isFullyPaid = newAmountPaid >= (order.total_price || 0);

      const { error } = await trx
        .from('transaction')
        .update({
          amount_paid: isFullyPaid ? order.total_price : newAmountPaid,
          payment_status: isFullyPaid ? 'lunas' : 'dp',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (error) throw error;

      toast.success(
        isFullyPaid 
          ? `Order #${order.id} - ${order.customer_name} sudah LUNAS!`
          : `Order #${order.id} - DP Rp ${amountToPay.toLocaleString('id-ID')} tercatat`
      );

      // Refresh data
      await loadPendingOrders();
      setMatchingOrders(prev => prev.filter(o => o.id !== order.id));

    } catch (err) {
      console.error('Error updating order:', err);
      toast.error('Gagal update pembayaran');
    } finally {
      setIsUpdating(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-3xl">
      <Toaster position="top-center" richColors />
      
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-xl">Payment Reconciliation</CardTitle>
          <p className="text-sm text-slate-500">
            Dapat notif "uang masuk"? Input nominal, cari order yang cocok, klik Lunas.
          </p>
        </CardHeader>

        <div className="p-6 space-y-6">
          {/* Amount Input */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Nominal dari Notifikasi</Label>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">Rp</span>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(formatCurrencyInput(e.target.value))}
                  placeholder="200.000"
                  type="text"
                  inputMode="numeric"
                  className="h-14 text-2xl font-bold pl-10"
                  onKeyDown={(e) => e.key === 'Enter' && searchMatchingOrders()}
                />
              </div>
              <Button
                onClick={searchMatchingOrders}
                disabled={isSearching || !amount}
                className="h-14 px-8 bg-indigo-600 hover:bg-indigo-700 font-semibold text-lg"
              >
                Cari Order
              </Button>
            </div>
            
            {/* Quick amounts */}
            <div className="flex flex-wrap gap-2">
              {[50000, 100000, 150000, 200000, 250000, 300000].map(amt => (
                <button
                  key={amt}
                  onClick={() => {
                    setAmount(amt.toLocaleString('id-ID'));
                  }}
                  className="px-3 py-1.5 text-sm rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition-colors"
                >
                  {(amt / 1000)}k
                </button>
              ))}
            </div>
          </div>

          {/* Matching Orders */}
          {matchingOrders.length > 0 && (
            <div className="space-y-3">
              <Label className="text-base font-semibold text-green-700">
                Order yang Cocok ({matchingOrders.length})
              </Label>
              <div className="space-y-2">
                {matchingOrders.map(order => {
                  const remaining = (order.total_price || 0) - (order.amount_paid || 0);
                  return (
                    <div
                      key={order.id}
                      className="p-4 rounded-xl bg-green-50 border-2 border-green-200 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-green-900">
                          #{order.id} - {order.customer_name}
                        </div>
                        <div className="text-sm text-green-700">
                          {order.outfit_type} • {formatDate(order.created_at)}
                        </div>
                        <div className="text-sm text-green-600 mt-1">
                          Sisa: <span className="font-bold">Rp {remaining.toLocaleString('id-ID')}</span>
                          {order.amount_paid > 0 && (
                            <span className="ml-2 text-xs">(sudah DP Rp {order.amount_paid.toLocaleString('id-ID')})</span>
                          )}
                        </div>
                      </div>
                      <Button
                        onClick={() => markAsPaid(order)}
                        disabled={isUpdating === order.id}
                        className="bg-green-600 hover:bg-green-700 font-semibold px-6"
                      >
                        {isUpdating === order.id ? '...' : 'LUNAS'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All Pending Orders */}
          <div className="space-y-3">
            <Label className="text-base font-semibold text-slate-700">
              Semua Order Belum Lunas ({allPendingOrders.length})
            </Label>
            
            {allPendingOrders.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl">
                Tidak ada order yang belum lunas
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {allPendingOrders.map(order => {
                  const remaining = (order.total_price || 0) - (order.amount_paid || 0);
                  return (
                    <div
                      key={order.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="font-semibold text-slate-800">
                          #{order.id} - {order.customer_name}
                        </div>
                        <div className="text-sm text-slate-500">
                          {order.outfit_type} • {formatDate(order.created_at)}
                        </div>
                        <div className="text-sm text-slate-600 mt-1">
                          Total: Rp {(order.total_price || 0).toLocaleString('id-ID')}
                          {order.amount_paid > 0 && (
                            <span className="ml-2 text-amber-600">
                              (DP: Rp {order.amount_paid.toLocaleString('id-ID')})
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-medium text-indigo-600">
                          Sisa: Rp {remaining.toLocaleString('id-ID')}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            const dp = prompt(`DP untuk order #${order.id}?\nSisa: Rp ${remaining.toLocaleString('id-ID')}`);
                            if (dp) {
                              const dpAmount = parseCurrencyInput(dp);
                              if (dpAmount > 0) markAsPaid(order, dpAmount);
                            }
                          }}
                          variant="outline"
                          size="sm"
                          disabled={isUpdating === order.id}
                        >
                          +DP
                        </Button>
                        <Button
                          onClick={() => markAsPaid(order, remaining)}
                          disabled={isUpdating === order.id}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {isUpdating === order.id ? '...' : 'LUNAS'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Instructions */}
      <div className="mt-6 p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <p className="font-semibold mb-2">Cara Pakai:</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-700">
          <li>Dapat notif "Uang masuk Rp 200.000" di HP</li>
          <li>Input nominal 200.000 di atas</li>
          <li>Klik "Cari Order" - sistem cari order dengan sisa bayar yang sama</li>
          <li>Klik "LUNAS" pada order yang sesuai</li>
        </ol>
        <p className="mt-3 text-blue-600 text-xs">
          Toleransi pencarian: ± Rp 1.000 (untuk pembulatan)
        </p>
      </div>
    </div>
  );
}
