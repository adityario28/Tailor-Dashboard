import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { trx } from '@/lib/supabase';
import { ChevronDown, ChevronRight, Search, User } from 'lucide-react';
import type { PresetCustomer, Customer } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CustomerWithPresets extends Customer {
  id: number;
  presets: PresetCustomer[];
  transaction_count?: number;
}

// ─── Sketch helpers (same badge positions as measurementSketch.tsx) ───────────
type MeasurementMap = Record<string, number | undefined>;

type Badge = [number, string, string, string]; // [num, field, top%, left%]

const SUIT_BADGES: Badge[] = [
  [1, 'panjang_badan',        '63.3%', '55%'],
  [2, 'lebar_bahu',           '32%',   '30%'],
  [3, 'panjang_lengan',       '44.5%', '87%'],
  [4, 'lingkar_lengan',       '44.1%', '17.5%'],
  [5, 'lingkar_ujung_lengan', '74%',   '17%'],
  [6, 'lingkar_dada',         '47%',   '36%'],
  [7, 'lingkar_perut',        '57.5%', '38%'],
  [8, 'lingkar_pinggul',      '69.5%', '37%'],
];

const SHORT_SHIRT_BADGES: Badge[] = [
  [1, 'lingkar_leher',  '22%',   '45%'],
  [2, 'lebar_bahu',     '28%',   '61%'],
  [3, 'panjang_lengan', '33%',   '78%'],
  [4, 'lebar_pundak',   '36.5%', '33%'],
  [5, 'lingkar_dada',   '50.8%', '34%'],
  [6, 'panjang_badan',  '58%',   '58%'],
  [7, 'lingkar_lengan', '43.2%', '19%'],
  [8, 'lingkar_pinggul','69.8%', '36%'],
];

const LONG_SHIRT_BADGES: Badge[] = [
  [1, 'lingkar_leher',       '21%',   '32%'],
  [2, 'lebar_bahu',          '27.5%', '49%'],
  [3, 'panjang_lengan',      '43%',   '81%'],
  [4, 'lingkar_dada',        '36.3%', '23%'],
  [5, 'lingkar_perut',       '51%',   '22%'],
  [6, 'panjang_badan',       '57%',   '45%'],
  [7, 'lingkar_ujung_lengan','67.5%', '88%'],
  [8, 'lingkar_pinggul',     '74.2%', '22%'],
];

function getSketchConfig(outfitType: string) {
  const lower = outfitType.toLowerCase();
  const isShort = lower.includes('kemeja') && lower.includes('pendek');
  const isLong  = lower.includes('kemeja') && lower.includes('panjang');
  return {
    file:   isShort ? 'short_shirt_sketch' : isLong ? 'long_shirt_sketch' : 'suit_sketch',
    badges: isShort ? SHORT_SHIRT_BADGES  : isLong ? LONG_SHIRT_BADGES   : SUIT_BADGES,
    clipSuit: !isShort && !isLong,
  };
}

