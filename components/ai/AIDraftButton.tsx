'use client';

/**
 * Drop-in AI sparkle button. Sits next to a text input or textarea
 * and offers contextual rewrites grounded in the evari-copy voice.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

type DraftField = 'subject' | 'body' | 'list_name' | 'list_description' | 'lead_note' | 'free';
type DraftMode = 'draft' | 'rewrite-warmer' | 'shorten' | 'rewrite-brand' | 'expand';

interface Props {
  field: DraftField;
  value?: string;
  context?: string;
  onApply: (next: string) => void;
  className?: string;
  compact?: boolean;
}

export function AIDraftButton({ field, value, context, onApply, className, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<DraftMode | null>(null);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function run(mode: DraftMode, variants: number) {
    if (busy) return;
    setBusy(mode); setError(null);
    try {
      const res = await fetch('/api/ai/draft', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ field, mode, value: value ?? '', context: context ?? '', variants }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? 'AI failed');
      setSuggestions(Array.isArray(json.suggestions) && json.suggestions.length > 0 ? json.suggestions : ['(no suggestion)']);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI failed');
    } finally {
      setBusy(null);
    }
  }

  const hasValue = (value ?? '').trim().length > 0;

  return (
    <div ref={rootRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="AI draft"
        className={cn(
          'inline-flex items-center gap-1 rounded-md text-[11px] font-semibold transition border',
          'bg-evari-gold/10 text-evari-gold border-evari-gold/30 hover:bg-evari-gold/20',
          compact ? 'h-6 w-6 justify-center px-0' : 'px-2 py-1',
        )}
      >
        <Sparkles className="h-3 w-3" />
        {!compact ? 'AI' : null}
        {!compact ? <ChevronDown className="h-3 w-3 opacity-60" /> : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-1 z-50 w-72 rounded-md bg-evari-surface border border-evari-edge/40 shadow-lg p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1.5 px-1">AI suggestions</div>
          <div className="grid grid-cols-2 gap-1">
            <ModeBtn label="Draft 3" busy={busy === 'draft'} onClick={() => run('draft', 3)} />
            <ModeBtn label="Warmer" disabled={!hasValue} busy={busy === 'rewrite-warmer'} onClick={() => run('rewrite-warmer', 1)} />
            <ModeBtn label="Shorten" disabled={!hasValue} busy={busy === 'shorten'} onClick={() => run('shorten', 1)} />
            <ModeBtn label="Brand voice" disabled={!hasValue} busy={busy === 'rewrite-brand'} onClick={() => run('rewrite-brand', 1)} />
            <ModeBtn label="Expand" disabled={!hasValue} busy={busy === 'expand'} onClick={() => run('expand', 1)} />
          </div>

          {error ? <div className="mt-2 text-[11px] text-evari-danger px-1">{error}</div> : null}

          {suggestions && suggestions.length > 0 ? (
            <ul className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => { onApply(s); setOpen(false); setSuggestions(null); }}
                    className="w-full text-left rounded-md border border-evari-edge/30 bg-evari-ink/30 hover:border-evari-gold hover:bg-evari-gold/10 transition px-2 py-1.5 text-[12px] text-evari-text"
                  >
                    {s}
                  </button>
                </li>
              ))}
              <li className="px-1 text-[10px] text-evari-dimmer">Click a suggestion to apply.</li>
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ModeBtn({ label, onClick, disabled, busy }: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn('inline-flex items-center justify-center gap-1 rounded-md text-[11px] font-semibold py-1.5 transition border',
        disabled
          ? 'bg-evari-ink/30 text-evari-dimmer border-evari-edge/20 cursor-not-allowed'
          : 'bg-evari-ink/40 text-evari-text border-evari-edge/30 hover:border-evari-gold/40 hover:bg-evari-gold/10')}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {label}
    </button>
  );
}
