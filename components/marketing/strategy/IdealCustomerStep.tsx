'use client';

/**
 * Ideal customer dashboard. Read-only summary derived from Supabase
 * via /api/strategy/[playId]/analytics, plus an inline editor for the
 * ideal-customer prose because that's the one field the operator
 * routinely tweaks while reviewing this view.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

import { cn } from '@/lib/utils';
import { AIDraftButton } from '@/components/ai/AIDraftButton';

interface Analytics {
  icpScore: number; icpBand: 'excellent' | 'very_good' | 'good' | 'average' | 'low';
  industries: string[];
  companySizeMin: number | null; companySizeMax: number | null;
  revenueMin: string | null; revenueMax: string | null;
  locations: string[];
  industryFitPct: number;
  techStack: string[]; buyingSignals: string[];
  idealCustomerSummary: string;
  bestFitCompaniesCount: number;
  reachableContacts: number;
  decisionMakerCount: number;
  winRateHistorical: number | null;
}

const GOLD = '#FEC700';

export function IdealCustomerStep({ playId, brief }: { playId: string; brief: { idealCustomer: string | null; set: (k: 'idealCustomer', v: string | null) => void } }) {
  const [a, setA] = useState<Analytics | null>(null);
  useEffect(() => {
    fetch(`/api/strategy/${playId}/analytics`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setA(d?.analytics ?? null))
      .catch(() => setA(null));
  }, [playId]);

  if (!a) {
    return (
      <div className="flex items-center justify-center py-16 text-evari-dim text-[12px]">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading ideal customer profile...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-[20px] font-bold text-evari-text">Ideal customer</h2>
        <p className="text-[12px] text-evari-dim mt-0.5">Define the companies we get the most value from.</p>
      </header>

      <Card title="What does an ideal customer look like?">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
          <div className="md:col-span-1 flex items-center gap-3">
            <ScoreDonut value={a.icpScore} />
            <div>
              <div className="text-[12px] text-evari-dim">ICP fit score</div>
              <div className="text-[12px] font-semibold text-evari-gold capitalize">Strong fit</div>
            </div>
          </div>
          <Attr label="Industry" value={a.industries.length > 0 ? a.industries.join(', ') : '—'} sub="Top industries" />
          <Attr label="Company size" value={a.companySizeMin && a.companySizeMax ? `${a.companySizeMin} – ${a.companySizeMax}` : '—'} sub="Sweet spot" />
          <Attr label="Revenue" value={a.revenueMin && a.revenueMax ? `${a.revenueMin} – ${a.revenueMax}` : '—'} sub="Sweet spot" />
          <Attr label="Location" value={a.locations.length > 0 ? a.locations.join(', ') : '—'} sub="Top concentration" />
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Company profile">
          <p className="text-[11px] text-evari-dim mb-2">Key characteristics of our best customers.</p>
          <div className="space-y-2">
            <BarRow label="Industry alignment" pct={a.industryFitPct} hint={pctHint(a.industryFitPct)} />
            <BarRow label="Reachable contacts" pct={Math.min(100, Math.round((a.reachableContacts / Math.max(1, a.bestFitCompaniesCount * 5)) * 100))} hint={`${a.reachableContacts} found`} />
            <BarRow label="Decision-maker depth" pct={Math.min(100, Math.round((a.decisionMakerCount / Math.max(1, a.reachableContacts)) * 100))} hint={`${a.decisionMakerCount} of ${a.reachableContacts}`} />
          </div>
        </Card>

        <Card title="Common tech stack">
          <p className="text-[11px] text-evari-dim mb-2">Technologies most often used.</p>
          {a.techStack.length === 0 ? (
            <div className="text-[11px] text-evari-dimmer">Not enough data yet. Enrich more contacts to surface a stack.</div>
          ) : (
            <ul className="space-y-1">
              {a.techStack.slice(0, 6).map((t) => <li key={t} className="text-[12px] text-evari-text">{t}</li>)}
            </ul>
          )}
        </Card>

        <Card title="Top buying signals">
          <p className="text-[11px] text-evari-dim mb-2">What indicates intent to buy.</p>
          {a.buyingSignals.length === 0 ? (
            <div className="text-[11px] text-evari-dimmer">No signals detected in the current shortlist.</div>
          ) : (
            <ul className="space-y-1">
              {a.buyingSignals.slice(0, 6).map((t) => <li key={t} className="text-[12px] text-evari-text">{t}</li>)}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Ideal customer summary">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-2">
            <p className="text-[12px] text-evari-text leading-relaxed whitespace-pre-wrap">{a.idealCustomerSummary}</p>
            <div className="flex items-center gap-2 pt-1">
              <AIDraftButton
                field="free"
                value={brief.idealCustomer ?? a.idealCustomerSummary}
                context={`Update the ideal customer prose for industry ${a.industries.join(', ')}, geography ${a.locations.join(', ')}.`}
                onApply={(v) => brief.set('idealCustomer', v)}
              />
              <span className="text-[10px] text-evari-dimmer">Edits write back to the Brief step.</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 self-start">
            <SmallStat label="Best fit companies" value={a.bestFitCompaniesCount.toLocaleString()} sub="Score ≥ 80" />
            <SmallStat label="Reachable accounts" value={a.reachableContacts.toLocaleString()} sub="Decision makers in target accounts" />
            <SmallStat label="Win rate (historical)" value={a.winRateHistorical !== null ? `${a.winRateHistorical}%` : '—'} sub="Average open rate, similar customers" />
          </div>
        </div>
      </Card>
    </div>
  );
}

function pctHint(pct: number): string {
  if (pct >= 80) return 'High';
  if (pct >= 50) return 'Medium';
  return 'Low';
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4">
      <h3 className="text-[13px] font-semibold text-evari-text mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Attr({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</div>
      <div className="text-[14px] font-semibold text-evari-text mt-0.5">{value}</div>
      {sub ? <div className="text-[10px] text-evari-dim mt-0.5">{sub}</div> : null}
    </div>
  );
}

function SmallStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-evari-edge/20 bg-evari-ink/30 p-2">
      <div className="text-2xl font-bold tabular-nums text-evari-text">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</div>
      {sub ? <div className="text-[10px] text-evari-dim mt-0.5">{sub}</div> : null}
    </div>
  );
}

function BarRow({ label, pct, hint }: { label: string; pct: number; hint?: string }) {
  return (
    <div className="grid grid-cols-[100px_1fr_auto] items-center gap-2 text-[11px]">
      <span className="text-evari-dim">{label}</span>
      <div className="h-1.5 rounded-full bg-evari-edge/30 overflow-hidden">
        <div className="h-full rounded-full bg-evari-gold" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      {hint ? <span className="text-evari-dim font-mono tabular-nums">{hint}</span> : null}
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
