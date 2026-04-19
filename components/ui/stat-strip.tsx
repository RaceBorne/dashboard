import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared stat strip used at the top of list pages.
 *
 * Global rule: no boxes, no fills. Just typography — tiny uppercase label,
 * a medium tabular number, and a one-line helper beneath. The line between
 * stats is a subtle vertical hairline so the rhythm reads across.
 *
 * Keeps the page feeling editorial rather than dashboard-y.
 */

export interface Stat {
  label: string;
  value: ReactNode;
  /** One-line helper directly beneath the value. */
  hint?: ReactNode;
  /** When truthy, the value is tinted with this tailwind text class. */
  tone?: string;
}

export function StatStrip({
  stats,
  className,
}: {
  stats: Stat[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start flex-wrap gap-x-10 gap-y-4 px-1 py-2',
        className,
      )}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={cn(
            'relative min-w-[88px]',
            i > 0 &&
              'pl-10 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-8 before:w-px before:bg-evari-edge/50',
          )}
        >
          <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer font-medium">
            {s.label}
          </div>
          <div
            className={cn(
              'text-xl font-semibold tabular-nums leading-none mt-1',
              s.tone ?? 'text-evari-text',
            )}
          >
            {s.value}
          </div>
          {s.hint != null && (
            <div className="text-[11px] text-evari-dim mt-1 leading-tight">
              {s.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
