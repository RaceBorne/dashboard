import Link from 'next/link';
import { AlertOctagon, AlertTriangle, ChevronRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BriefingAnomaly } from '@/lib/types';

const ICON = {
 critical: AlertOctagon,
 warning: AlertTriangle,
 info: Info,
} as const;

const STRIPE = {
 critical: 'bg-evari-danger',
 warning: 'bg-evari-warn',
 info: 'bg-sky-400',
} as const;
const ICON_TONE = {
 critical: 'text-evari-danger',
 warning: 'text-evari-warn',
 info: 'text-sky-400',
} as const;

export function AnomalyList({ anomalies }: { anomalies: BriefingAnomaly[] }) {
 if (!anomalies.length) {
 return (
  <div className="rounded-lg bg-evari-surface p-6 text-sm text-evari-dim">
  No anomalies detected.
  </div>
 );
 }

 return (
 <ul className="space-y-1">
  {anomalies.map((a) => {
  const Icon = ICON[a.severity];
  return (
   <li
   key={a.id}
   className="rounded-panel bg-evari-surface/60 p-4 flex gap-3 items-start relative overflow-hidden"
   >
   {/* Solid severity stripe on the left — no translucent fills */}
   <span className={cn('absolute left-0 top-0 bottom-0 w-[3px]', STRIPE[a.severity])} />
   <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', ICON_TONE[a.severity])} />
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
