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

  const updateMetrics = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [localTrx, localGroupMembers] = await Promise.all([
        db.transactions.toArray(),
        db.group_member.toArray(),
      ]);
      let allItems: any[] = [];

      if (navigator.onLine) {
        const [{ data: remoteTrx }, { data: remoteGroupMembers }] = await Promise.all([
          trx.from('transaction').select('*'),
          trx.from('group_member').select('*'),
        ]);
        
        // Merge transactions
        if (remoteTrx) {
          const remoteIds = new Set(remoteTrx.map((t: any) => t.id));
          const unsyncedLocal = localTrx.filter(t => !t.synced && !remoteIds.has(t.id));
          allItems = [...remoteTrx, ...unsyncedLocal];
        } else {
          allItems = [...localTrx];
        }

        // Merge group members
        if (remoteGroupMembers) {
          const remoteIds = new Set(remoteGroupMembers.map((m: any) => m.id));
          const unsyncedLocal = localGroupMembers.filter(m => !m.synced && !remoteIds.has(m.id));
          allItems = [...allItems, ...remoteGroupMembers, ...unsyncedLocal];
        } else {
          allItems = [...allItems, ...localGroupMembers];
        }
      } else {
        allItems = [...localTrx, ...localGroupMembers];
      }

      const done = allItems.filter(t => t.status === "Selesai");
      const active = allItems.filter(t => t.status !== "Selesai");

      setMetrics({
        total: allItems.length,
        active: active.length,
        done: done.length,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      // Signal Astro to swap skeleton
      window.dispatchEvent(new CustomEvent('metrics-ready'));
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
            Selesai
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
