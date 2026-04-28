'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AnalyticsRange, AnalyticsSummary, FunnelTotals } from '@/lib/marketing/analytics';

interface Props {
  initialSummary: AnalyticsSummary;
  senderMode: 'stub' | 'live';
}

const RANGES: AnalyticsRange[] = ['7d', '30d', '90d', 'all'];
const RANGE_LABEL: Record<AnalyticsRange, string> = {
  '7d':  'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  'all': 'All time',
};

function pct(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '0%';
  return `${(v * 100).toFixed(1)}%`;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}
function Kpi({ label, value, hint, tone = 'neutral' }: KpiProps) {
  const valueCls = {
    neutral: 'text-evari-text',
    good:    'text-evari-success',
    warn:    'text-orange-400',
    bad:     'text-evari-danger',
  }[tone];
  return (
    <div className="rounded-panel bg-evari-surface border border-evari-edge/30 p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', valueCls)}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-evari-dimmer">{hint}</div> : null}
    </div>
  );
}

export function AnalyticsClient({ initialSummary, senderMode }: Props) {
  const [summary, setSummary] = useState<AnalyticsSummary>(initialSummary);
  const [range, setRange] = useState<AnalyticsRange>(initialSummary.range);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSummary(initialSummary), [initialSummary]);

  async function load(next: AnalyticsRange) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/marketing/analytics?range=${next}`, { cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as AnalyticsSummary | null;
      if (data) {
        setSummary(data);
        setRange(next);
      }
    } finally {
      setBusy(false);
    }
  }

  const t: FunnelTotals = summary.totals;

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="inline-flex rounded-panel bg-evari-surface border border-evari-edge/30 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => load(r)}
              disabled={busy}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-medium transition-colors duration-500 ease-in-out',
                range === r ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text',
              )}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        {senderMode === 'stub' ? (
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-orange-500/15 text-orange-400">
            Sender stubbed — no live mail
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => load(range)}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-evari-ink text-evari-dim hover:text-evari-text disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {/* Top-line KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        <Kpi label="Total sent" value={fmt(t.sent)} hint={`${fmt(summary.campaignsRun)} campaign${summary.campaignsRun === 1 ? '' : 's'}`} />
        <Kpi label="Open rate" value={pct(summary.rates.openRate)} hint={`${fmt(t.opened)} of ${fmt(t.delivered)} delivered`} tone={summary.rates.openRate >= 0.2 ? 'good' : 'neutral'} />
        <Kpi label="Click rate" value={pct(summary.rates.clickRate)} hint={`${fmt(t.clicked)} clicks · CTOR ${pct(summary.rates.clickToOpenRate)}`} tone={summary.rates.clickRate >= 0.02 ? 'good' : 'neutral'} />
        <Kpi label="Bounce rate" value={pct(summary.rates.bounceRate)} hint={`${fmt(t.bounced)} bounced`} tone={summary.rates.bounceRate >= 0.05 ? 'bad' : summary.rates.bounceRate >= 0.02 ? 'warn' : 'neutral'} />
      </div>

      {/* Funnel breakdown */}
      <div className="mb-3 rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
        <h2 className="text-sm font-semibold text-evari-text mb-3">Funnel</h2>
        <ol className="space-y-1.5">
          {[
            { label: 'Sent', value: t.sent, base: t.total },
            { label: 'Delivered', value: t.delivered, base: t.sent },
            { label: 'Opened', value: t.opened, base: t.delivered },
            { label: 'Clicked', value: t.clicked, base: t.delivered },
          ].map((s) => {
            const ratio = s.base > 0 ? s.value / s.base : 0;
            return (
              <li key={s.label} className="grid grid-cols-[120px_1fr_80px] items-center gap-2 text-sm">
                <span className="text-evari-dim">{s.label}</span>
                <div className="h-2 rounded-full bg-evari-ink overflow-hidden">
                  <div
                    className="h-full bg-evari-gold transition-[width] duration-500 ease-in-out"
                    style={{ width: `${Math.min(100, ratio * 100)}%` }}
                  />
                </div>
                <span className="text-right text-evari-text font-mono tabular-nums text-xs">
                  {fmt(s.value)} <span className="text-evari-dimmer">({pct(ratio)})</span>
                </span>
              </li>
            );
          })}
          {t.bounced > 0 || t.suppressed > 0 || t.failed > 0 ? (
            <li className="grid grid-cols-[120px_1fr_80px] gap-2 text-xs text-evari-dimmer pt-1.5 border-t border-evari-edge/20">
              <span>Drops</span>
              <span>
                Bounced {fmt(t.bounced)} · Failed {fmt(t.failed)} · Suppressed {fmt(t.suppressed)}
              </span>
              <span />
            </li>
          ) : null}
        </ol>
      </div>

      {/* Top campaigns */}
      <div className="rounded-panel bg-evari-surface border border-evari-edge/30 overflow-hidden">
        <div className="px-3 py-2 border-b border-evari-edge/30 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-evari-text">Top campaigns</h2>
          <Link href="/email/campaigns" className="text-xs text-evari-dim hover:text-evari-text transition-colors">
            All campaigns →
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-evari-dimmer border-b border-evari-edge/30">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium text-right">Sent</th>
              <th className="px-3 py-2 font-medium text-right">Open</th>
              <th className="px-3 py-2 font-medium text-right">Click</th>
              <th className="px-3 py-2 font-medium text-right">Bounce</th>
            </tr>
          </thead>
          <tbody>
            {summary.topCampaigns.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center text-evari-dimmer text-sm">
                  No campaigns sent in this window.
                </td>
              </tr>
            ) : (
              summary.topCampaigns.map((c) => (
                <tr key={c.campaign.id} className="border-b border-evari-edge/20 last:border-0 hover:bg-evari-surfaceSoft/40">
                  <td className="px-3 py-2">
                    <Link href={`/email/campaigns/${c.campaign.id}`} className="text-evari-text font-medium hover:text-evari-gold transition-colors">
                      {c.campaign.name || 'Untitled'}
                    </Link>
                    <div className="text-[11px] text-evari-dimmer truncate max-w-[280px]">{c.campaign.subject}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-evari-text font-mono tabular-nums text-xs">{fmt(c.totals.sent)}</td>
                  <td className="px-3 py-2 text-right text-evari-text font-mono tabular-nums text-xs">{pct(c.rates.openRate)}</td>
                  <td className="px-3 py-2 text-right text-evari-text font-mono tabular-nums text-xs">{pct(c.rates.clickRate)}</td>
                  <td className={cn('px-3 py-2 text-right font-mono tabular-nums text-xs', c.rates.bounceRate >= 0.05 ? 'text-evari-danger' : c.rates.bounceRate >= 0.02 ? 'text-orange-400' : 'text-evari-dim')}>
                    {pct(c.rates.bounceRate)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
