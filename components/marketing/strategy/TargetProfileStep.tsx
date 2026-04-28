'use client';

/**
 * Target profile dashboard. Read-only summary of the strategy as it
 * currently stands, computed from Supabase via /api/strategy/[playId]/
 * analytics. Edit fields on the Brief step to change the inputs.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { StepTitle } from './StepTitle';

import { cn } from '@/lib/utils';

interface BreakdownEntry { key: string; label: string; count: number; pct: number }
interface Analytics {
  icpScore: number; icpBand: 'excellent' | 'very_good' | 'good' | 'average' | 'low';
  addressableMarket: number; highFitCount: number;
  reachableContacts: number; decisionMakerCount: number;
  revenuePotentialLabel: string;
  engagementLikelihood: 'High' | 'Medium' | 'Low' | 'Unknown';
  decisionMakers: BreakdownEntry[];
  seniorityMix: BreakdownEntry[];
  industries: string[];
  companySizeMin: number | null; companySizeMax: number | null;
  revenueMin: string | null; revenueMax: string | null;
  locations: string[];
  industryFitPct: number;
}

const PIE_COLORS = ['var(--evari-gold-rgb-comma, #FEC700)', '#7CCFC2', '#4AA39C', '#2F7B7C', '#1F555F', '#5A5A5A'];
const GOLD = '#FEC700';
const TEALS = ['#7CCFC2', '#4AA39C', '#2F7B7C', '#1F555F'];

export function TargetProfileStep({ playId }: { playId: string }) {
  const [a, setA] = useState<Analytics | null>(null);
  useEffect(() => {
    fetch(`/api/strategy/${playId}/analytics`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setA(d?.analytics ?? null))
      .catch(() => setA(null));
  }, [playId]);

  const dmTotal = useMemo(() => (a?.decisionMakers ?? []).reduce((sum, x) => sum + x.count, 0), [a]);

  if (!a) {
    return (
      <div className="flex items-center justify-center py-16 text-evari-dim text-[12px]">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading target profile...
      </div>
    );
  }

  return (
    <div className="space-y-panel">
      <header>
        <StepTitle substep="Target profile" />
        <p className="text-[12px] text-evari-dim mt-0.5">Define the personas, roles and company attributes we need to reach.</p>
      </header>

      {/* Is this a good market */}
      <Card title="Is this a good market to pursue?">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-panel">
          <div className="md:col-span-1 flex items-center gap-3">
            <ScoreDonut value={a.icpScore} />
            <div>
              <div className="text-[12px] text-evari-dim">Ideal customer score</div>
              <div className="text-[12px] font-semibold text-evari-text capitalize">{a.icpBand.replace('_', ' ')}</div>
              <p className="text-[11px] text-evari-dimmer mt-1">Strong alignment across key attributes.</p>
            </div>
          </div>
          <Stat label="Addressable market" value={a.addressableMarket.toLocaleString()} sub="Companies" />
          <Stat label="Reachable contacts" value={a.reachableContacts.toLocaleString()} sub="Decision makers" />
          <Stat label="Revenue potential" value={a.revenuePotentialLabel} sub="Pipeline opportunity" />
          <Stat label="Engagement likelihood" value={a.engagementLikelihood} sub="Based on intent signals" />
        </div>
      </Card>

      {/* Decision makers + Seniority mix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-panel">
        <Card title="Who are the decision makers?">
          <div className="grid grid-cols-2 gap-3 items-center">
            <div className="h-[200px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={a.decisionMakers} dataKey="count" nameKey="label" innerRadius={55} outerRadius={80} stroke="none">
                    {a.decisionMakers.map((entry, i) => <Cell key={entry.key} fill={i === 0 ? GOLD : TEALS[i % TEALS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'rgb(var(--evari-surface))', border: '1px solid rgb(var(--evari-edge))', borderRadius: 6, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-2xl font-bold text-evari-text">{dmTotal}</div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Total</div>
              </div>
            </div>
            <ul className="space-y-1">
              {a.decisionMakers.map((d, i) => (
                <li key={d.key} className="flex items-center gap-2 text-[12px]">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: i === 0 ? GOLD : TEALS[i % TEALS.length] }} />
                  <span className="flex-1 text-evari-text">{d.label}</span>
                  <span className="text-evari-dim font-mono tabular-nums">{d.pct}%</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title="Seniority mix">
          <div className="grid grid-cols-2 gap-3 items-center">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={a.seniorityMix} dataKey="count" nameKey="label" outerRadius={80} stroke="none">
                    {a.seniorityMix.map((entry, i) => <Cell key={entry.key} fill={i === 0 ? GOLD : TEALS[i % TEALS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'rgb(var(--evari-surface))', border: '1px solid rgb(var(--evari-edge))', borderRadius: 6, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1">
              {a.seniorityMix.map((d, i) => (
                <li key={d.key} className="flex items-center gap-2 text-[12px]">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: i === 0 ? GOLD : TEALS[i % TEALS.length] }} />
                  <span className="flex-1 text-evari-text">{d.label}</span>
                  <span className="text-evari-dim font-mono tabular-nums">{d.pct}%</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {/* Ideal company attributes */}
      <Card title="What do our ideal companies look like?">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-panel">
          <Attr label="Industry fit" value={`${a.industryFitPct}%`} sub={a.industries.length > 0 ? a.industries.slice(0, 2).join(', ') : '—'} />
          <Attr label="Company size" value={a.companySizeMin && a.companySizeMax ? `${a.companySizeMin} – ${a.companySizeMax}` : '—'} sub="Employees" />
          <Attr label="Revenue" value={a.revenuePotentialLabel} sub="Annual" />
          <Attr label="Location" value={a.locations.length > 0 ? a.locations.join(', ') : '—'} sub="Primary regions" />
          <Attr label="ICP fit score" value={`${a.icpScore} /100`} sub={a.icpBand.replace('_', ' ')} />
        </div>
      </Card>
    </div>
  );
}

// ─── tiny components ────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
      <h3 className="text-[13px] font-semibold text-evari-text mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-2xl font-bold tabular-nums text-evari-text">{value}</div>
      <div className="text-[11px] text-evari-dim">{label}</div>
      {sub ? <div className="text-[10px] text-evari-dimmer mt-0.5">{sub}</div> : null}
    </div>
  );
}

function Attr({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</div>
      <div className="text-[16px] font-semibold text-evari-text mt-0.5">{value}</div>
      {sub ? <div className="text-[10px] text-evari-dim">{sub}</div> : null}
    </div>
  );
}

function ScoreDonut({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const data = [{ name: 'score', value: pct }, { name: 'rest', value: 100 - pct }];
  return (
    <div className={cn('relative h-20 w-20 shrink-0')}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={28} outerRadius={38} startAngle={90} endAngle={-270} stroke="none">
            <Cell fill={GOLD} />
            <Cell fill="rgb(var(--evari-edge) / 0.4)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[16px] font-bold text-evari-text">{pct}</div>
        <div className="text-[8px] text-evari-dimmer">/100</div>
      </div>
    </div>
  );
}
