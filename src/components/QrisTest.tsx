import { useState, useRef } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseQRIS, convertQRIS } from '@/lib/qris';
import type { QRISData } from '@/lib/qris';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/currency';
import jsQR from 'jsqr';
import QRCode from 'qrcode';

export default function QrisTest() {
  const [qrisString, setQrisString] = useState('');
  const [parsedData, setParsedData] = useState<QRISData | null>(null);
  const [parseError, setParseError] = useState('');
  const [amount, setAmount] = useState('');
  const [dynamicQris, setDynamicQris] = useState('');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Handle file upload and decode QR
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        setQrisString(code.data);
        handleParse(code.data);
      } else {
        setParseError('Tidak dapat membaca QR code dari gambar. Coba gambar lain atau paste manual.');
        setParsedData(null);
      }
    };

    img.src = URL.createObjectURL(file);
  };

  // Parse QRIS string
  const handleParse = (str: string) => {
    if (!str.trim()) {
      setParseError('');
      setParsedData(null);
      return;
    }

    try {
      const data = parseQRIS(str.trim());
      setParsedData(data);
      setParseError('');
    } catch (err) {
      setParseError('Format QRIS tidak valid.');
      setParsedData(null);
    }
  };

  // Generate dynamic QRIS
  const handleGenerate = async () => {
    if (!qrisString || !parsedData) return;
    
    const amountNum = parseCurrencyInput(amount);
    if (amountNum <= 0) {
      setParseError('Masukkan nominal yang valid.');
      return;
    }

    setIsGenerating(true);
    try {
      const dynamic = convertQRIS(qrisString, { amount: amountNum });
      setDynamicQris(dynamic);

      // Generate QR image
      const url = await QRCode.toDataURL(dynamic, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      setQrImageUrl(url);
      setParseError('');
    } catch (err) {
      setParseError('Gagal generate QRIS dinamis.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Download QR image
  const handleDownload = () => {
    if (!qrImageUrl) return;
    const link = document.createElement('a');
    link.download = `qris-${parseCurrencyInput(amount)}.png`;
    link.href = qrImageUrl;
    link.click();
  };

  // Copy QRIS string
  const handleCopy = async () => {
    if (!dynamicQris) return;
    await navigator.clipboard.writeText(dynamicQris);
    alert('QRIS string copied!');
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-2xl">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-xl">QRIS Static → Dynamic Test</CardTitle>
          <p className="text-sm text-slate-500">
            Upload gambar QRIS statis, masukkan nominal, dan generate QR dinamis
          </p>
        </CardHeader>

        <div className="p-6 space-y-6">
          {/* Step 1: Input */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Step 1: Input QRIS</Label>
            
            {/* File upload */}
            <div 
              className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-all"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="text-4xl mb-2">📁</div>
              <p className="text-sm text-slate-600 font-medium">
                Klik untuk upload gambar QR
              </p>
              <p className="text-xs text-slate-400 mt-1">
                PNG, JPG, atau foto QRIS sticker
              </p>
            </div>

            {/* Manual input */}
            <div className="space-y-2">
              <Label className="text-sm text-slate-500">Atau paste QRIS string manual:</Label>
              <textarea
                value={qrisString}
                onChange={(e) => {
                  setQrisString(e.target.value);
                  handleParse(e.target.value);
                }}
                placeholder="00020101021126570011ID.DANA.WWW..."
                className="w-full min-h-[80px] rounded-md border-2 border-input bg-background px-3 py-2 text-sm font-mono resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Hidden canvas for image processing */}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Error message */}
          {parseError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {parseError}
            </div>
          )}

          {/* Step 2: Parsed info */}
          {parsedData && (
            <div className="space-y-3">
              <Label className="text-base font-semibold">Step 2: Info QRIS</Label>
              <div className="p-4 rounded-xl bg-green-50 border border-green-200 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✅</span>
                  <span className="text-sm"><strong>Merchant:</strong> {parsedData.merchantName || '(tidak ada)'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">📍</span>
                  <span className="text-sm"><strong>Kota:</strong> {parsedData.merchantCity || '(tidak ada)'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">📋</span>
                  <span className="text-sm"><strong>Method:</strong> {parsedData.method === 'static' ? 'Static' : 'Dynamic'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">💰</span>
                  <span className="text-sm"><strong>Currency:</strong> IDR ({parsedData.currency})</span>
                </div>
                {parsedData.amount && (
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">💵</span>
                    <span className="text-sm"><strong>Amount:</strong> Rp {parseInt(parsedData.amount).toLocaleString('id-ID')}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Amount input */}
          {parsedData && parsedData.method === 'static' && (
            <div className="space-y-3">
              <Label className="text-base font-semibold">Step 3: Masukkan Nominal</Label>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(formatCurrencyInput(e.target.value))}
                    placeholder="250.000"
                    type="text"
                    inputMode="numeric"
                    className="h-12 text-lg font-semibold"
                  />
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !amount}
                  className="h-12 px-6 bg-indigo-600 hover:bg-indigo-700 font-semibold"
                >
                  {isGenerating ? 'Generating...' : '🔄 Generate'}
                </Button>
              </div>
            </div>
          )}

          {/* Already dynamic warning */}
          {parsedData && parsedData.method === 'dynamic' && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
              QRIS ini sudah dinamis dengan nominal Rp {parseInt(parsedData.amount || '0').toLocaleString('id-ID')}
            </div>
          )}

          {/* Step 4: Result */}
          {qrImageUrl && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">Step 4: Hasil QRIS Dinamis</Label>
              <div className="p-6 rounded-xl bg-slate-50 border text-center">
                <img
                  src={qrImageUrl}
                  alt="Dynamic QRIS"
                  className="mx-auto mb-4 rounded-lg shadow-md"
                />
                <p className="text-2xl font-bold text-slate-900 mb-1">
                  Rp {parseCurrencyInput(amount).toLocaleString('id-ID')}
                </p>
                <p className="text-sm text-slate-500">
                  {parsedData?.merchantName}
                </p>
                
                <div className="flex gap-3 justify-center mt-4">
                  <Button
                    onClick={handleDownload}
                    variant="outline"
                    className="font-medium"
                  >
                    ⬇️ Download QR
                  </Button>
                  <Button
                    onClick={handleCopy}
                    variant="outline"
                    className="font-medium"
                  >
                    📋 Copy String
                  </Button>
                </div>
              </div>

              {/* Raw QRIS string */}
              <div className="space-y-2">
                <Label className="text-sm text-slate-500">QRIS String (Dynamic):</Label>
                <textarea
                  value={dynamicQris}
                  readOnly
                  className="w-full min-h-[60px] rounded-md border-2 border-input bg-slate-100 px-3 py-2 text-xs font-mono resize-none"
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Info box */}
      <div className="mt-6 p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <p className="font-semibold mb-1">Cara kerja:</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-700">
          <li>Upload foto QRIS statis dari bank/e-wallet</li>
          <li>Sistem membaca dan parse data merchant</li>
          <li>Masukkan nominal pembayaran</li>
          <li>Generate QR baru dengan nominal tertanam</li>
          <li>Customer scan → nominal sudah terisi otomatis</li>
        </ol>
      </div>
    </div>
  );
}
