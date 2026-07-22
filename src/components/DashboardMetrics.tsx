import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { trx } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardMetrics() {
  const [metrics, setMetrics] = useState({ total: 0, active: 0, done: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    updateMetrics();
  }, []);

  const updateMetrics = async () => {
    setLoading(true);
    try {
      const [localTrx] = await Promise.all([db.transactions.toArray()]);
      let allTransactions = localTrx;

      if (navigator.onLine) {
        const { data: remoteTrx } = await trx.from('transaction').select('*');
        if (remoteTrx) {
          allTransactions = [...localTrx, ...(remoteTrx as any[])];
        }
      }

      const done = allTransactions.filter(t => t.status === "Siap Diambil");
      const active = allTransactions.filter(t => t.status !== "Siap Diambil");

      setMetrics({
        total: allTransactions.length,
        active: active.length,
        done: done.length,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-500">
            Total Pesanan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-10 w-16" />
          ) : (
            <p className="text-3xl font-bold text-slate-900">{metrics.total}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-500">
            Sedang Dikerjakan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-10 w-16" />
          ) : (
            <p className="text-3xl font-bold text-amber-500">{metrics.active}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-500">
            Siap Diambil
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-10 w-16" />
          ) : (
            <p className="text-3xl font-bold text-green-600">{metrics.done}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
