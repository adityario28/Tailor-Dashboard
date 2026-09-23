import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { parseQRIS, convertQRIS } from '@/lib/qris';
import type { QRISData } from '@/lib/qris';
import { trx } from '@/lib/supabase';

interface QrisGeneratorProps {
  amount: number;
  orderId?: number;
  onClose?: () => void;
  hideHeader?: boolean;
}

export default function QrisGenerator({ amount, orderId, onClose, hideHeader = false }: QrisGeneratorProps) {
  const [qrisString, setQrisString] = useState('');
  const [parsedData, setParsedData] = useState<QRISData | null>(null);
  const [dynamicQris, setDynamicQris] = useState('');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [expectedMerchant, setExpectedMerchant] = useState('');
  const [merchantMismatch, setMerchantMismatch] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Only run on client
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load expected merchant name from config
  useEffect(() => {
    if (!isMounted) return;
    
    const loadExpectedMerchant = async () => {
      try {
        const { data } = await trx
          .from('app_config')
          .select('value')
          .eq('key', 'qris_expected_merchant')
          .single();
        
        if (data?.value) {
          setExpectedMerchant(data.value);
        }
      } catch (err) {
        // Config not set, skip verification
      }
    };
    
    loadExpectedMerchant();
  }, [isMounted]);

  // Auto-load QRIS from static image on mount
  useEffect(() => {
    if (isMounted) {
      loadStaticQris();
    }
  }, [isMounted]);

  // Auto-generate when QRIS loaded and amount is set
  useEffect(() => {
    if (qrisString && parsedData && amount > 0) {
      generateDynamicQris();
    }
  }, [qrisString, parsedData, amount]);

  // Re-verify merchant when config loads after QRIS is already parsed
  useEffect(() => {
    if (expectedMerchant && parsedData?.merchantName) {
      const actualName = parsedData.merchantName.toLowerCase().trim();
      const expected = expectedMerchant.toLowerCase().trim();
      if (!actualName.includes(expected) && !expected.includes(actualName)) {
        setMerchantMismatch(true);
      } else {
        setMerchantMismatch(false);
      }
    }
  }, [expectedMerchant, parsedData]);

  const loadStaticQris = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      // Dynamically import jsQR only on client
      const jsQR = (await import('jsqr')).default;
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) {
          setError('Canvas not ready');
          setIsLoading(false);
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setError('Canvas context error');
          setIsLoading(false);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
          setQrisString(code.data);
          
          // Parse QRIS data
          try {
            const data = parseQRIS(code.data);
            setParsedData(data);
            
            // Verify merchant name if config is set
            if (expectedMerchant && data.merchantName) {
              const actualName = data.merchantName.toLowerCase().trim();
              const expected = expectedMerchant.toLowerCase().trim();
              if (!actualName.includes(expected) && !expected.includes(actualName)) {
                setMerchantMismatch(true);
                console.warn('Merchant mismatch! Expected:', expectedMerchant, 'Got:', data.merchantName);
              } else {
                setMerchantMismatch(false);
              }
            }
          } catch (err) {
            setError('Format QRIS tidak valid');
          }
        } else {
          setError('Tidak dapat membaca QR code dari gambar');
        }
        setIsLoading(false);
      };

      img.onerror = () => {
        setError('Gagal load gambar QRIS');
        setIsLoading(false);
      };

      img.src = '/images/qris-static.jpeg';
    } catch (err) {
      setError('Error loading QRIS');
      setIsLoading(false);
    }
  };

  const generateDynamicQris = async () => {
    if (!qrisString || !parsedData || amount <= 0) return;

    try {
      // Dynamically import QRCode only on client
      const QRCode = (await import('qrcode')).default;
      
      // Use original amount (no modification)
      const reference = orderId ? `ORDER-${orderId}` : undefined;
      const dynamic = convertQRIS(qrisString, { amount, reference });
      setDynamicQris(dynamic);

      // Generate QR image
      const url = await QRCode.toDataURL(dynamic, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      setQrImageUrl(url);
      setError('');
    } catch (err) {
      setError('Gagal generate QRIS dinamis');
    }
  };

  // Copy QRIS string
  const handleCopy = async () => {
    if (!dynamicQris) return;
    await navigator.clipboard.writeText(dynamicQris);
    alert('QRIS string copied!');
  };

  // Download QR image
  const handleDownload = () => {
    if (!qrImageUrl) return;
    const link = document.createElement('a');
    link.download = `qris-${orderId ? `order-${orderId}-` : ''}${amount}.png`;
    link.href = qrImageUrl;
    link.click();
  };

  // Don't render anything until mounted on client
  if (!isMounted) {
    return hideHeader ? (
      <div className="p-4 text-center py-8">
        <div className="animate-pulse w-8 h-8 bg-slate-200 rounded-full mx-auto mb-3"></div>
        <p className="text-sm text-slate-500">Memuat QRIS...</p>
      </div>
    ) : (
      <Card className="w-full max-w-sm mx-auto">
        <div className="p-4 text-center py-8">
          <div className="animate-pulse w-8 h-8 bg-slate-200 rounded-full mx-auto mb-3"></div>
          <p className="text-sm text-slate-500">Memuat QRIS...</p>
        </div>
      </Card>
    );
  }

  const content = (
    <>
      {/* Hidden canvas for image processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Loading state */}
      {isLoading && (
        <div className="text-center py-8">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-sm text-slate-500">Memuat QRIS...</p>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm text-center">
          {error}
          <Button 
            onClick={loadStaticQris} 
            variant="outline" 
            size="sm"
            className="mt-3"
          >
            Coba Lagi
          </Button>
        </div>
      )}

      {/* QR Result */}
      {qrImageUrl && !isLoading && !error && (
        <div className="text-center space-y-2">
          {/* Merchant mismatch warning */}
          {merchantMismatch && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-2 text-xs text-red-700">
              <span className="font-bold">⚠️ PERINGATAN:</span> Merchant tidak sesuai!
              <br />
              <span className="text-red-600">Diharapkan: {expectedMerchant}</span>
              <br />
              <span className="text-red-600">Ditemukan: {parsedData?.merchantName}</span>
            </div>
          )}

          {/* Verified merchant badge */}
          {!merchantMismatch && expectedMerchant && parsedData?.merchantName && (
            <div className="bg-green-50 border border-green-300 rounded-lg p-1.5 text-xs text-green-700">
              ✓ Merchant terverifikasi
            </div>
          )}

          {/* Amount display */}
          <div className="bg-indigo-50 rounded-lg p-2">
            <p className="text-xl font-bold text-indigo-700">
              Rp {amount.toLocaleString('id-ID')}
            </p>
          </div>

          {/* QR Code - smaller size */}
          <div className="bg-white p-2 rounded-lg border border-slate-200 inline-block">
            <img
              src={qrImageUrl}
              alt="QRIS Payment"
              className="mx-auto w-48 h-48"
            />
          </div>

          {/* Merchant info + Instructions combined */}
          <p className="text-xs text-slate-500">
            {parsedData?.merchantName && <span className="font-medium">{parsedData.merchantName} • </span>}
            Scan dengan e-wallet
          </p>
        </div>
      )}
    </>
  );

  if (hideHeader) {
    return <div className="w-full max-w-sm mx-auto">{content}</div>;
  }

  return (
    <Card className="w-full max-w-sm mx-auto">
      <CardHeader className="border-b pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Pembayaran QRIS</span>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              ✕
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <div className="p-4">
        {content}
      </div>
    </Card>
  );
}
