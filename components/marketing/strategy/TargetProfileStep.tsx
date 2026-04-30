'use client';

/**
 * Target profile dashboard. Read-only summary of the strategy as it
 * currently stands, computed from Supabase via /api/strategy/[playId]/
 * analytics. Edit fields on the Brief step to change the inputs.
 *
 * Layout follows the design mockup:
 *  1. Header with subtitle.
 *  2. "Is this a good market?" headline card with ICP donut + four
 *     KPIs (addressable market / reachable contacts / revenue
 *     potential / engagement likelihood).
 *  3. Decision makers donut + Seniority pie (side by side).
 *  4. Ideal companies attribute strip (5 fields from the brief).
 *  5. Target summary card with prose + stand-out numbers.
 *
 * If Discovery has not yet been run for this play
 * (addressableMarket = 0) we show a single banner at the top inviting
 * the user to run it, and suppress charts that need shortlist or
 * enrichment data.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
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
  bestFitCompaniesCount: number;
  idealCustomerSummary: string;
}

// Teal-first palette per CLAUDE.md ("Chart palette is teal, not gold").
const TEAL_PRIMARY = '#4AA39C';
const TEAL_PALETTE = ['#4AA39C', '#7CCFC2', '#2F7B7C', '#A6DCD3', '#1F555F', '#5A5A5A'];

interface BriefShape {
  industries: string[];
  geography: string | null;
  geographies?: string[];
  companySizeMin: number | null;
  companySizeMax: number | null;
  companySizes?: string[];
  revenueMin: string | null;
  revenueMax: string | null;
  revenues?: string[];
  channels: string[];
  targetAudience: string[];
  idealCustomer?: string | null;
}

export function TargetProfileStep({ playId, brief }: { playId: string; brief?: BriefShape }) {
  const [a, setA] = useState<Analytics | null>(null);
  useEffect(() => {
    fetch(`/api/strategy/${playId}/analytics`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setA(d?.analytics ?? null))
      .catch(() => setA(null));
  }, [playId]);

  const dmTotal = useMemo(() => (a?.decisionMakers ?? []).reduce((sum, x) => sum + x.count, 0), [a]);
  const hasDiscoveryData = !!a && a.addressableMarket > 0;
  const hasContactData = !!a && a.reachableContacts > 0;

  if (!a) {
    return (
      <div className="flex items-center justify-center py-16 text-evari-dim text-[12px]">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading target profile...
      </div>
    );
  }

  // Prefer the multi-pick arrays where present; fall back to the legacy
  // single fields so old briefs still render. Trim em-dashes per
  // CLAUDE.md.
  const sizesPretty =
    brief?.companySizes && brief.companySizes.length > 0
      ? brief.companySizes.join(', ')
      : (brief?.companySizeMin && brief?.companySizeMax)
        ? `${brief.companySizeMin} to ${brief.companySizeMax}`
        : '—';

  const revenuesPretty =
    brief?.revenues && brief.revenues.length > 0
      ? brief.revenues.join(', ')
      : (brief?.revenueMin && brief?.revenueMax)
        ? `${brief.revenueMin} to ${brief.revenueMax}`
        : '—';

  const locationsPretty =
    brief?.geographies && brief.geographies.length > 0
      ? brief.geographies.join(', ')
      : (a.locations.length > 0 ? a.locations.join(', ') : (brief?.geography ?? '—'));

  const industryFitPct = a.industryFitPct;
  const highFitPctOfMarket = hasDiscoveryData ? Math.round((a.highFitCount / a.addressableMarket) * 100) : 0;

  return (
    <div className="space-y-panel">
      <header>
        <StepTitle substep="Target profile" />
        <p className="text-[12px] text-evari-dim mt-0.5">Define the personas, roles and company attributes we need to reach.</p>
      </header>

      {/* Run-Discovery prompt — only shown until Discovery has populated
          the shortlist. Keeps the rest of the page useful by drawing
          the user's eye to the action that unlocks the live numbers. */}
      {!hasDiscoveryData ? (
        <Link
          href={`/discover?playId=${playId}`}
          className="block rounded-panel border border-evari-gold/40 bg-evari-gold/5 hover:bg-evari-gold/10 p-4 transition"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-evari-gold/15 text-evari-gold shrink-0">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-evari-text">Run Discovery to populate this profile</div>
              <p className="text-[12px] text-evari-dim mt-0.5">
                Industry, company size, revenue and location come straight from the brief. The market-size, decision-maker and seniority numbers fill in once Discovery has shortlisted real companies.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-evari-gold shrink-0" />
          </div>
        </Link>
      ) : null}

      {/* Is this a good market */}
      <Card title="Is this a good market to pursue?">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-panel items-center">
          <div className="md:col-span-1 flex items-center gap-3">
            <ScoreDonut value={a.icpScore} />
            <div>
              <div className="text-[12px] text-evari-dim">Ideal customer score</div>
              <div className="text-[12px] font-semibold text-evari-text capitalize">{a.icpBand.replace('_', ' ')}</div>
              <p className="text-[11px] text-evari-dimmer mt-1">
                {hasDiscoveryData ? 'Strong alignment across key attributes.' : 'Score is a baseline from the rubric. Run Discovery for a real market read.'}
              </p>
            </div>
          </div>
          <Stat label="Addressable market" value={hasDiscoveryData ? a.addressableMarket.toLocaleString() : '—'} sub="Companies" />
          <Stat label="Reachable contacts" value={hasContactData ? a.reachableContacts.toLocaleString() : '—'} sub="Decision makers" />
          <Stat label="Revenue potential" value={a.revenuePotentialLabel || '—'} sub="Pipeline opportunity" />
          <Stat label="Engagement likelihood" value={a.engagementLikelihood === 'Unknown' ? '—' : a.engagementLikelihood} sub="Based on intent signals" />
        </div>
      </Card>

      {/* Decision makers + Seniority mix. Both depend on enrichment data
          so we only render them when contacts have been hunted. */}
      {hasContactData ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-panel">
          <Card title="Who are the decision makers?">
            <div className="grid grid-cols-2 gap-3 items-center">
              <div className="h-[200px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={a.decisionMakers} dataKey="count" nameKey="label" innerRadius={55} outerRadius={80} stroke="none">
                      {a.decisionMakers.map((entry, i) => <Cell key={entry.key} fill={TEAL_PALETTE[i % TEAL_PALETTE.length]} />)}
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
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: TEAL_PALETTE[i % TEAL_PALETTE.length] }} />
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
                      {a.seniorityMix.map((entry, i) => <Cell key={entry.key} fill={TEAL_PALETTE[i % TEAL_PALETTE.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'rgb(var(--evari-surface))', border: '1px solid rgb(var(--evari-edge))', borderRadius: 6, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1">
                {a.seniorityMix.map((d, i) => (
                  <li key={d.key} className="flex items-center gap-2 text-[12px]">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: TEAL_PALETTE[i % TEAL_PALETTE.length] }} />
                    <span className="flex-1 text-evari-text">{d.label}</span>
                    <span className="text-evari-dim font-mono tabular-nums">{d.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      ) : null}

      {/* Ideal company attributes (always renders — derives from the
          brief, not from Discovery). */}
      <Card title="What do our ideal companies look like?">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-panel">
          <Attr label="Industry fit" value={hasDiscoveryData ? `${industryFitPct}%` : '—'} sub={(brief?.industries && brief.industries.length > 0) ? brief.industries.slice(0, 2).join(', ') : '—'} />
          <Attr label="Company size" value={sizesPretty} sub="Employees" />
          <Attr label="Revenue" value={revenuesPretty} sub="Annual revenue" />
          <Attr label="Location" value={locationsPretty} sub="Primary regions" />
          <Attr label="ICP fit score" value={`${a.icpScore} /100`} sub={a.icpBand.replace('_', ' ')} />
        </div>
      </Card>

      {/* Target summary — prose on the left, two stand-out numbers on
          the right. Hide entirely when there is neither prose nor real
          numbers, so we never display a hollow card. */}
      {(brief?.idealCustomer && brief.idealCustomer.trim().length > 0) || hasDiscoveryData || hasContactData ? (
        <Card title="Target summary">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-panel items-start">
            <div className="md:col-span-2">
              {brief?.idealCustomer && brief.idealCustomer.trim().length > 0 ? (
                <p className="text-[12px] text-evari-text leading-relaxed">{brief.idealCustomer}</p>
              ) : (
                <p className="text-[12px] text-evari-dim leading-relaxed">{a.idealCustomerSummary}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-panel">
              {hasDiscoveryData ? (
                <SummaryStat
                  big={a.highFitCount.toLocaleString()}
                  pill={`${highFitPctOfMarket}%`}
                  label="High fit companies"
                  sub="Out of addressable market"
                />
              ) : null}
              {hasContactData ? (
                <SummaryStat
                  big={a.decisionMakerCount.toLocaleString()}
                  label="Reachable decision makers"
                  sub="Across target accounts"
                />
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}
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
      <div className="text-[16px] font-semibold text-evari-text mt-0.5 break-words">{value}</div>
      {sub ? <div className="text-[10px] text-evari-dim mt-0.5 capitalize">{sub}</div> : null}
    </div>
  );
}

function SummaryStat({ big, pill, label, sub }: { big: string; pill?: string; label: string; sub: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-evari-text">{big}</span>
        {pill ? <span className="text-[11px] text-evari-dim">({pill})</span> : null}
      </div>
      <div className="text-[11px] text-evari-text font-semibold">{label}</div>
      <div className="text-[10px] text-evari-dim">{sub}</div>
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
            <Cell fill={TEAL_PRIMARY} />
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
