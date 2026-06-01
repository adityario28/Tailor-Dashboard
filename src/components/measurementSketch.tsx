import { useState, useEffect } from 'react';

const OUTFIT_MAP: Record<string, string> = {
  jas: 'suit_sketch',
  kemeja: 'suit_sketch', // replace with kemeja_sketch when available
  celana: 'suit_sketch', // replace with celana_sketch when available
};

const initialState = {
  panjangBadan: '',
  lebarBahu: '',
  panjangLengan: '',
  lingkarLengan: '',
  lingkarUjungLengan: '',
  lingkarDada: '',
  lingkarPerut: '',
  lingkarPinggul: '',
};

type MeasurementKey = keyof typeof initialState;

// [order number, field key, top%, left%]
const BADGES: [number, MeasurementKey, string, string][] = [
  [1, 'panjangBadan',       '63.3%',   '57%'],
  [2, 'lebarBahu',          '29.5%', '30%'],
  [3, 'panjangLengan',      '44.5%', '87%'],
  [4, 'lingkarLengan',      '44.6%',   '9%'],
  [5, 'lingkarUjungLengan', '71.6%',   '20%'],
  [6, 'lingkarDada',        '47%',   '36%'],
  [7, 'lingkarPerut',       '56.6%', '38%'],
  [8, 'lingkarPinggul',     '66.7%',   '37%'],
];

export default function MeasurementSketch() {
  const [measurements, setMeasurements] = useState(initialState);
  const [outfitType, setOutfitType] = useState('suit_sketch');
  const [activeField, setActiveField] = useState<string | null>(null);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const { id, value } = (e as CustomEvent).detail;
      setMeasurements(prev => ({ ...prev, [id]: value }));
    };
    const handleOutfit = (e: Event) => {
      setOutfitType(OUTFIT_MAP[(e as CustomEvent).detail] ?? 'suit_sketch');
    };
    const handleReset = () => setMeasurements(initialState);
    const handleFocus = (e: Event) => setActiveField((e as CustomEvent).detail);

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

  return (
    <div className="relative w-full h-full bg-white rounded-xl border flex items-center justify-center overflow-hidden">
      <img
        src={`/images/sketches/${outfitType}.webp`}
        className="max-h-full max-w-full object-contain opacity-50"
        alt="Measurement sketch"
      />
      {BADGES.map(([num, field, top, left]) => {
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
