'use client';

/**
 * Inline "new idea" panel mounted on the Ideas page (right column).
 * Two fields, title + pitch. Submit creates the play and routes to
 * /strategy?playId=X&kickoff=1 so Spitball auto-drafts immediately.
 *
 * Replaces the old NewVentureButton modal: the form is always visible
 * on the right side of the page so capture is one click less.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NewIdeaPanel() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [pitch, setPitch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const t = title.trim();
    const p = pitch.trim();
    if (!t) {
      setError('Give the opportunity a working title.');
      return;
    }
    if (p.length < 10) {
      setError('Add a one-sentence pitch so Claude has real context.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/plays', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: t, brief: p }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !body.ok || !body.id) throw new Error(body.error ?? `HTTP ${res.status}`);
      // Best-effort seed of strategyShort.
      void fetch(`/api/plays/${body.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ strategyShort: p }),
      }).catch(() => {});
      try { window.dispatchEvent(new Event('evari:plays-dirty')); } catch {}
      router.push(`/strategy?playId=${body.id}&kickoff=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4 flex flex-col gap-3">
      <header className="flex items-start gap-2">
        <span className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-evari-gold/15 text-evari-gold shrink-0">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-semibold text-evari-text">New opportunity</h2>
          <p className="text-[11px] text-evari-dim mt-0.5">Working title and a one-sentence pitch. Claude takes it from here.</p>
        </div>
      </header>

      <label className="block space-y-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">Working title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && pitch.trim().length >= 10) { e.preventDefault(); void submit(); } }}
          placeholder="e.g. UK private knee-surgery clinics"
          disabled={busy}
          className="w-full rounded-md bg-[rgb(var(--evari-input-fill))] px-3 py-2 text-[12px] text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:bg-[rgb(var(--evari-input-fill-focus))] transition-colors disabled:opacity-50"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">What are you trying to do?</span>
        <textarea
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={4}
          placeholder="One sentence. Who's the customer, what's the bet, what does success look like?"
          disabled={busy}
          className="w-full rounded-md bg-[rgb(var(--evari-input-fill))] px-3 py-2 text-[12px] text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:bg-[rgb(var(--evari-input-fill-focus))] transition-colors resize-none disabled:opacity-50"
        />
      </label>

      {error ? <div className="text-[11px] text-evari-danger">{error}</div> : null}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-md bg-evari-gold text-evari-goldInk text-[12px] font-medium px-3 py-2 transition-colors',
          busy ? 'opacity-70 cursor-wait' : 'hover:bg-evari-gold/90',
        )}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        {busy ? 'Creating…' : 'Create opportunity'}
      </button>
      <p className="text-[10px] text-evari-dimmer leading-relaxed">
        Press ⌘+Enter in the pitch box to submit. You can refine the brief in the Spitball chat that opens next.
      </p>
    </aside>
  );
}
