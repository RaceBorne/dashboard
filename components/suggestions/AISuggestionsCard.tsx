'use client';

/**
 * AI suggestions panel for any data-driven page.
 *
 * Renders a one-sentence synopsis and 3-5 actionable bullets generated
 * by Claude from the surface's live data. Each bullet has a + button
 * that pushes it straight onto the to-do board. Cached server-side
 * for 6 hours; manual refresh forces a regenerate.
 */

import { useEffect, useState } from 'react';
import { RefreshCw, Plus, Sparkles, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Bullet {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
}

interface Response {
  ok: boolean;
  synopsis?: string;
  bullets?: Bullet[];
  cached?: boolean;
  ageMinutes?: number;
  stale?: boolean;
  error?: string;
}

const PRIORITY_TONE: Record<Bullet['priority'], { dot: string; label: string }> = {
  urgent: { dot: 'bg-red-400',          label: 'Urgent' },
  high:   { dot: 'bg-evari-warn',       label: 'High' },
  medium: { dot: 'bg-sky-400',          label: 'Medium' },
  low:    { dot: 'bg-evari-edge',       label: 'Low' },
};

export function AISuggestionsCard({ surface }: { surface: string }) {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [regen, setRegen] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  async function load(force = false) {
    if (force) setRegen(true); else setLoading(true);
    try {
      const res = await fetch('/api/suggestions/' + encodeURIComponent(surface), { method: force ? 'POST' : 'GET' });
      const json = (await res.json()) as Response;
      setData(json);
    } catch (e) {
      setData({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' });
    } finally {
      setLoading(false);
      setRegen(false);
    }
  }

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface]);

  async function addToTodo(b: Bullet, idx: number) {
    if (addedIds.has(idx)) return;
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: b.title,
          description: b.description,
          category: b.category,
          status: 'planned',
          priority: b.priority,
          source: 'auto',
        }),
      });
      if (res.ok) {
        setAddedIds((s) => new Set(s).add(idx));
      }
    } catch { /* noop */ }
  }

  return (
    <section className="rounded-panel bg-evari-surface border border-evari-edge/30 px-5 py-4 space-y-3">
      <header className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-evari-gold" />
        <h2 className="text-[12px] font-semibold tracking-tight text-evari-text">Mojito's read</h2>
        {data?.cached && typeof data.ageMinutes === 'number' ? (
          <span className="text-[10px] text-evari-dimmer">
            cached {data.ageMinutes < 60 ? data.ageMinutes + 'm' : Math.round(data.ageMinutes / 60) + 'h'} ago
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={regen || loading}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-evari-dim hover:text-evari-text disabled:opacity-50"
          title="Regenerate suggestions"
        >
          <RefreshCw className={cn('h-3 w-3', regen && 'animate-spin')} />
          Regenerate
        </button>
      </header>

      {loading && !data ? (
        <div className="space-y-2">
          <div className="h-3 w-3/4 bg-evari-edge/30 rounded animate-pulse" />
          <div className="h-3 w-2/3 bg-evari-edge/30 rounded animate-pulse" />
        </div>
      ) : data?.ok && data.synopsis ? (
        <>
          <p className="text-[13px] text-evari-text leading-relaxed">{data.synopsis}</p>
          {data.bullets && data.bullets.length > 0 ? (
            <ul className="space-y-1.5 pt-1">
              {data.bullets.map((b, i) => {
                const tone = PRIORITY_TONE[b.priority] ?? PRIORITY_TONE.medium;
                const added = addedIds.has(i);
                return (
                  <li key={i} className="flex items-start gap-3 px-3 py-2 rounded-md bg-evari-ink/30 border border-evari-edge/20">
                    <span className={cn('mt-1 h-1.5 w-1.5 rounded-full shrink-0', tone.dot)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-evari-text leading-tight">{b.title}</div>
                      <div className="text-[11px] text-evari-dim leading-relaxed mt-0.5">{b.description}</div>
                      <div className="text-[10px] text-evari-dimmer mt-1">{tone.label} · {b.category}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void addToTodo(b, i)}
                      disabled={added}
                      title={added ? 'Added to to-do' : 'Add to to-do'}
                      className={cn(
                        'shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md border transition',
                        added
                          ? 'bg-evari-gold/20 border-evari-gold/40 text-evari-gold cursor-default'
                          : 'bg-evari-ink border-evari-edge/40 text-evari-dim hover:text-evari-gold hover:border-evari-gold/40',
                      )}
                    >
                      {added ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {data.stale ? (
            <div className="text-[10px] text-evari-dimmer flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Showing cached read; regenerate failed: {data.error}
            </div>
          ) : null}
        </>
      ) : (
        <div className="text-[12px] text-evari-dim flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-evari-warn shrink-0 mt-0.5" />
          <span>{data?.error ?? 'Could not generate suggestions.'}</span>
        </div>
      )}
    </section>
  );
}
