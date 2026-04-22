'use client';

/**
 * FunnelRibbon — the persistent "you are here" strip shown at the top of
 * every stage page inside a Play's funnel: Strategy → Discovery → Prospects
 * → Leads → Conversations.
 *
 * Each stage narrows the previous, and every stage page operates on the
 * subset that belongs to the given play. The ribbon makes that hierarchy
 * visible and one-click navigable.
 *
 * The consumer can pass a pre-loaded Play object to avoid a double fetch
 * (Discover and PlayDetail already have it). When no play is passed the
 * ribbon fetches /api/plays/[id] itself.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Play } from '@/lib/types';

export type FunnelStage =
  | 'strategy'
  | 'discovery'
  | 'prospects'
  | 'leads'
  | 'conversations';

interface StageDef {
  key: FunnelStage;
  label: string;
  href: (playId: string) => string;
}

const STAGES: StageDef[] = [
  { key: 'strategy', label: 'Strategy', href: (id) => `/ventures/${id}` },
  { key: 'discovery', label: 'Discovery', href: (id) => `/discover?playId=${id}` },
  { key: 'prospects', label: 'Prospects', href: (id) => `/prospects?playId=${id}` },
  { key: 'leads', label: 'Leads', href: (id) => `/leads?playId=${id}` },
  {
    key: 'conversations',
    label: 'Conversations',
    href: (id) => `/conversations?playId=${id}`,
  },
];

interface Props {
  stage: FunnelStage;
  playId: string;
  /**
   * Optional pre-loaded Play. When omitted the ribbon fetches the play
   * via /api/plays/[id] so the title can be rendered. All other chips
   * still work without it.
   */
  play?: Play | null;
}

export function FunnelRibbon({ stage, playId, play: initialPlay }: Props) {
  const [play, setPlay] = useState<Play | null>(initialPlay ?? null);

  useEffect(() => {
    if (!playId) return;
    if (play && play.id === playId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/plays/${playId}`);
        const data = (await res.json()) as { ok?: boolean; play?: Play };
        if (!cancelled && data?.play) setPlay(data.play);
      } catch {
        // Non-fatal — chips still navigate without the title.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playId, play]);

  const currentIdx = STAGES.findIndex((s) => s.key === stage);

  return (
    <div className="shrink-0 rounded-xl bg-evari-surface border border-evari-line/40 px-4 h-[52px] flex items-center">
      <div className="flex items-center justify-between gap-4 w-full">
        <div className="min-w-0 flex-1 flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium shrink-0">
            Venture
          </span>
          <span className="text-[13px] font-semibold text-evari-text truncate">
            {play?.title ?? (playId ? 'Loading venture…' : 'No venture linked')}
          </span>
        </div>
        <nav
          aria-label="Funnel stages"
          className="flex items-center gap-0.5 shrink-0"
        >
          {STAGES.map((s, idx) => {
            const active = idx === currentIdx;
            const passed = idx < currentIdx;
            return (
              <div key={s.key} className="flex items-center">
                <Link
                  href={s.href(playId)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors',
                    active
                      ? 'bg-evari-gold text-evari-goldInk shadow-sm'
                      : passed
                        ? 'text-evari-text hover:bg-evari-surfaceSoft'
                        : 'text-evari-dim hover:bg-evari-surfaceSoft hover:text-evari-text',
                  )}
                >
                  {s.label}
                </Link>
                {idx < STAGES.length - 1 ? (
                  <ChevronRight className="h-3 w-3 text-evari-dimmer/60 mx-0.5" />
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
