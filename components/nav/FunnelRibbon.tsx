'use client';

/**
 * FunnelRibbon — the persistent "you are here" strip shown at the top of
 * every stage page inside a Venture's funnel: Ventures then Strategy then
 * Discovery then Prospects then Leads then Conversations.
 *
 * Ventures (the list) is the left-most chip. The remaining chips drill
 * into a single venture's funnel — they need a playId to navigate
 * meaningfully. When no playId is present (we are on the list page) the
 * downstream chips fall back to /ventures so they behave like normal
 * links that simply keep you on the list until you pick a venture.
 *
 * The consumer can pass a pre-loaded Play object to avoid a double fetch
 * (Discover and PlayDetail already have it). When no play is passed the
 * ribbon fetches /api/plays/[id] itself.
 *
 * ─── Height: belt + braces ───
 *
 *   The ribbon was rendering noticeably shorter than 52px on stage pages
 *   that use STAGE_WRAPPER_CLASSNAME_FILL (notably Conversations). Root
 *   cause: that wrapper combines `flex flex-col`, `flex-1`, `min-h-0`
 *   and `overflow-hidden`. In that flex context, an item with bare
 *   `h-[52px]` is treated as a flex-basis hint rather than a hard
 *   height — `shrink-0` should prevent shrinking but doesn't always
 *   fire when the parent has `min-h-0` and the available space is
 *   contended.
 *
 *   Defensive fix: pin the ribbon's height with three reinforcing
 *   declarations so no flex calculation can squash it:
 *     1. h-[52px]                — the canonical height (Tailwind class)
 *     2. min-h-[52px]            — explicit floor flex can't push below
 *     3. style={{ height, minHeight }}  — inline override that beats
 *                                  any class-cascade fight
 *
 *   Plus `box-border` so padding lives inside the 52px box and the
 *   chip lozenge sits centred exactly as designed.
 *
 * ─── Dev-mode height assertion ───
 *
 *   In addition to the belt-and-braces layout fix, we measure the
 *   ribbon's actual rendered height after mount (and on every stage
 *   change / window resize) and `console.warn` if it isn't exactly
 *   52px. This is gated on NODE_ENV !== 'production' so it costs
 *   nothing in prod but catches regressions the instant any dev
 *   loads the page locally.
 *
 *   If you ever see "[FunnelRibbon] height assertion failed" in the
 *   console, do NOT silence it — read the warning, find what's
 *   squashing the ribbon, and fix the layout (not the assertion).
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Play } from '@/lib/types';

export type FunnelStage =
  | 'ventures'
  | 'strategy'
  | 'discovery'
  | 'prospects'
  | 'leads'
  | 'conversations';

interface StageDef {
  key: FunnelStage;
  label: string;
  /**
   * Given a playId (possibly empty on the list page) return the route
   * for this chip. Stages that depend on a playId fall back to
   * /ventures when no venture is selected — that keeps every chip a
   * real, clickable link.
   */
  href: (playId: string) => string;
}

const STAGES: StageDef[] = [
  { key: 'ventures', label: 'Ideas', href: () => '/ventures' },
  {
    key: 'strategy',
    label: 'Strategy',
    href: (id) => (id ? `/ventures/${id}` : '/ventures'),
  },
  {
    key: 'discovery',
    label: 'Discovery',
    href: (id) => (id ? `/discover?playId=${id}` : '/discover'),
  },
  {
    key: 'prospects',
    label: 'Prospects',
    href: (id) => (id ? `/prospects?playId=${id}` : '/prospects'),
  },
  {
    key: 'leads',
    label: 'Leads',
    href: (id) => (id ? `/leads?playId=${id}` : '/leads'),
  },
  {
    key: 'conversations',
    label: 'Conversations',
    href: (id) => (id ? `/conversations?playId=${id}` : '/conversations'),
  },
];

interface Props {
  stage: FunnelStage;
  /**
   * Empty string is allowed — used on /ventures (the list page) when no
   * specific venture is selected. In that mode only the Ventures chip is
   * the active stage; downstream chips still render as real links (they
   * route back to /ventures).
   */
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
  const ribbonRef = useRef<HTMLDivElement | null>(null);

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

  // Dev-mode height assertion. See the "Dev-mode height assertion"
  // comment block at the top of this file. Costs nothing in prod
  // because the entire effect body short-circuits on NODE_ENV.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const el = ribbonRef.current;
    if (!el) return;

    const EXPECTED = 52;
    let warned = false;

    const measure = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h !== EXPECTED && !warned) {
        warned = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[FunnelRibbon] height assertion failed — expected ${EXPECTED}px, got ${h}px on stage="${stage}". ` +
            `Something in the surrounding layout is squashing (or stretching) the ribbon. ` +
            `See lib/layout/stageWrapper.ts and the "Height: belt + braces" comment in FunnelRibbon.tsx ` +
            `before "fixing" anything — this is almost certainly a wrapper-flex regression, not a ribbon bug.`,
        );
      }
    };

    // Measure once after layout settles, then again on resize. We
    // only warn once per mount to keep the console clean.
    const rafId = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [stage]);

  const currentIdx = STAGES.findIndex((s) => s.key === stage);
  const onList = stage === 'ventures' || !playId;

  return (
    <div
      ref={ribbonRef}
      className="shrink-0 box-border rounded-xl bg-evari-surface px-4 h-[52px] min-h-[52px] flex items-center"
      style={{ height: 52, minHeight: 52 }}
    >
      <div className="flex items-center justify-between gap-4 w-full">
        <div className="min-w-0 flex-1 flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium shrink-0">
            {onList ? 'Module' : 'Campaign'}
          </span>
          <span className="text-[13px] font-semibold text-evari-text truncate">
            {onList
              ? 'All ventures'
              : (play?.title ?? (playId ? 'Loading campaign…' : 'No campaign linked'))}
          </span>
        </div>
        <nav
          aria-label="Funnel stages"
          className="flex items-center gap-0.5 shrink-0"
        >
          {STAGES.map((s, idx) => {
            const active = idx === currentIdx;
            const passed = idx < currentIdx;
            const href = s.href(playId);
            return (
              <div key={s.key} className="flex items-center">
                <Link
                  href={href}
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
