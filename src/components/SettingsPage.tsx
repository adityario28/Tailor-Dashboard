import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { db } from '@/lib/db';
import { trx } from '@/lib/supabase';
import { toast } from 'sonner';

interface DbStats {
  version: number;
  customers: number;
  transactions: number;
  orderGroups: number;
  groupMembers: number;
  materials: number;
  workers: number;
}

interface PayhookConfig {
  bearerToken: string;
  secretKey: string;
}

interface QrisConfig {
  expectedMerchantName: string;
}

export default function SettingsPage() {
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [stats, setStats] = useState<DbStats | null>(null);
  
  // Payhook config state
  const [payhookConfig, setPayhookConfig] = useState<PayhookConfig>({ bearerToken: '', secretKey: '' });
  const [payhookLoading, setPayhookLoading] = useState(true);
  const [payhookSaving, setPayhookSaving] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  // QRIS config state
  const [qrisConfig, setQrisConfig] = useState<QrisConfig>({ expectedMerchantName: '' });
  const [qrisSaving, setQrisSaving] = useState(false);

  useEffect(() => {
    loadStats();
    loadPayhookConfig();
    loadQrisConfig();
  }, []);

  const loadStats = async () => {
    try {
      const [customers, transactions, orderGroups, groupMembers, materials, workers] = await Promise.all([
        db.customer.count(),
        db.transactions.count(),
        db.order_group.count(),
        db.group_member.count(),
        db.material.count(),
        db.worker.count(),
      ]);
      setStats({
        version: db.verno,
        customers,
        transactions,
        orderGroups,
        groupMembers,
        materials,
        workers,
      });
    } catch (err) {
      console.error('Failed to load DB stats:', err);
    }
  };

  const loadPayhookConfig = async () => {
    setPayhookLoading(true);
    try {
      // Build webhook URL from Supabase URL
      const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
      if (supabaseUrl) {
        setWebhookUrl(`${supabaseUrl}/functions/v1/payment-webhook`);
      }

      // Load config from Supabase
      const { data, error } = await trx
        .from('app_config')
        .select('key, value')
        .in('key', ['payhook_bearer_token', 'payhook_secret_key']);

      if (error) {
        console.error('Failed to load Payhook config:', error);
        return;
      }

      const config: PayhookConfig = { bearerToken: '', secretKey: '' };
      for (const row of data || []) {
        if (row.key === 'payhook_bearer_token') config.bearerToken = row.value || '';
        if (row.key === 'payhook_secret_key') config.secretKey = row.value || '';
      }
      setPayhookConfig(config);
    } catch (err) {
      console.error('Failed to load Payhook config:', err);
    } finally {
      setPayhookLoading(false);
    }
  };

  const loadQrisConfig = async () => {
    try {
      const { data, error } = await trx
        .from('app_config')
        .select('key, value')
        .eq('key', 'qris_expected_merchant');

      if (!error && data && data.length > 0) {
        setQrisConfig({ expectedMerchantName: data[0].value || '' });
      }
    } catch (err) {
      console.error('Failed to load QRIS config:', err);
    }
  };

  const saveQrisConfig = async () => {
    setQrisSaving(true);
    try {
      const { error } = await trx
        .from('app_config')
        .upsert({ key: 'qris_expected_merchant', value: qrisConfig.expectedMerchantName }, { onConflict: 'key' });

      if (error) {
        console.error('Save error:', error);
        toast.error('Gagal menyimpan konfigurasi QRIS');
        return;
      }

      toast.success('Konfigurasi QRIS berhasil disimpan');
    } catch (err) {
      console.error('Failed to save QRIS config:', err);
      toast.error('Gagal menyimpan konfigurasi');
    } finally {
      setQrisSaving(false);
    }
  };

  const savePayhookConfig = async () => {
    setPayhookSaving(true);
    try {
      // Upsert bearer token
      const { error: err1 } = await trx
        .from('app_config')
        .upsert({ key: 'payhook_bearer_token', value: payhookConfig.bearerToken }, { onConflict: 'key' });

      // Upsert secret key
      const { error: err2 } = await trx
        .from('app_config')
        .upsert({ key: 'payhook_secret_key', value: payhookConfig.secretKey }, { onConflict: 'key' });

      if (err1 || err2) {
        console.error('Save errors:', err1, err2);
        toast.error('Gagal menyimpan konfigurasi Payhook');
        return;
      }

      toast.success('Konfigurasi Payhook berhasil disimpan');
    } catch (err) {
      console.error('Failed to save Payhook config:', err);
      toast.error('Gagal menyimpan konfigurasi');
    } finally {
      setPayhookSaving(false);
    }
  };

  const copyWebhookUrl = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    toast.success('URL webhook disalin ke clipboard');
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await db.delete();
      toast.success('Database lokal berhasil direset');
      // Short delay to show the toast, then reload
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error('Failed to reset database:', err);
      toast.error('Gagal mereset database');
      setResetting(false);
      setShowResetDialog(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Pengaturan</h1>
        <p className="text-slate-500 mt-1">Kelola pengaturan aplikasi dan database lokal</p>
      </div>

      {/* Database Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Database Lokal</CardTitle>
          <CardDescription>Informasi tentang data yang tersimpan di perangkat ini</CardDescription>
        </CardHeader>
        <CardContent>
          {stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 uppercase">Versi DB</p>
                <p className="text-xl font-bold text-slate-900">v{stats.version}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 uppercase">Pelanggan</p>
                <p className="text-xl font-bold text-slate-900">{stats.customers}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 uppercase">Transaksi</p>
                <p className="text-xl font-bold text-slate-900">{stats.transactions}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 uppercase">Grup Pesanan</p>
                <p className="text-xl font-bold text-slate-900">{stats.orderGroups}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 uppercase">Anggota Grup</p>
                <p className="text-xl font-bold text-slate-900">{stats.groupMembers}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 uppercase">Bahan</p>
                <p className="text-xl font-bold text-slate-900">{stats.materials}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 uppercase">Penjahit</p>
                <p className="text-xl font-bold text-slate-900">{stats.workers}</p>
              </div>
            </div>
          ) : (
            <p className="text-slate-500">Memuat...</p>
          )}
        </CardContent>
      </Card>

      {/* Payhook Webhook Config Card */}
      <Card className="border-blue-200">
        <CardHeader>
          <CardTitle className="text-lg text-blue-700">Payhook Webhook</CardTitle>
          <CardDescription>
            Konfigurasi webhook untuk menerima notifikasi pembayaran QRIS secara otomatis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Webhook URL */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  value={webhookUrl}
                  readOnly
                  className="bg-slate-50 font-mono text-xs"
                  placeholder="Supabase URL not configured"
                />
                <Button
                  variant="outline"
                  onClick={copyWebhookUrl}
                  disabled={!webhookUrl}
                  className="shrink-0"
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Masukkan URL ini di pengaturan Payhook sebagai endpoint webhook
              </p>
            </div>

            {/* Bearer Token */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Bearer Token</Label>
              <Input
                type="password"
                value={payhookConfig.bearerToken}
                onChange={(e) => setPayhookConfig(prev => ({ ...prev, bearerToken: e.target.value }))}
                placeholder="Masukkan bearer token dari Payhook"
                disabled={payhookLoading}
              />
              <p className="text-xs text-slate-500">
                Token autentikasi dari pengaturan Payhook
              </p>
            </div>

            {/* Secret Key */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Secret Key (HMAC)</Label>
              <Input
                type="password"
                value={payhookConfig.secretKey}
                onChange={(e) => setPayhookConfig(prev => ({ ...prev, secretKey: e.target.value }))}
                placeholder="Masukkan secret key dari Payhook"
                disabled={payhookLoading}
              />
              <p className="text-xs text-slate-500">
                Secret key untuk verifikasi signature HMAC-SHA256
              </p>
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-medium mb-2">Cara kerja:</p>
              <ol className="list-decimal list-inside space-y-1 text-blue-700">
                <li>Payhook mengirim notifikasi pembayaran ke URL webhook</li>
                <li>Server memverifikasi bearer token dan signature</li>
                <li>Jika cocok, order otomatis ditandai lunas</li>
                <li>UI akan update secara realtime</li>
              </ol>
            </div>

            {/* Save Button */}
            <Button
              onClick={savePayhookConfig}
              disabled={payhookLoading || payhookSaving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {payhookSaving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* QRIS Merchant Verification Card */}
      <Card className="border-green-200">
        <CardHeader>
          <CardTitle className="text-lg text-green-700">Verifikasi QRIS Merchant</CardTitle>
          <CardDescription>
            Pastikan QR code yang digunakan milik merchant yang benar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Nama Merchant yang Diharapkan</Label>
              <Input
                value={qrisConfig.expectedMerchantName}
                onChange={(e) => setQrisConfig({ expectedMerchantName: e.target.value })}
                placeholder="Contoh: TAILOR BAPAK AHMAD"
              />
              <p className="text-xs text-slate-500">
                Masukkan nama merchant persis seperti yang tertera di QRIS (case-insensitive)
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
              <p className="font-medium mb-2">Cara kerja verifikasi:</p>
              <ol className="list-decimal list-inside space-y-1 text-green-700">
                <li>Saat generate QRIS, sistem membaca nama merchant dari QR statis</li>
                <li>Nama merchant dibandingkan dengan yang dikonfigurasi di sini</li>
                <li>Jika tidak cocok, akan muncul peringatan keamanan</li>
                <li>Ini mencegah penggunaan QRIS yang bukan milik Anda</li>
              </ol>
            </div>

            <Button
              onClick={saveQrisConfig}
              disabled={qrisSaving}
              className="bg-green-600 hover:bg-green-700"
            >
              {qrisSaving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reset Database Card */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-lg text-red-700">Reset Database Lokal</CardTitle>
          <CardDescription>
            Hapus semua data lokal di perangkat ini. Data yang sudah tersinkronisasi ke server tidak akan terpengaruh.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 shrink-0 mt-0.5">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
                </svg>
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Perhatian</p>
                  <ul className="mt-1 list-disc list-inside space-y-1">
                    <li>Data lokal yang belum tersinkronisasi akan hilang</li>
                    <li>Setelah reset, halaman akan dimuat ulang</li>
                    <li>Data dari server akan diambil ulang saat online</li>
                  </ul>
                </div>
              </div>
            </div>
            <Button
              variant="destructive"
              onClick={() => setShowResetDialog(true)}
            >
              Reset Database Lokal
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Reset Database</DialogTitle>
            <DialogDescription>
              Anda yakin ingin menghapus semua data lokal di perangkat ini? Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(false)}
              disabled={resetting}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={resetting}
            >
              {resetting ? 'Mereset...' : 'Ya, Reset Database'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
