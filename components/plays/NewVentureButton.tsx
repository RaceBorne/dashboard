'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "New campaign" CTA + intake modal.
 *
 * Kills the old one-click "Untitled strategy" pattern. Creating a venture
 * now requires two things: a working title and a one-sentence pitch
 * describing what you're trying to do. Both seed the venture:
 *   - title      → play.title
 *   - pitch      → play.brief (also stored as strategyShort so Discover can
 *                    read it without a round-trip), and seeded into the
 *                    first Spitball message as a "starter" so Claude has
 *                    real context on the very first turn.
 *
 * Submit creates the row via POST /api/plays, then navigates to the new
 * venture's detail page.
 */
export function NewVentureButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [pitch, setPitch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Autofocus the title field when the modal opens.
  useEffect(() => {
    if (open) {
      // Next tick — lets the portal paint first.
      const h = window.setTimeout(() => titleRef.current?.focus(), 0);
      return () => window.clearTimeout(h);
    }
  }, [open]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const reset = useCallback(() => {
    setTitle('');
    setPitch('');
    setError(null);
  }, []);

  async function submit() {
    const t = title.trim();
    const p = pitch.trim();
    if (!t) {
      setError('Give your venture a working title.');
      titleRef.current?.focus();
      return;
    }
    if (p.length < 10) {
      setError('Add a short one-sentence pitch so Claude has real context.');
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
      // Seed the strategyShort field + first chat turn in the background
      // so by the time Craig lands on the detail page, Claude already has
      // context. We don't await — the PATCH is best-effort.
      void fetch(`/api/plays/${body.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ strategyShort: p }),
      }).catch(() => {
        // non-fatal
      });
      setOpen(false);
      reset();
      // Hand straight off to Strategy with kickoff=1. The Strategy page
      // detects the flag, mounts the Spitball, and auto-fires the first
      // turn so Claude is already engaging by the time the page paints.
      // The /ideas/[id] detail page is still reachable as a resume target
      // from the Ideas list.
      router.push(`/strategy?playId=${body.id}&kickoff=1`);
      router.refresh();
      // Let the rail and any other venture-listeners know a new one exists.
      try {
        window.dispatchEvent(new Event('evari:plays-dirty'));
      } catch {
        // non-fatal
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md bg-evari-gold text-evari-goldInk text-xs font-medium px-3 py-1.5 transition-colors',
          'hover:bg-evari-gold/90',
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        New idea
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-venture-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-evari-ink/70 backdrop-blur-sm"
          onClick={(e) => {
            // click on backdrop closes; clicks inside the card shouldn't bubble
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <div className="w-full max-w-[560px] rounded-2xl bg-evari-surface border border-evari-line/40 shadow-xl">
            <div className="flex items-start justify-between px-6 pt-5 pb-3">
              <div className="space-y-1">
                <div id="new-venture-title" className="text-base font-semibold text-evari-text">
                  New campaign
                </div>
                <div className="text-xs text-evari-dim">
                  Two fields to kick things off. You can refine everything later.
                </div>
              </div>
              <button
                type="button"
                onClick={() => (busy ? null : setOpen(false))}
                disabled={busy}
                aria-label="Close"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 pb-5 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
                  Working title
                </span>
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                  placeholder="e.g. UK private knee-surgery clinics"
                  className="w-full rounded-md bg-[rgb(var(--evari-input-fill))] px-3 py-2 text-sm text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:bg-[rgb(var(--evari-input-fill-focus))] transition-colors"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
                  What are you trying to do?
                </span>
                <textarea
                  value={pitch}
                  onChange={(e) => setPitch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                  rows={3}
                  placeholder="One sentence. Who's the customer, what's the bet, what does success look like?"
                  className="w-full rounded-md bg-[rgb(var(--evari-input-fill))] px-3 py-2 text-sm text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:bg-[rgb(var(--evari-input-fill-focus))] transition-colors resize-none"
                />
                <div className="text-[10px] text-evari-dimmer">
                  Seeds the Spitball chat so Claude has real context on the first turn.
                </div>
              </label>

              {error ? (
                <div className="text-[11px] text-evari-danger">{error}</div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-1">
              <button
                type="button"
                onClick={() => (busy ? null : setOpen(false))}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-evari-dim hover:text-evari-text hover:bg-evari-surfaceSoft transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md bg-evari-gold text-evari-goldInk text-xs font-medium px-3 py-1.5 transition-colors',
                  busy ? 'opacity-70 cursor-wait' : 'hover:bg-evari-gold/90',
                )}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {busy ? 'Creating…' : 'Create venture'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
