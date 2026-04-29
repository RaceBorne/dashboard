'use client';

/**
 * Multi-select chip picker. Used on Market analysis and Target steps
 * to let the operator narrow down the brief by clicking pre-suggested
 * options instead of typing into a blank field.
 *
 * Props:
 *   title       — question label (e.g. "Sector", "Target persona")
 *   options     — chip strings; both AI-suggested and persisted user picks
 *   selected    — currently chosen chips
 *   onChange    — fires whenever the selection changes
 *   max         — optional cap on simultaneous picks (1 = single-select radio)
 *   loading     — when true, shows a small spinner; chips dimmed
 *   onAdd       — optional. If provided, renders an inline 'add custom' input.
 */

import { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  hint?: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  max?: number;
  loading?: boolean;
  onAdd?: (value: string) => void;
}

export function ChipPicker({ title, hint, options, selected, onChange, max, loading, onAdd }: Props) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');

  function toggle(opt: string) {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt));
      return;
    }
    if (max === 1) {
      onChange([opt]);
      return;
    }
    if (max && selected.length >= max) {
      // Replace the oldest selected to keep within cap.
      onChange([...selected.slice(1), opt]);
      return;
    }
    onChange([...selected, opt]);
  }

  function commitAdd() {
    const v = value.trim();
    if (!v) {
      setAdding(false);
      return;
    }
    if (onAdd) onAdd(v);
    if (!selected.includes(v)) onChange([...selected, v]);
    setValue('');
    setAdding(false);
  }

  // Show every option, plus any selected items that aren't in options
  // (custom adds, or values that came from a previous edit cycle).
  const merged = Array.from(new Set([...options, ...selected]));

  return (
    <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
      <header className="flex items-center gap-2 mb-2">
        <h3 className="text-[12px] font-semibold text-evari-text uppercase tracking-[0.12em]">{title}</h3>
        {loading ? <Loader2 className="h-3 w-3 animate-spin text-evari-dim" /> : null}
        <span className="ml-auto text-[10px] text-evari-dimmer">
          {max === 1 ? 'pick one' : max ? `pick up to ${max}` : 'pick any'}
        </span>
      </header>
      {hint ? <p className="text-[11px] text-evari-dim mb-2">{hint}</p> : null}

      <div className="flex flex-wrap gap-1.5">
        {merged.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] border transition',
                on
                  ? 'bg-evari-gold text-evari-goldInk border-evari-gold'
                  : 'bg-evari-ink/40 text-evari-text border-evari-edge/40 hover:border-evari-gold/60',
              )}
            >
              {opt}
              {on ? <X className="h-3 w-3 opacity-70" /> : null}
            </button>
          );
        })}

        {adding ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commitAdd}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitAdd(); }
                if (e.key === 'Escape') { setValue(''); setAdding(false); }
              }}
              placeholder="Custom..."
              className="px-2.5 py-1 rounded-full text-[11px] bg-evari-ink text-evari-text border border-evari-gold/60 focus:outline-none w-32"
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] border border-dashed border-evari-edge/60 text-evari-dim hover:text-evari-text hover:border-evari-gold/60 transition"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        )}
      </div>
    </section>
  );
}
