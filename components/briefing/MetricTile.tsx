import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BriefingMetric } from '@/lib/types';

export function MetricTile({ metric }: { metric: BriefingMetric }) {
 const TrendIcon =
  metric.trend === 'up' ? ArrowUp : metric.trend === 'down' ? ArrowDown : ArrowRight;
 const trendColor =
  metric.trend === 'up'
   ? 'text-evari-success'
   : metric.trend === 'down'
    ? 'text-evari-danger'
    : 'text-evari-dim';

 return (
  <div className="rounded-lg bg-evari-surface p-4 flex flex-col gap-1.5">
   <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
    {metric.label}
   </div>
   <div className="flex items-baseline gap-2">
    <div className="text-xl font-medium tracking-tight text-evari-text font-mono tabular-nums">
     {metric.value}
    </div>
    {metric.delta && (
     <div className={cn('flex items-center gap-0.5 text-xs font-mono', trendColor)}>
      <TrendIcon className="h-3 w-3" />
      {metric.delta}
     </div>
    )}
   </div>
   {metric.helper && <div className="text-xs text-evari-dim leading-snug">{metric.helper}</div>}
  </div>
 );
}
