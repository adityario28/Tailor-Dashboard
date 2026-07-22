export function formatCurrency(value: number | string | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!num || isNaN(num)) return 'Rp 0';
  
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function parseCurrencyInput(value: string): number {
  if (!value) return 0;
  // Remove all non-digit characters (including dots used as thousand separators)
  const digits = value.replace(/\D/g, '');
  return parseInt(digits) || 0;
}

export function formatCurrencyInput(value: string): string {
  // Remove non-digits
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  
  // Format with thousand separators
  const num = parseInt(digits);
  return num.toLocaleString('id-ID');
}
