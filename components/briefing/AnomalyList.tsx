import Link from 'next/link';
import { AlertOctagon, AlertTriangle, ChevronRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BriefingAnomaly } from '@/lib/types';

const ICON = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
} as const;

const TONE = {
  critical: 'text-red-400 border-red-500/30 bg-red-500/[0.06]',
  warning: 'text-amber-400 border-amber-500/30 bg-amber-500/[0.05]',
  info: 'text-sky-400 border-sky-500/30 bg-sky-500/[0.04]',
} as const;

export function AnomalyList({ anomalies }: { anomalies: BriefingAnomaly[] }) {
  if (!anomalies.length) {
    return (
      <div className="rounded-lg border border-evari-edge bg-evari-surface p-6 text-sm text-evari-dim">
        No anomalies detected.
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {anomalies.map((a) => {
        const Icon = ICON[a.severity];
        return (
          <li
            key={a.id}
            className={cn(
              'rounded-lg border p-4 flex gap-3 items-start',
              TONE[a.severity],
            )}
          >
            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-evari-text leading-tight">{a.title}</div>
              <p className="text-xs text-evari-dim mt-1 leading-relaxed">{a.detail}</p>
              {a.link && (
                <Link
                  href={a.link.href}
                  className="inline-flex items-center gap-1 mt-2 text-xs text-evari-text hover:text-primary transition-colors"
                >
                  {a.link.label}
                  <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
