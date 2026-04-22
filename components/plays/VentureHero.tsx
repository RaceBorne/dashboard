'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * VentureHero — the big "spin up a new venture" input at the top of
 * /ventures. Replaces the old NewVentureButton modal on the list page.
 *
 * Visually mirrors the Discover page's hero search input: white rounded
 * panels against the dark surface, Sparkles glyph on the left, ArrowUp
 * submit button bottom-right. Creating a venture still requires both a
 * working title and a one-sentence pitch — the pitch field is the hero,
 * the title field sits compact above it.
 *
 * Submit:
 *   - POST /api/plays with { title, brief: pitch }
 *   - Background PATCH /api/plays/{id} with { strategyShort: pitch } so
 *     Discover / CompanyPanel can read it without a round-trip
 *   - router.push(`/ventures/${id}`) + refresh + dispatch
 *     'evari:plays-dirty' so the rail refetches.
 */
export function VentureHero() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [pitch, setPitch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pitchRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(async () => {
    const t = title.trim();
    const p = pitch.trim();
    if (!t) {
      setError('Give your venture a working title.');
      return;
    }
    if (p.length < 10) {
      setError('Add a short one-sentence pitch so Claude has real context.');
      pitchRef.current?.focus();
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
      const body = (await res.json().catch(() => ({ ok: false, error: 'Bad JSON' }))) as {
        ok?: boolean;
        id?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.id) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Seed strategyShort so Discover / CompanyPanel can read the pitch
      // without a round-trip. Non-fatal if it fails.
      void fetch(`/api/plays/${body.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ strategyShort: p }),
      }).catch(() => {});
      try {
        window.dispatchEvent(new Event('evari:plays-dirty'));
      } catch {
        // non-fatal
      }
      router.push(`/ventures/${body.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [title, pitch, router]);

  const disabled = busy || !title.trim() || pitch.trim().length < 10;

  return (
    <section className="rounded-2xl bg-evari-surface border border-evari-line/40 p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-evari-text">New venture</h2>
        <p className="text-[13px] text-evari-dim leading-relaxed">
          Name it, pitch it in a sentence. Claude picks up from there — the
          pitch seeds the Spitball chat so the first turn has real context.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-2"
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              pitchRef.current?.focus();
            }
          }}
          placeholder="Working title — e.g. UK private knee-surgery clinics"
          disabled={busy}
          className="w-full rounded-lg border border-evari-line/40 bg-white px-4 py-3 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-evari-accent shadow-sm disabled:opacity-60"
        />

        <div className="relative flex items-start min-h-[96px] rounded-xl border border-evari-line/40 bg-white focus-within:border-evari-accent shadow-sm">
          <div className="pl-4 pr-3 pt-5 shrink-0">
            <Sparkles className="h-4 w-4 text-evari-accent" />
          </div>
          <textarea
            ref={pitchRef}
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="What are you trying to do? Who's the customer, what's the bet, what does success look like?"
            rows={3}
            disabled={busy}
            className="flex-1 min-w-0 resize-none bg-transparent pr-16 pl-0 py-4 text-[14px] leading-6 text-slate-900 placeholder:text-slate-400 focus:placeholder:text-transparent focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={disabled}
            aria-label="Create venture"
            title={disabled && !busy ? 'Add a title and a short pitch' : 'Create venture'}
            className={cn(
              'absolute right-2 bottom-2 h-9 w-9 inline-flex items-center justify-center rounded-lg bg-evari-gold text-evari-goldInk transition-colors',
              disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-evari-gold/90',
            )}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>

        {error ? (
          <div className="text-[12px] text-evari-danger pl-1">{error}</div>
        ) : (
          <div className="text-[11px] text-evari-dimmer pl-1">
            <kbd className="font-mono">⌘</kbd>
            <kbd className="font-mono ml-0.5">Enter</kbd> to create.
          </div>
        )}
      </form>
    </section>
  );
}
