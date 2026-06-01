import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/db';
import { trx } from '@/lib/supabase';
import type { Customer, PresetCustomer } from '@/lib/db';

type CustomerWithId = Customer & { id: number };

export default function CustomerSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<(CustomerWithId & { _source: 'local' | 'remote' })[]>([]);
  const [selected, setSelected] = useState<CustomerWithId | null>(null);
  const [presets, setPresets] = useState<PresetCustomer[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const skipSearch = useRef(false);

  useEffect(() => {
    if (skipSearch.current) { skipSearch.current = false; return; }
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(query), 200);
  }, [query]);

  useEffect(() => {
    const handleReset = () => {
      setQuery('');
      setSelected(null);
      setPresets([]);
      setResults([]);
      setOpen(false);
    };
    window.addEventListener('measurement-reset', handleReset);
    return () => window.removeEventListener('measurement-reset', handleReset);
  }, []);

  async function search(q: string) {
    const lower = q.toLowerCase();

    // Dexie: filter all customers by name containing query
    const local = (await db.customer.toArray()) as CustomerWithId[];
    const localMatches = local.filter(c => c.name.toLowerCase().includes(lower));

    // Supabase: ilike search
    let remoteMatches: CustomerWithId[] = [];
    if (navigator.onLine) {
      const { data } = await trx
        .from('customer')
        .select('*')
        .ilike('name', `%${q}%`)
        .limit(10);
      if (data) remoteMatches = data as CustomerWithId[];
    }

    // Merge: prefer local, deduplicate by name+phone
    const seen = new Set(localMatches.map(c => `${c.name}|${c.phone}`));
    const merged = [
      ...localMatches.map(c => ({ ...c, _source: 'local' as const })),
      ...remoteMatches
        .filter(c => !seen.has(`${c.name}|${c.phone}`))
        .map(c => ({ ...c, _source: 'remote' as const })),
    ];

    setResults(merged);
    setOpen(true);
  }

  async function selectCustomer(c: CustomerWithId & { _source: 'local' | 'remote' }) {
    setSelected(c);
    setOpen(false);
    skipSearch.current = true;
    setQuery(c.name);

    // Load presets: use Dexie for local customers, Supabase for remote-only
    let allPresets: PresetCustomer[] = [];
    if (c._source === 'local') {
      allPresets = await db.preset_customer.where('customer_id').equals(c.id).toArray();
      // Also fetch from Supabase using the Supabase customer ID (look up by name)
      if (navigator.onLine) {
        const { data: custData } = await trx.from('customer').select('id').eq('name', c.name).single();
        if (custData?.id) {
          const { data } = await trx.from('preset_customer').select('*').eq('customer_id', custData.id);
          if (data) {
            const seen = new Set(allPresets.map(p => p.preset_name));
            allPresets = [...allPresets, ...(data as PresetCustomer[]).filter(p => !seen.has(p.preset_name))];
          }
        }
      }
    } else {
      // Remote-only customer: only query Supabase with its actual ID
      if (navigator.onLine) {
        const { data } = await trx.from('preset_customer').select('*').eq('customer_id', c.id);
        if (data) allPresets = data as PresetCustomer[];
      }
    }
    setPresets(allPresets);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          id="name"
          required
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(null); setPresets([]); }}
          placeholder="Cari nama pelanggan... atau kosongkan untuk pelanggan baru"
          className="w-full h-12 px-4 py-3 rounded-md border-2 border-input bg-background text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {open && results.length > 0 && (
          <ul className="absolute z-50 w-full mt-1 bg-white border-2 border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto">
            {results.map(c => (
              <li
                key={`${c._source}-${c.id}`}
                onClick={() => selectCustomer(c)}
                className="px-4 py-3 cursor-pointer hover:bg-indigo-50 border-b last:border-0"
              >
                <span className="font-medium">{c.name}</span>
                {c.phone && <span className="ml-2 text-sm text-slate-500">{c.phone}</span>}
              </li>
            ))}
            <li
              onClick={() => { setOpen(false); setSelected(null); setPresets([]); window.dispatchEvent(new CustomEvent("customer-selected", { detail: { isNew: true } })); }}
              className="px-4 py-3 cursor-pointer hover:bg-green-50 text-green-700 font-medium"
            >
              + Pelanggan Baru
            </li>
          </ul>
        )}
        {open && results.length === 0 && query.trim() && (
          <div className="absolute z-50 w-full mt-1 bg-white border-2 border-slate-200 rounded-md shadow-lg">
            <div
              onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("customer-selected", { detail: { isNew: true } })); }}
              className="px-4 py-3 cursor-pointer hover:bg-green-50 text-green-700 font-medium"
            >
              + Pelanggan Baru: "{query}"
            </div>
          </div>
        )}
      </div>

      {selected && presets.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-600">Pilih profil ukuran tersimpan:</p>
          <div className="flex flex-wrap gap-2">
            {presets.map(p => (
              <button
                key={p.preset_name}
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("customer-selected", { detail: { isNew: false, customer: selected, preset: p } }))}
                className="px-4 py-2 rounded-full border-2 border-indigo-300 text-indigo-700 text-sm font-medium hover:bg-indigo-50"
              >
                {p.preset_name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("customer-selected", { detail: { isNew: false, customer: selected, preset: undefined } }))}
              className="px-4 py-2 rounded-full border-2 border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50"
            >
              Ukuran baru
            </button>
          </div>
        </div>
      )}

      {selected && presets.length === 0 && (
        <p className="text-sm text-slate-500">
          Pelanggan dipilih: <strong>{selected.name}</strong> — belum ada profil ukuran tersimpan.
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("customer-selected", { detail: { isNew: false, customer: selected, preset: undefined } }))}
            className="ml-2 text-indigo-600 underline"
          >
            Lanjut input ukuran baru
          </button>
        </p>
      )}
    </div>
  );
}
