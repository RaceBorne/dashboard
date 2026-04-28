'use client';

/**
 * Aggregate campaign performance dashboard at /email/statistics.
 *
 * Pulls every campaign + its per-recipient stats and renders:
 *   • Headline cards: total sends, total opens, total clicks, total
 *     bounces, plus the rolled-up rates as the second number.
 *   • Trend chart: open rate + click rate per sent campaign,
 *     ordered by send date (most recent right-most). SVG line
 *     chart drawn directly so we don't pull a chart lib.
 *   • Top performers table: campaigns ordered by open rate, with
 *     a Newsletter / Direct kind badge so you can see which kind
 *     is converting better at a glance.
 *
 * No filters yet — the campaigns list page already handles
 * date-range scoping; this page is the 'how am I doing overall'
 * surface.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Mail, MousePointerClick, Send, ShieldAlert, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Campaign } from '@/lib/marketing/types';
import type { CampaignStats } from '@/lib/marketing/campaigns';

interface Item {
  campaign: Campaign;
  stats: CampaignStats;
}

interface Props {
  items: Item[];
}

type RangeKey = '30d' | '90d' | 'all';
const RANGE_LABEL: Record<RangeKey, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  'all': 'All time',
};
const RANGE_MS: Record<Exclude<RangeKey, 'all'>, number> = {
  '30d': 30 * 86400 * 1000,
  '90d': 90 * 86400 * 1000,
};

export function StatisticsClient({ items }: Props) {
  const [range, setRange] = useState<RangeKey>('30d');

  const sentItems = useMemo(() => {
    const cutoff = range === 'all' ? 0 : Date.now() - RANGE_MS[range];
    return items
      .filter((i) => i.campaign.status === 'sent' && (cutoff === 0 || new Date(i.campaign.sentAt ?? i.campaign.updatedAt).getTime() >= cutoff))
      .sort((a, b) => new Date(a.campaign.sentAt ?? a.campaign.updatedAt).getTime() - new Date(b.campaign.sentAt ?? b.campaign.updatedAt).getTime());
  }, [items, range]);

  const totals = useMemo(() => {
    const t = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, recipients: 0 };
    for (const i of sentItems) {
      t.sent      += i.stats.sent;
      t.delivered += i.stats.delivered;
      t.opened    += i.stats.opened;
      t.clicked   += i.stats.clicked;
      t.bounced   += i.stats.bounced;
      t.recipients += i.stats.total;
    }
    return t;
  }, [sentItems]);

  const openRate   = totals.delivered > 0 ? (totals.opened   / totals.delivered) * 100 : 0;
  const clickRate  = totals.delivered > 0 ? (totals.clicked  / totals.delivered) * 100 : 0;
  const bounceRate = totals.recipients > 0 ? (totals.bounced / totals.recipients) * 100 : 0;

  const topPerformers = useMemo(() => {
    return [...sentItems]
      .map((i) => ({
        ...i,
        openRate:  i.stats.delivered > 0 ? (i.stats.opened  / i.stats.delivered) * 100 : 0,
        clickRate: i.stats.delivered > 0 ? (i.stats.clicked / i.stats.delivered) * 100 : 0,
      }))
      .sort((a, b) => b.openRate - a.openRate)
      .slice(0, 10);
  }, [sentItems]);

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-3">
        {/* Range selector */}
        <div className="flex items-center justify-end gap-1">
          <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mr-1">Range</span>
          <div className="inline-flex rounded-panel bg-evari-surface border border-evari-edge/30 p-0.5">
            {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setRange(k)}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                  range === k ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text',
                )}
              >
                {RANGE_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        {/* Headline tiles */}
        <div className="grid grid-cols-4 gap-2">
          <Tile label="Sends"      value={totals.sent.toLocaleString()}       sub={`${sentItems.length} campaign${sentItems.length === 1 ? '' : 's'}`} icon={<Send className="h-4 w-4" />}              accent="mute" />
          <Tile label="Open rate"  value={`${openRate.toFixed(2)}%`}          sub={`${totals.opened.toLocaleString()} opens`}            icon={<Mail className="h-4 w-4" />}             accent="gold" />
          <Tile label="Click rate" value={`${clickRate.toFixed(2)}%`}         sub={`${totals.clicked.toLocaleString()} clicks`}          icon={<MousePointerClick className="h-4 w-4" />} accent="gold" />
          <Tile label="Bounce rate" value={`${bounceRate.toFixed(2)}%`}       sub={`${totals.bounced.toLocaleString()} bounces`}         icon={<ShieldAlert className="h-4 w-4" />}      accent={bounceRate > 5 ? 'danger' : 'mute'} />
        </div>

        {/* Trend chart */}
        <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
          <header className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-evari-gold" />
              <h2 className="text-[13px] font-semibold text-evari-text">Open + click rate per campaign</h2>
            </div>
            <span className="text-[10px] text-evari-dimmer">{sentItems.length} sent in range</span>
          </header>
          {sentItems.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-evari-dim">No sent campaigns in this range yet.</div>
          ) : (
            <TrendChart items={sentItems} />
          )}
        </section>

        {/* Top performers */}
        <section className="rounded-panel bg-evari-surface border border-evari-edge/30">
          <header className="px-3 py-2 border-b border-evari-edge/20">
            <h2 className="text-[13px] font-semibold text-evari-text">Top performers (by open rate)</h2>
          </header>
          {topPerformers.length === 0 ? (
            <div className="px-6 py-12 text-center text-[12px] text-evari-dim">No sent campaigns yet — fire a campaign and stats will surface here.</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-evari-ink/40 text-[10px] uppercase tracking-[0.1em] text-evari-dimmer">
                <tr>
                  <th className="px-3 py-2 text-left">Campaign</th>
                  <th className="px-3 py-2 text-left w-24">Kind</th>
                  <th className="px-3 py-2 text-right w-24">Recipients</th>
                  <th className="px-3 py-2 text-right w-24">Open rate</th>
                  <th className="px-3 py-2 text-right w-24">Click rate</th>
                  <th className="px-3 py-2 text-left w-40">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-evari-edge/10">
                {topPerformers.map((i) => (
                  <tr key={i.campaign.id} className="hover:bg-evari-ink/30 transition-colors">
                    <td className="px-3 py-2">
                      <Link href={`/email/campaigns/${i.campaign.id}`} className="text-evari-text font-medium hover:text-evari-gold transition-colors truncate block max-w-[420px]">
                        {i.campaign.name || 'Untitled'}
                      </Link>
                      {i.campaign.subject ? <div className="text-[11px] text-evari-dim truncate">{i.campaign.subject}</div> : null}
                    </td>
                    <td className="px-3 py-2">
                      <KindBadge kind={i.campaign.kind} />
                    </td>
                    <td className="px-3 py-2 text-right text-evari-text font-mono tabular-nums">{i.stats.total.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-evari-gold font-mono tabular-nums">{i.openRate.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right text-evari-text font-mono tabular-nums">{i.clickRate.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-evari-dimmer text-[11px] font-mono tabular-nums">
                      {i.campaign.sentAt ? new Date(i.campaign.sentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, icon, accent }: { label: string; value: string; sub: string; icon: React.ReactNode; accent: 'gold' | 'mute' | 'danger' }) {
  const accentCls = accent === 'gold' ? 'text-evari-gold' : accent === 'danger' ? 'text-evari-danger' : 'text-evari-text';
  return (
    <div className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('inline-flex items-center justify-center h-7 w-7 rounded-md', accent === 'gold' ? 'bg-evari-gold/15' : accent === 'danger' ? 'bg-evari-danger/15' : 'bg-evari-ink/40', accentCls)}>
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-[0.1em] text-evari-dimmer font-medium">{label}</span>
      </div>
      <div className={cn('text-3xl font-bold tabular-nums', accentCls)}>{value}</div>
      <div className="text-[11px] text-evari-dim font-mono tabular-nums mt-1">{sub}</div>
    </div>
  );
}

function KindBadge({ kind }: { kind: Campaign['kind'] }) {
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-[0.1em] font-semibold',
      kind === 'direct' ? 'bg-evari-success/15 text-evari-success' : 'bg-evari-gold/15 text-evari-gold',
    )}>
      {kind === 'direct' ? 'Direct' : 'Newsletter'}
    </span>
  );
}

/**
 * Lightweight SVG line chart — open rate (gold) and click rate
 * (white) over campaign send order. No external chart lib needed
 * for this scale; pure SVG keeps the bundle tiny.
 */
function TrendChart({ items }: { items: Item[] }) {
  const series = useMemo(() => items.map((i) => {
    const opens  = i.stats.delivered > 0 ? (i.stats.opened  / i.stats.delivered) * 100 : 0;
    const clicks = i.stats.delivered > 0 ? (i.stats.clicked / i.stats.delivered) * 100 : 0;
    return { id: i.campaign.id, name: i.campaign.name, opens, clicks, sentAt: i.campaign.sentAt };
  }), [items]);

  const w = 800;
  const h = 220;
  const padL = 36;
  const padR = 16;
  const padT = 12;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const maxY = Math.max(50, Math.ceil(Math.max(...series.flatMap((s) => [s.opens, s.clicks]), 0) / 10) * 10);
  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;

  function point(yPct: number, i: number): string {
    const x = padL + i * stepX;
    const y = padT + innerH - (yPct / maxY) * innerH;
    return `${x},${y}`;
  }
  const opensPath  = series.map((s, i) => point(s.opens, i)).join(' ');
  const clicksPath = series.map((s, i) => point(s.clicks, i)).join(' ');

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ minWidth: '600px' }}>
        {/* Grid lines + axis labels */}
        {[0, 25, 50, 75, 100].filter((v) => v <= maxY).map((v) => {
          const y = padT + innerH - (v / maxY) * innerH;
          return (
            <g key={v}>
              <line x1={padL} y1={y} x2={padL + innerW} y2={y} stroke="rgb(255 255 255 / 0.05)" strokeDasharray="2,2" />
              <text x={padL - 6} y={y + 3} fontSize={10} textAnchor="end" fill="currentColor" className="text-evari-dimmer">{v}%</text>
            </g>
          );
        })}
        {/* Click rate line (subtler) */}
        <polyline points={clicksPath} fill="none" stroke="rgb(255 255 255 / 0.5)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        {/* Open rate line (gold) */}
        <polyline points={opensPath} fill="none" stroke="rgb(208 167 56)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* Dots on the open-rate line */}
        {series.map((s, i) => {
          const x = padL + i * stepX;
          const y = padT + innerH - (s.opens / maxY) * innerH;
          return <circle key={s.id} cx={x} cy={y} r={3} fill="rgb(208 167 56)" />;
        })}
      </svg>
      <div className="flex items-center gap-4 text-[10px] text-evari-dim mt-2 px-1">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-evari-gold" /> Open rate</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-white/50" /> Click rate</span>
      </div>
    </div>
  );
}
