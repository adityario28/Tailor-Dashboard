import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type SortDir = 'asc' | 'desc';
export interface SortEntry<K extends string = string> {
  key: K;
  dir: SortDir;
}

interface SortPanelProps<K extends string> {
  stack: SortEntry<K>[];
  onChange: (stack: SortEntry<K>[]) => void;
  columns: { key: K; label: string }[];
  defaultStack?: SortEntry<K>[];
}

export function SortPanel<K extends string>({
  stack,
  onChange,
  columns,
  defaultStack = [],
}: SortPanelProps<K>) {
  const [open, setOpen] = useState(false);

  // Columns not yet in stack
  const available = columns.filter(c => !stack.some(s => s.key === c.key));

  function addColumn(key: K) {
    onChange([...stack, { key, dir: 'asc' }]);
  }

  function toggleDir(idx: number) {
    onChange(stack.map((s, i) => i === idx ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : s));
  }

  function removeEntry(idx: number) {
    const next = stack.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : defaultStack);
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...stack];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
  }

  function moveDown(idx: number) {
    if (idx === stack.length - 1) return;
    const next = [...stack];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next);
  }

  function reset() {
    onChange(defaultStack);
  }

  const isMulti = stack.length > 1;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-9 gap-1.5 text-sm shrink-0 ${isMulti ? 'border-indigo-400 text-indigo-600' : ''}`}
        >
          {/* Sort icon */}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/>
          </svg>
          Urutkan
          {isMulti && (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
              {stack.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-semibold text-slate-700">Urutan kolom</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Atur prioritas pengurutan. Baris pertama adalah utama.
          </p>
        </div>

        {/* Current sort stack */}
        <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
          {stack.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">Belum ada urutan diterapkan.</p>
          ) : (
            stack.map((entry, idx) => {
              const col = columns.find(c => c.key === entry.key);
              return (
                <div key={entry.key} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border">
                  {/* Priority badge */}
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold shrink-0">
                    {idx + 1}
                  </span>

                  {/* Column label */}
                  <span className="flex-1 text-sm font-medium text-slate-700 truncate">
                    {col?.label ?? entry.key}
                  </span>

                  {/* Direction toggle */}
                  <button
                    onClick={() => toggleDir(idx)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-white border hover:bg-slate-50 transition-colors"
                    title={entry.dir === 'asc' ? 'A→Z / Terkecil dulu' : 'Z→A / Terbesar dulu'}
                  >
                    {entry.dir === 'asc' ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
                        ASC
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                        DESC
                      </>
                    )}
                  </button>

                  {/* Move up/down */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      className="flex items-center justify-center w-5 h-4 rounded text-slate-400 hover:text-slate-700 disabled:opacity-25"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                    </button>
                    <button
                      onClick={() => moveDown(idx)}
                      disabled={idx === stack.length - 1}
                      className="flex items-center justify-center w-5 h-4 rounded text-slate-400 hover:text-slate-700 disabled:opacity-25"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                    </button>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeEntry(idx)}
                    className="flex items-center justify-center w-6 h-6 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Hapus"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Add column */}
        {available.length > 0 && (
          <div className="px-3 pb-3">
            <Select onValueChange={(v) => addColumn(v as K)}>
              <SelectTrigger className="h-8 text-xs text-slate-500 border-dashed">
                <SelectValue placeholder="+ Tambah kolom urutan..." />
              </SelectTrigger>
              <SelectContent>
                {available.map(c => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Footer */}
        <div className="px-3 pb-3 flex justify-between items-center border-t pt-3">
          <button
            onClick={reset}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Reset ke default
          </button>
          <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700" onClick={() => setOpen(false)}>
            Terapkan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
