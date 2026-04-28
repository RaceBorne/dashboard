'use client';

/**
 * Launch-step panel: performance forecast + compliance & deliverability
 * checklist. Mounted on the Send step of the campaign wizard so the
 * operator gets a sanity check before clicking the send button.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronUp, Info, Loader2, ShieldCheck, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';

interface Forecast {
  recipientCount: number;
  predictedOpenRate: number;
  predictedReplyRate: number;
  predictedOpenCount: number;
  predictedReplyCount: number;
  predictedMeetings: { lo: number; hi: number };
  predictedPipeline: { lo: number; hi: number; currency: string };
  basis: 'historical' | 'defaults';
}

interface Check {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export function LaunchChecksPanel({ campaignId, recipientCount }: { campaignId: string; recipientCount: number }) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);

  useEffect(() => {
    if (!campaignId) return;
    fetch(`/api/marketing/campaigns/${campaignId}/forecast?recipientCount=${recipientCount}`, { cache: 'no-store' })
      .then((r) => r.json()).then((d) => { if (d?.ok) setForecast(d.forecast); }).catch(() => {});
    fetch(`/api/marketing/campaigns/${campaignId}/compliance`, { cache: 'no-store' })
      .then((r) => r.json()).then((d) => { if (d?.ok) setChecks(d.checks); }).catch(() => {});
  }, [campaignId, recipientCount]);

  return (
    <div className="grid grid-cols-2 gap-3 mt-3">
      <ForecastCard forecast={forecast} />
      <ChecksCard checks={checks} />
    </div>
  );
}

function ForecastCard({ forecast }: { forecast: Forecast | null }) {
  if (!forecast) {
    return (
      <div className="rounded-panel bg-evari-surface border border-evari-edge/30 p-3 text-[12px] text-evari-dim flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading forecast...
      </div>
    );
  }
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  const fmt = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: forecast.predictedPipeline.currency, maximumFractionDigits: 0 }).format(n);
  return (
    <div className="rounded-panel bg-evari-surface border border-evari-edge/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-evari-gold/15 text-evari-gold"><TrendingUp className="h-3.5 w-3.5" /></span>
        <span className="text-[11px] uppercase tracking-[0.12em] text-evari-dimmer">Performance forecast</span>
        <span className="ml-auto text-[10px] text-evari-dimmer">{forecast.basis === 'historical' ? 'From your last 90 days' : 'From defaults'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <Stat label="Open rate" value={pct(forecast.predictedOpenRate)} sub={`${forecast.predictedOpenCount} opens`} />
        <Stat label="Reply rate" value={pct(forecast.predictedReplyRate)} sub={`${forecast.predictedReplyCount} replies`} />
        <Stat label="Meetings booked" value={`${forecast.predictedMeetings.lo}–${forecast.predictedMeetings.hi}`} sub="estimate" />
        <Stat label="Pipeline impact" value={`${fmt(forecast.predictedPipeline.lo)}–${fmt(forecast.predictedPipeline.hi)}`} sub="estimate" />
      </div>
    </div>
  );
}

function ChecksCard({ checks }: { checks: Check[] | null }) {
  if (!checks) {
    return (
      <div className="rounded-panel bg-evari-surface border border-evari-edge/30 p-3 text-[12px] text-evari-dim flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running compliance checks...
      </div>
    );
  }
  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  return (
    <div className="rounded-panel bg-evari-surface border border-evari-edge/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('inline-flex items-center justify-center h-6 w-6 rounded-md',
          fails > 0 ? 'bg-evari-danger/15 text-evari-danger' : warns > 0 ? 'bg-evari-warn/15 text-evari-warn' : 'bg-evari-success/15 text-evari-success')}>
          <ShieldCheck className="h-3.5 w-3.5" />
        </span>
        <span className="text-[11px] uppercase tracking-[0.12em] text-evari-dimmer">Compliance & deliverability</span>
      </div>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-[12px]">
            {c.status === 'pass' ? <CheckCircle2 className="h-3.5 w-3.5 text-evari-success mt-0.5 shrink-0" />
              : c.status === 'warn' ? <AlertTriangle className="h-3.5 w-3.5 text-evari-warn mt-0.5 shrink-0" />
              : <AlertTriangle className="h-3.5 w-3.5 text-evari-danger mt-0.5 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-evari-text">{c.label}</div>
              <div className="text-[10px] text-evari-dim">{c.message}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-evari-edge/20 bg-evari-ink/30 p-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</div>
      <div className="text-evari-text font-semibold tabular-nums text-[14px]">{value}</div>
      {sub ? <div className="text-[10px] text-evari-dim">{sub}</div> : null}
    </div>
  );
}
