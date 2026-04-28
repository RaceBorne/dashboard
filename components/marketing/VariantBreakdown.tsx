'use client';

/**
 * Per-subject-variant breakdown for an A/B-tested campaign. Mounted
 * on the campaign report between the holding pen and the analytics
 * tabs. Highlights the leader by open rate when one variant has a
 * statistically meaningful lead, otherwise just lists the table.
 */

import { ChevronUp, Trophy } from 'lucide-react';

import { cn } from '@/lib/utils';

interface VariantStat {
  index: number;
  subject: string;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  recipients: number;
}

export function VariantBreakdown({ variants }: { variants: VariantStat[] }) {
  if (!variants || variants.length < 2) return null;

  const withRates = variants.map((v) => ({
    ...v,
    openRate: v.delivered > 0 ? v.opened / v.delivered : 0,
    clickRate: v.delivered > 0 ? v.clicked / v.delivered : 0,
  }));
  const sorted = [...withRates].sort((a, b) => b.openRate - a.openRate);
  const topRate = sorted[0]?.openRate ?? 0;
  const second = sorted[1]?.openRate ?? 0;
  // Naive "winner" = open rate at least 3 percentage points above #2 AND ≥30 recipients.
  const leadIsMeaningful = topRate - second >= 0.03 && (sorted[0]?.recipients ?? 0) >= 30;
  const winnerIdx = leadIsMeaningful ? sorted[0].index : null;

  return (
    <div className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 mb-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-evari-gold/15 text-evari-gold">
          <ChevronUp className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-[13px] font-semibold text-evari-text">Subject A/B test</h3>
          <p className="text-[11px] text-evari-dim">{variants.length} variants. {winnerIdx !== null ? 'Winner highlighted.' : 'No clear winner yet.'}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">
            <tr>
              <th className="text-left py-1.5">Variant</th>
              <th className="text-left py-1.5">Subject</th>
              <th className="text-right py-1.5">Sent</th>
              <th className="text-right py-1.5">Opens</th>
              <th className="text-right py-1.5">Open rate</th>
              <th className="text-right py-1.5">Click rate</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const rate = v.delivered > 0 ? (v.opened / v.delivered) * 100 : 0;
              const click = v.delivered > 0 ? (v.clicked / v.delivered) * 100 : 0;
              const isWinner = v.index === winnerIdx;
              return (
                <tr key={v.index} className={cn('border-t border-evari-edge/20', isWinner ? 'bg-evari-gold/5' : '')}>
                  <td className="py-2 font-mono tabular-nums">
                    {String.fromCharCode(65 + v.index)}
                    {isWinner ? <Trophy className="inline-block ml-1.5 h-3 w-3 text-evari-gold" /> : null}
                  </td>
                  <td className="py-2 text-evari-text truncate max-w-[280px]">{v.subject}</td>
                  <td className="py-2 text-right tabular-nums text-evari-dim">{v.recipients}</td>
                  <td className="py-2 text-right tabular-nums text-evari-text">{v.opened}</td>
                  <td className={cn('py-2 text-right tabular-nums font-semibold', isWinner ? 'text-evari-gold' : 'text-evari-text')}>{rate.toFixed(1)}%</td>
                  <td className="py-2 text-right tabular-nums text-evari-dim">{click.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
