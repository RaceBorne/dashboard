import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Escapist-style stat tile: a filled grey block, colour-accented icon on the
 * left, big value top-right, small helper underneath. No borders.
 */
export function StatTile({
  icon,
  iconTone,
  value,
  unit,
  helper,
  tone,
  className,
}: {
  icon?: ReactNode;
  /** Tailwind text colour class applied to the icon (e.g. 'text-evari-warn'). */
  iconTone?: string;
  value: ReactNode;
  unit?: string;
  helper?: ReactNode;
  /** Overall value tint — accepts any Tailwind text colour class. */
  tone?: string;
  className?: string;
}) {
  return (
    <div className={cn('stat-tile', className)}>
      {icon ? (
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full',
            'bg-evari-surfaceSoft',
            iconTone,
          )}
        >
          {icon}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              'text-2xl font-semibold tracking-tight tabular-nums',
              tone ?? 'text-evari-text',
            )}
          >
            {value}
          </span>
          {unit ? (
            <span className="text-xs text-evari-dim">{unit}</span>
          ) : null}
        </div>
        {helper ? (
          <div className="mt-0.5 text-[11px] text-evari-dim leading-tight">
            {helper}
          </div>
        ) : null}
      </div>
    </div>
  );
}