// ─── Static sketch (props-driven, no window events) ──────────────────────────
function StaticSketch({
  outfitType,
  measurements,
}: {
  outfitType: string;
  measurements: MeasurementMap;
}) {
  const { file, badges, clipSuit } = getSketchConfig(outfitType);

  return (
    <div className="relative w-full h-full bg-white rounded-xl border flex items-center justify-center overflow-hidden min-h-[320px]">
      <img
        src={`/images/sketches/${file}.webp`}
        className="max-h-full max-w-full object-contain opacity-50"
        style={clipSuit ? { clipPath: 'inset(0 0 12px 0)' } : undefined}
        alt={`Sketch ${outfitType}`}
      />
      {badges.map(([num, field, top, left]) => (
        <div
          key={num}
          className="absolute flex items-center gap-1 px-1.5 py-0.5 rounded border shadow-sm bg-white/90"
          style={{ top, left }}
        >
          <span className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 bg-indigo-600 text-white">
            {num}
          </span>
          <span className="text-sm font-bold text-slate-800">
            {measurements[field] ?? 0}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Measurement table shown beside the sketch ────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  panjang_badan:        'Panjang Badan',
  lebar_bahu:           'Lebar Bahu',
  panjang_lengan:       'Panjang Lengan',
  lingkar_lengan:       'Lingkar Lengan',
  lingkar_ujung_lengan: 'Lingkar Ujung Lengan',
  lingkar_dada:         'Lingkar Dada',
  lingkar_perut:        'Lingkar Perut',
  lingkar_pinggul:      'Lingkar Pinggul',
  lingkar_leher:        'Lingkar Leher',
  lebar_pundak:         'Lebar Pundak',
  panjang_kain:         'Panjang Kain',
  lebar_kain:           'Lebar Kain',
};

const MEASUREMENT_FIELDS = Object.keys(FIELD_LABELS);

function MeasurementTable({ measurements }: { measurements: MeasurementMap }) {
  const filled = MEASUREMENT_FIELDS.filter(f => measurements[f] !== undefined && measurements[f] !== null && measurements[f] !== 0);
  if (filled.length === 0) return <p className="text-sm text-slate-400 italic">Tidak ada data ukuran.</p>;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {filled.map(f => (
        <div key={f} className="flex justify-between items-center border-b border-slate-100 pb-1.5">
          <span className="text-sm text-slate-500">{FIELD_LABELS[f]}</span>
          <span className="text-sm font-semibold text-slate-800">{measurements[f]} cm</span>
        </div>
      ))}
    </div>
  );
}

// ─── Badge helpers ────────────────────────────────────────────────────────────
const OUTFIT_BADGE: Record<string, string> = {
  jas:  'bg-indigo-100 text-indigo-700',
  kemeja: 'bg-sky-100 text-sky-700',
};

function outfitBadgeColor(outfit: string) {
  const lower = outfit.toLowerCase();
  if (lower.includes('jas')) return OUTFIT_BADGE.jas;
  return OUTFIT_BADGE.kemeja;
}

function OutfitBadge({ outfit }: { outfit: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${outfitBadgeColor(outfit)}`}>
      {outfit}
    </span>
  );
}

function SexBadge({ sex }: { sex?: string }) {
  if (!sex) return null;
  const isMale = sex === 'L';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isMale ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
      {isMale ? 'Laki-laki' : 'Perempuan'}
    </span>
  );
}

// ─── Customer card ────────────────────────────────────────────────────────────
function CustomerCard({
  customer,
  isExpanded,
  onToggle,
}: {
  customer: CustomerWithPresets;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [activePresetIdx, setActivePresetIdx] = useState(0);
  const preset = customer.presets[activePresetIdx];

  // Reset preset index when collapsed
  const handleToggle = () => {
    if (isExpanded) setActivePresetIdx(0);
    onToggle();
  };

  const presetMeasurements: MeasurementMap = preset ? {
    panjang_badan:        preset.panjang_badan,
    lebar_bahu:           preset.lebar_bahu,
    panjang_lengan:       preset.panjang_lengan,
    lingkar_lengan:       preset.lingkar_lengan,
    lingkar_ujung_lengan: preset.lingkar_ujung_lengan,
    lingkar_dada:         preset.lingkar_dada,
    lingkar_perut:        preset.lingkar_perut,
    lingkar_pinggul:      preset.lingkar_pinggul,
    lingkar_leher:        preset.lingkar_leher,
    lebar_pundak:         preset.lebar_pundak,
    panjang_kain:         preset.panjang_kain,
    lebar_kain:           preset.lebar_kain,
  } : {};

  return (
    <Card className="overflow-hidden py-3">
      {/* Accordion header */}
      <div
        className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-slate-50 transition-colors select-none"
        onClick={handleToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isExpanded
            ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 shrink-0">
            <User className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{customer.name}</p>
            {customer.phone && (
              <p className="text-xs text-slate-400">{customer.phone}</p>
            )}
          </div>
        </div>

        {/* Right badges */}
        <div className="flex items-center gap-2 ml-3 shrink-0 flex-wrap justify-end">
          <SexBadge sex={customer.sex} />
          {customer.presets.length > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {customer.presets.length} preset
            </span>
          )}
          {(customer.transaction_count ?? 0) > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              {customer.transaction_count} pesanan
            </span>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t bg-slate-50">
          {customer.presets.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-400 text-sm">
              Belum ada preset ukuran tersimpan.
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Preset switcher tabs */}
              {customer.presets.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {customer.presets.map((p, idx) => (
                    <button
                      key={p.id ?? idx}
                      onClick={e => { e.stopPropagation(); setActivePresetIdx(idx); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                        activePresetIdx === idx
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {p.preset_name || `Preset ${idx + 1}`}
                      {p.outfit_type && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                          activePresetIdx === idx
                            ? 'bg-white/20 text-white'
                            : outfitBadgeColor(p.outfit_type)
                        }`}>
                          {p.outfit_type}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Active preset: outfit badge + sketch + measurements */}
              {preset && (
                <>
                  {/* Outfit type badge header */}
                  <div className="flex items-center gap-2">
                    {preset.outfit_type && <OutfitBadge outfit={preset.outfit_type} />}
                    {preset.cuci_sebelum_potong && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
                        Cuci dulu
                      </span>
                    )}
                  </div>

                  {/* Sketch + measurements side by side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="h-[30rem]">
                      <StaticSketch
                        outfitType={preset.outfit_type ?? 'Jas'}
                        measurements={presetMeasurements}
                      />
                    </div>
                    <div className="bg-white rounded-xl border p-5">
                      <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                        Detail Ukuran
                      </p>
                      <MeasurementTable measurements={presetMeasurements} />
                      {(preset.panjang_kain || preset.lebar_kain) && (
                        <div className="mt-4 pt-4 border-t border-slate-100 flex gap-4">
                          {preset.panjang_kain && (
                            <div className="text-sm">
                              <span className="text-slate-400">Panjang Kain</span>
                              <p className="font-semibold text-slate-800">{preset.panjang_kain} cm</p>
                            </div>
                          )}
                          {preset.lebar_kain && (
                            <div className="text-sm">
                              <span className="text-slate-400">Lebar Kain</span>
                              <p className="font-semibold text-slate-800">{preset.lebar_kain} cm</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const PAGE_SIZE = 10;

export default function CustomerList() {
  const [customers, setCustomers] = useState<CustomerWithPresets[]>([]);
  const [filtered, setFiltered] = useState<CustomerWithPresets[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch customers, presets, transaction counts in parallel
      const [
        { data: custData },
        { data: presetData },
        { data: trxData },
      ] = await Promise.all([
        trx.from('customer').select('*').order('name', { ascending: true }),
        trx.from('preset_customer').select('*'),
        trx.from('transaction').select('customer_id'),
      ]);

      const customers = (custData ?? []) as Customer[];
      const presets   = (presetData ?? []) as PresetCustomer[];
      const trxRows   = (trxData ?? []) as { customer_id: number }[];

      // Count transactions per customer
      const trxCount = new Map<number, number>();
      for (const t of trxRows) {
        trxCount.set(t.customer_id, (trxCount.get(t.customer_id) ?? 0) + 1);
      }

      // Group presets by customer_id
      const presetMap = new Map<number, PresetCustomer[]>();
      for (const p of presets) {
        const arr = presetMap.get(p.customer_id) ?? [];
        arr.push(p);
        presetMap.set(p.customer_id, arr);
      }

      const merged: CustomerWithPresets[] = customers
        .filter(c => c.id !== undefined)
        .map(c => ({
          ...c,
          id: c.id!,
          presets: presetMap.get(c.id!) ?? [],
          transaction_count: trxCount.get(c.id!) ?? 0,
        }));

      setCustomers(merged);
    } catch (err) {
      console.error('CustomerList error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter on search change
  useEffect(() => {
    const q = search.toLowerCase().trim();
    const result = q
      ? customers.filter(c =>
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? '').includes(q)
        )
      : customers;
    setFiltered(result);
    setPage(1);
    setExpanded(null);
  }, [search, customers]);

  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Pelanggan</h1>
        <p className="text-slate-500 text-sm mt-1">Data pelanggan beserta preset ukuran tersimpan.</p>
      </div>

      {/* Search bar */}
      <Card className="py-3">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Cari nama atau nomor telepon..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <span className="text-sm text-slate-500 shrink-0">
              {loading ? '...' : `${filtered.length} pelanggan`}
            </span>
          </div>
        </CardHeader>
      </Card>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Card key={i} className="py-3">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : paginated.length === 0 ? (
        <Card className="py-3">
          <CardContent className="py-12 text-center text-slate-400">
            {search ? 'Tidak ada pelanggan yang cocok.' : 'Belum ada pelanggan.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {paginated.map(c => (
            <CustomerCard
              key={c.id}
              customer={c}
              isExpanded={expanded === c.id}
              onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
            />
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => { setPage(p => p - 1); setExpanded(null); }}
              >
                Sebelumnya
              </Button>
              <span className="text-sm text-slate-500 px-3">{page} / {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => { setPage(p => p + 1); setExpanded(null); }}
              >
                Selanjutnya
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
