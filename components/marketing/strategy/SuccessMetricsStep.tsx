'use client';

/**
 * Success metrics dashboard. Reads brief.successMetrics for the
 * KPI table and the primary goals; analytics for historical win rate.
 * Benchmarks come from a small set of industry defaults.
 */

import { useEffect, useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { StepTitle } from './StepTitle';

interface Brief {
  successMetrics: { name: string; target?: string }[] | null;
  industries: string[];
  campaignName: string | null;
}
interface Analytics {
  winRateHistorical: number | null;
}

const DEFAULT_KPIS: { kpi: string; target: string; measurement: string; frequency: string }[] = [
  { kpi: 'Reply rate',           target: '15%',     measurement: 'Replies / emails sent',         frequency: 'Weekly' },
  { kpi: 'Meeting booking rate', target: '10%',     measurement: 'Meetings / conversations',      frequency: 'Weekly' },
  { kpi: 'Opportunity rate',     target: '25%',     measurement: 'Opportunities / meetings',      frequency: 'Weekly' },
  { kpi: 'Pipeline conversion rate', target: '30%', measurement: 'Pipeline / opportunities',      frequency: 'Monthly' },
  { kpi: 'Average deal size',    target: '£150K',   measurement: 'Closed won amount',             frequency: 'Monthly' },
  { kpi: 'Sales cycle length',   target: '90 days', measurement: 'Average from first contact to close', frequency: 'Monthly' },
];

const PRIMARY_DEFAULTS = [
  { label: 'Pipeline generated', value: '£1.8M',  sub: 'Per client (annual)' },
  { label: 'Meetings booked',    value: '45',      sub: 'Per month' },
  { label: 'New opportunities',  value: '12',      sub: 'Per month' },
];

const BENCHMARKS = [
  { label: 'Industry reply rate',   value: '8–12%', sub: 'Sector average' },
  { label: 'Industry meeting rate', value: '6–8%',  sub: 'Sector average' },
];

export function SuccessMetricsStep({ playId, brief, onEdit }: { playId: string; brief: Brief; onEdit: () => void }) {
  const [a, setA] = useState<Analytics | null>(null);
  useEffect(() => {
    fetch(`/api/strategy/${playId}/analytics`, { cache: 'no-store' })
      .then((r) => r.json()).then((d) => setA(d?.analytics ?? null)).catch(() => setA(null));
  }, [playId]);

  // Primary goals: first 3 from brief.successMetrics, fall back to defaults.
  const sm = brief.successMetrics ?? [];
  const primary = (sm.length >= 3 ? sm.slice(0, 3) : []).map((m, i) => ({
    label: m.name || PRIMARY_DEFAULTS[i].label,
    value: m.target ?? PRIMARY_DEFAULTS[i].value,
    sub: PRIMARY_DEFAULTS[i].sub,
  }));
  const primaryRows = primary.length > 0 ? primary : PRIMARY_DEFAULTS;

  const kpis = sm.length > 0
    ? sm.map((m) => ({ kpi: m.name || 'KPI', target: m.target ?? '—', measurement: 'Custom', frequency: 'Monthly' }))
    : DEFAULT_KPIS;

  return (
    <div className="space-y-panel">
      <header className="flex items-start gap-2">
        <div className="flex-1">
          <StepTitle substep="Success metrics" />
          <p className="text-[12px] text-evari-dim mt-0.5">Define how we will measure success and track performance.</p>
        </div>
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 hover:bg-evari-gold/5 transition">
          <Pencil className="h-3.5 w-3.5" /> Edit metrics
        </button>
      </header>

      <Card title="Primary success goals" subtitle="The outcomes that matter most.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {primaryRows.map((g, i) => (
            <div key={i} className="text-center">
              <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">{g.label}</div>
              <div className="text-[28px] font-bold text-evari-gold tabular-nums mt-1">{g.value}</div>
              <div className="text-[11px] text-evari-dim">{g.sub}</div>
              <div className="h-0.5 w-12 rounded-full bg-evari-gold/40 mx-auto mt-2" />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Key performance indicators (KPIs)" subtitle="Track the activities that drive our primary goals.">
        <table className="w-full text-[12px]">
          <thead className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">
            <tr>
              <th className="text-left py-2">KPI</th>
              <th className="text-left py-2">Target</th>
              <th className="text-left py-2">Measurement</th>
              <th className="text-left py-2">Frequency</th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((r, i) => (
              <tr key={i} className="border-t border-evari-edge/20">
                <td className="py-2.5 text-evari-text font-medium">{r.kpi}</td>
                <td className="py-2.5 text-evari-text">{r.target}</td>
                <td className="py-2.5 text-evari-dim">{r.measurement}</td>
                <td className="py-2.5 text-evari-dim">{r.frequency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Benchmarks" subtitle="Our targets are based on historical performance and industry benchmarks.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {BENCHMARKS.map((b) => (
            <Bench key={b.label} label={b.label} value={b.value} sub={b.sub} />
          ))}
          <Bench
            label="Our historical win rate"
            value={a === null ? <Loader2 className="h-4 w-4 animate-spin" /> : (a.winRateHistorical !== null ? `${a.winRateHistorical}%` : '—')}
            sub="Real, from past sends"
          />
        </div>
      </Card>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
      <h3 className="text-[13px] font-semibold text-evari-text">{title}</h3>
      {subtitle ? <p className="text-[11px] text-evari-dim mt-0.5 mb-3">{subtitle}</p> : <div className="h-3" />}
      {children}
    </section>
  );
}

function Bench({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] text-evari-dim">{label}</div>
      <div className="text-[26px] font-bold text-evari-gold tabular-nums mt-1">{value}</div>
      {sub ? <div className="text-[10px] text-evari-dim">{sub}</div> : null}
    </div>
  );
}
