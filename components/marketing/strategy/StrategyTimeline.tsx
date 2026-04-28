'use client';

/**
 * Shared bottom-fixed timeline used by /strategy and downstream pages
 * (today /discover; tomorrow Shortlist + Enrichment if we want full
 * funnel continuity).
 *
 * Internal mode: caller passes onPick and the active step is tracked
 *                inside the host component. Used on /strategy.
 *
 * External mode: caller passes the playId and the chosen "external"
 *                step (e.g. 'discovery'). Strategy-step buttons link
 *                back to /strategy?playId=X&step=Y. Used on /discover.
 */

import Link from 'next/link';
import { cn } from '@/lib/utils';

export const STRATEGY_STEPS = [
  { key: 'brief',     label: 'Brief' },
  { key: 'target',    label: 'Target profile' },
  { key: 'ideal',     label: 'Ideal customer' },
  { key: 'channels',  label: 'Channels' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'metrics',   label: 'Success metrics' },
  { key: 'handoff',   label: 'Handoff' },
] as const;

export type StrategyStepKey = typeof STRATEGY_STEPS[number]['key'];

const EXTRA_STEPS = [{ key: 'discovery', label: 'Discovery' }] as const;
export type ExtendedStepKey = StrategyStepKey | typeof EXTRA_STEPS[number]['key'];

interface InternalProps {
  mode: 'internal';
  step: StrategyStepKey;
  onPick: (k: StrategyStepKey) => void;
  /** Show Discovery as the 8th, linking out to /discover. */
  playId?: string | null;
}

interface ExternalProps {
  mode: 'external';
  /** The step that is currently active and lives outside /strategy (e.g. 'discovery'). */
  external: 'discovery';
  playId: string;
}

export function StrategyTimeline(props: InternalProps | ExternalProps) {
  const allSteps: { key: ExtendedStepKey; label: string }[] = [...STRATEGY_STEPS, ...EXTRA_STEPS];
  const activeKey: ExtendedStepKey = props.mode === 'internal' ? props.step : props.external;
  const activeIdx = allSteps.findIndex((s) => s.key === activeKey);

  const showDiscoveryStep = props.mode === 'external' || !!props.playId;
  const stepsToShow = showDiscoveryStep ? allSteps : STRATEGY_STEPS as readonly { key: ExtendedStepKey; label: string }[];

  return (
    <nav className="absolute left-0 right-0 bottom-0 z-10 bg-evari-ink border-t border-evari-edge/30 px-4 py-3">
      <div className="max-w-[1240px] 2xl:max-w-[1380px] mx-auto px-2 2xl:px-6">
        <div className={cn('grid gap-2 items-end', stepsToShow.length === 7 ? 'grid-cols-7' : 'grid-cols-8')}>
          {stepsToShow.map((s, i) => {
            const active = s.key === activeKey;
            const past = i < activeIdx;
            const isStrategyStep = (STRATEGY_STEPS as readonly { key: ExtendedStepKey }[]).some((x) => x.key === s.key);

            const inner = (
              <>
                <div className="relative w-full h-[3px] rounded-full bg-evari-edge/30 overflow-hidden">
                  <div className={cn('absolute inset-y-0 left-0', active ? 'w-1/2 bg-evari-gold' : past ? 'w-full bg-evari-gold/60' : 'w-0')} />
                </div>
                <span className={cn('text-[10px] uppercase tracking-[0.12em] transition-colors', active ? 'text-evari-text font-semibold' : past ? 'text-evari-dim' : 'text-evari-dimmer')}>
                  {s.label}
                </span>
              </>
            );

            // Internal mode: the host owns navigation for strategy steps.
            // For Discovery in internal mode, link to /discover.
            if (props.mode === 'internal') {
              if (isStrategyStep) {
                return (
                  <button key={s.key} type="button" onClick={() => props.onPick(s.key as StrategyStepKey)} className="group flex flex-col items-center gap-1.5">
                    {inner}
                  </button>
                );
              }
              // Discovery (external from strategy's POV).
              const href = props.playId ? `/discover?playId=${encodeURIComponent(props.playId)}` : '/discover';
              return (
                <Link key={s.key} href={href} className="group flex flex-col items-center gap-1.5">
                  {inner}
                </Link>
              );
            }

            // External mode: strategy steps link back to /strategy with ?step=.
            if (isStrategyStep) {
              const href = `/strategy?playId=${encodeURIComponent(props.playId)}&step=${s.key}`;
              return (
                <Link key={s.key} href={href} className="group flex flex-col items-center gap-1.5">
                  {inner}
                </Link>
              );
            }
            // Discovery in external mode is the active page — render as a non-link.
            return (
              <div key={s.key} className="group flex flex-col items-center gap-1.5">
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
