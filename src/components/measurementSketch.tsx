import { useState, useEffect } from 'react';

const isKemejaLenganPendek = (outfit: string) =>
  outfit.toLowerCase().includes('kemeja') && outfit.toLowerCase().includes('pendek');

const isKemejaLenganPanjang = (outfit: string) =>
  outfit.toLowerCase().includes('kemeja') && outfit.toLowerCase().includes('panjang');

const initialState = {
  panjangBadan: '',
  lebarBahu: '',
  panjangLengan: '',
  lingkarLengan: '',
  lingkarUjungLengan: '',
  lingkarDada: '',
  lingkarPerut: '',
  lingkarPinggul: '',
  lingkarLeher: '',
  lebarPundak: '',
};

type MeasurementKey = keyof typeof initialState;

// [order number, field key, top%, left%]
type Badge = [number, MeasurementKey, string, string];

const SUIT_BADGES: Badge[] = [
  [1, 'panjangBadan',       '63.3%', '55%'],
  [2, 'lebarBahu',          '32%', '30%'],
  [3, 'panjangLengan',      '44.5%', '87%'],
  [4, 'lingkarLengan',      '44.1%',  '17.5%'],
  [5, 'lingkarUjungLengan', '74%', '17%'],
  [6, 'lingkarDada',        '47%',   '36%'],
  [7, 'lingkarPerut',       '57.5%', '38%'],
  [8, 'lingkarPinggul',     '69.5%', '37%'],
];

const SHORT_SHIRT_BADGES: Badge[] = [
  [1, 'lingkarLeher',  '22%',   '45%'],
  [2, 'lebarBahu',     '28%',   '61%'],
  [3, 'panjangLengan', '33%',   '78%'],
  [4, 'lebarPundak',   '36.5%',   '33%'],
  [5, 'lingkarDada',   '50.8%',   '34%'],
  [6, 'panjangBadan',  '58%',   '58%'],
  [7, 'lingkarLengan', '43.2%',    '19%'],
  [8, 'lingkarPinggul','69.8%',   '36%'],
];

const LONG_SHIRT_BADGES: Badge[] = [
  [1, 'lingkarLeher',       '21%', '32%'],
  [2, 'lebarBahu',          '27.5%', '49%'],
  [3, 'panjangLengan',      '43%',   '81%'],
  [4, 'lingkarDada',        '36.3%',   '23%'],
  [5, 'lingkarPerut',       '51%',   '22%'],
  [6, 'panjangBadan',       '57%',   '45%'],
  [7, 'lingkarUjungLengan', '67.5%',   '88%'],
  [8, 'lingkarPinggul',     '74.2%',   '22%'],
];

export default function MeasurementSketch() {
  const [measurements, setMeasurements] = useState(initialState);
  const [outfitRaw, setOutfitRaw] = useState('Jas');
  const [activeField, setActiveField] = useState<string | null>(null);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const { id, value } = (e as CustomEvent).detail;
      setMeasurements(prev => ({ ...prev, [id]: value }));
    };
    const handleOutfit = (e: Event) => {
      const val = (e as CustomEvent).detail;
      if (val) {
        setOutfitRaw(val);
        (window as any).__lastOutfit = val;
      }
    };
    const handleReset = () => setMeasurements(initialState);
    const handleFocus = (e: Event) => setActiveField((e as CustomEvent).detail);

    // Replay anything that fired before this component mounted
    const cached = (window as any).__lastOutfit;
    if (cached) setOutfitRaw(cached);
    const cachedM = (window as any).__lastMeasurements;
    if (cachedM) setMeasurements(prev => ({ ...prev, ...cachedM }));

    window.addEventListener('measurement-update', handleUpdate);
    window.addEventListener('outfit-update', handleOutfit);
    window.addEventListener('measurement-reset', handleReset);
    window.addEventListener('measurement-focus', handleFocus);
    return () => {
      window.removeEventListener('measurement-update', handleUpdate);
      window.removeEventListener('outfit-update', handleOutfit);
      window.removeEventListener('measurement-reset', handleReset);
      window.removeEventListener('measurement-focus', handleFocus);
    };
  }, []);

  const isShortShirt = isKemejaLenganPendek(outfitRaw);
  const isLongShirt = isKemejaLenganPanjang(outfitRaw);
  const sketchFile = isShortShirt ? 'short_shirt_sketch' : isLongShirt ? 'long_shirt_sketch' : 'suit_sketch';
  const badges = isShortShirt ? SHORT_SHIRT_BADGES : isLongShirt ? LONG_SHIRT_BADGES : SUIT_BADGES;
  return (
      <div className="relative w-full h-full bg-white rounded-xl border flex items-center justify-center overflow-hidden">
      <img
        src={`/images/sketches/${sketchFile}.webp`}
        className="max-h-full max-w-full object-contain opacity-50"
        style={!isShortShirt && !isLongShirt ? { clipPath: 'inset(0 0 12px 0)' } : undefined}
        alt="Measurement sketch"
      />
      {badges.map(([num, field, top, left]) => {
        const isActive = activeField === field;
        return (
          <div
            key={num}
            className={`absolute flex items-center gap-1 px-1.5 py-0.5 rounded border shadow-sm transition-all ${isActive ? 'bg-indigo-600 border-indigo-700 scale-110' : 'bg-white/90'}`}
            style={{ top, left }}
          >
            <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 ${isActive ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'}`}>
              {num}
            </span>
            <span className={`text-sm font-bold ${isActive ? 'text-white' : ''}`}>
              {measurements[field] || '0'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
