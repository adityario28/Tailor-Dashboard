import { useState, useEffect, useCallback } from 'react';
import { db, syncPending } from '@/lib/db';
import { toast } from 'sonner';

export default function SyncStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Count all unsynced records across tables
  const countPending = useCallback(async () => {
    try {
      const counts = await Promise.all([
        db.customer.filter(c => !c.synced).count(),
        db.preset_customer.filter(p => !p.synced).count(),
        db.transactions.filter(t => !t.synced).count(),
        db.transaction_item.filter(i => !i.synced).count(),
        db.material.filter(m => !m.synced).count(),
        db.purchase.filter(p => !p.synced).count(),
        db.purchase_item.filter(p => !p.synced).count(),
        db.material_usage.filter(u => !u.synced).count(),
        db.worker.filter(w => !w.synced).count(),
        db.order_group.filter(g => !g.synced).count(),
        db.group_member.filter(m => !m.synced).count(),
      ]);
      setPendingCount(counts.reduce((sum, c) => sum + c, 0));
    } catch (err) {
      console.error('Failed to count pending:', err);
    }
  }, []);

  // Handle sync button click
  const handleSync = async () => {
    if (!isOnline || isSyncing) return;
    
    setIsSyncing(true);
    try {
      await syncPending();
      await countPending();
      toast.success('Sinkronisasi selesai');
    } catch (err) {
      console.error('Sync failed:', err);
      toast.error('Sinkronisasi gagal');
    } finally {
      setIsSyncing(false);
    }
  };

  // Auto-sync when coming back online
  const handleOnline = useCallback(async () => {
    setIsOnline(true);
    // Auto-sync when back online
    try {
      await syncPending();
      await countPending();
      toast.success('Kembali online. Data tersinkronisasi.');
    } catch (err) {
      console.error('Auto-sync failed:', err);
    }
  }, [countPending]);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    toast.warning('Anda sedang offline');
  }, []);

  // Listen to online/offline events
  useEffect(() => {
    setIsOnline(navigator.onLine);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  // Listen to sidebar collapse state
  useEffect(() => {
    const handleCollapseChange = (e: Event) => {
      const collapsed = (e as CustomEvent).detail;
      setIsCollapsed(collapsed);
    };

    // Check initial state from localStorage
    const initialCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    setIsCollapsed(initialCollapsed);

    window.addEventListener('sidebar-collapse-change', handleCollapseChange);
    return () => {
      window.removeEventListener('sidebar-collapse-change', handleCollapseChange);
    };
  }, []);

  // Count pending on mount and periodically
  useEffect(() => {
    countPending();
    
    // Recount every 30 seconds
    const interval = setInterval(countPending, 30000);
    return () => clearInterval(interval);
  }, [countPending]);

  // Also recount when window regains focus (user might have made changes in another tab)
  useEffect(() => {
    const handleFocus = () => countPending();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [countPending]);

  // Determine dot color
  const dotColor = !isOnline 
    ? 'bg-red-500' 
    : pendingCount > 0 
      ? 'bg-yellow-500' 
      : 'bg-green-500';

  const statusText = !isOnline 
    ? 'Offline' 
    : pendingCount > 0 
      ? 'Online' 
      : 'Online';

  // Collapsed view (icon only)
  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-3 border-b mb-2">
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} title={statusText} />
        
        {/* Sync button (icon only) */}
        {isOnline && pendingCount > 0 && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-50"
            title={`Sinkronkan ${pendingCount} data`}
          >
            {isSyncing ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
            )}
          </button>
        )}
        
        {/* Pending badge */}
        {pendingCount > 0 && (
          <span className="text-[10px] font-medium text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">
            {pendingCount}
          </span>
        )}
      </div>
    );
  }

  // Expanded view
  return (
    <div className="px-3 py-3 border-b mb-2">
      <div className="flex items-center justify-between gap-2">
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
          <span className="text-sm font-medium text-slate-600">{statusText}</span>
        </div>
        
        {/* Sync button */}
        {isOnline && pendingCount > 0 && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors disabled:opacity-50"
          >
            {isSyncing ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Syncing...</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
                <span>Sync</span>
              </>
            )}
          </button>
        )}
      </div>
      
      {/* Pending count */}
      {pendingCount > 0 && (
        <p className="text-xs text-yellow-600 mt-1.5">
          {pendingCount} data belum tersinkronisasi
        </p>
      )}
      
      {/* All synced message */}
      {isOnline && pendingCount === 0 && (
        <p className="text-xs text-green-600 mt-1.5">
          Semua data tersinkronisasi
        </p>
      )}
      
      {/* Offline message */}
      {!isOnline && (
        <p className="text-xs text-red-600 mt-1.5">
          Tidak ada koneksi internet
        </p>
      )}
    </div>
  );
}
