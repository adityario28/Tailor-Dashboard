import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function SuccessDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('order-success', handler);
    return () => window.removeEventListener('order-success', handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <svg viewBox="0 0 52 52" className="w-16 h-16">
              <circle cx="26" cy="26" r="25" fill="none" stroke="#4f46e5" strokeWidth="2"
                strokeDasharray="157" strokeDashoffset="157"
                style={{ animation: 'dash-circle 0.4s ease forwards' }} />
              <path fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                d="M14 27 l8 8 l16-16"
                strokeDasharray="40" strokeDashoffset="40"
                style={{ animation: 'dash-check 0.3s ease 0.4s forwards' }} />
              <style>{`
                @keyframes dash-circle { to { stroke-dashoffset: 0; } }
                @keyframes dash-check  { to { stroke-dashoffset: 0; } }
              `}</style>
            </svg>
          </div>
          <DialogTitle className="text-xl">Pesanan Tersimpan!</DialogTitle>
          <DialogDescription>Data pesanan berhasil disimpan.</DialogDescription>
        </DialogHeader>
        <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => setOpen(false)}>OK</Button>
      </DialogContent>
    </Dialog>
  );
}
