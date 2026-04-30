'use client';

/**
 * Target profile stage — the second stage of the Strategy walk.
 *
 * Job of this page: answer "who specifically are we hunting?" Picks
 * for Company size, Revenue, Roles, and Channels live here (sector +
 * geography belong to Market analysis). The donut + pie visualise
 * the role mix; the ideal-companies strip summarises the picks; the
 * Buyer persona card is AI-written prose describing the actual
 * person we will email.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2, Lock, Pencil, Sparkles, Unlock, UserSquare } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { StepTitle } from './StepTitle';
import { ChipPicker } from './ChipPicker';

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
  companySizes: string[];
  revenueMin: string | null;
  revenueMax: string | null;
  revenues: string[];
  channels: string[];
  targetAudience: string[];
  idealCustomer?: string | null;
  locked: boolean;
}

type SeniorityKey = 'c_level' | 'vp' | 'director' | 'head' | 'manager' | 'other';
const SENIORITY_LABEL: Record<SeniorityKey, string> = {
  c_level: 'C-Level', vp: 'VP', director: 'Director',
  head: 'Head of Dept', manager: 'Manager', other: 'Other',
};
const DECISION_KEYS: SeniorityKey[] = ['c_level', 'vp', 'director', 'head'];

function classifyRole(role: string): SeniorityKey {
  const t = role.toLowerCase();
  if (/\b(ceo|cfo|cto|coo|cmo|chief|founder|owner|president)\b/.test(t)) return 'c_level';
  if (/\bvp\b|vice president/.test(t)) return 'vp';
  if (/\bdirector\b/.test(t)) return 'director';
  if (/\bhead\b/.test(t)) return 'head';
  if (/\bmanager\b/.test(t)) return 'manager';
  return 'other';
}

function bucketRoles(roles: string[]): { all: BreakdownEntry[]; decisionMakers: BreakdownEntry[]; total: number } {
  const counts = new Map<SeniorityKey, number>();
  for (const r of roles) {
    const k = classifyRole(r);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  const toEntry = (k: SeniorityKey): BreakdownEntry => {
    const count = counts.get(k) ?? 0;
    return { key: k, label: SENIORITY_LABEL[k], count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
  };
  const all: BreakdownEntry[] = (Object.keys(SENIORITY_LABEL) as SeniorityKey[])
    .map(toEntry)
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);
  const decisionMakers = DECISION_KEYS.map(toEntry).filter((e) => e.count > 0).sort((a, b) => b.count - a.count);
  return { all, decisionMakers, total };
}

export function TargetProfileStep({
  playId,
  brief,
  playTitle,
  pitch,
  onPatch,
}: {
  playId: string;
  brief?: BriefShape;
  playTitle?: string;
  pitch?: string;
  onPatch?: (patch: Partial<BriefShape>) => void;
}) {
  const [a, setA] = useState<Analytics | null>(null);
  useEffect(() => {
    fetch(`/api/strategy/${playId}/analytics`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setA(d?.analytics ?? null))
      .catch(() => setA(null));
  }, [playId]);

  // Chip suggestions for the customer-side picks. Same loader pattern
  // as Market analysis but a different stage tag so the API can tailor
  // the options to who we'll email.
  const [chips, setChips] = useState<{ companySizes: string[]; revenues: string[]; channels: string[]; audience: string[] } | null>(null);
  const [chipsLoading, setChipsLoading] = useState(true);
  useEffect(() => {
    if (brief?.locked) {
      setChipsLoading(false);
      return;
    }
    let cancelled = false;
    setChipsLoading(true);
    fetch(`/api/strategy/${playId}/chips`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage: 'market', playTitle, pitch }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.ok) {
          setChips({
            companySizes: Array.isArray(d.companySizes) ? d.companySizes : [],
            revenues: Array.isArray(d.revenues) ? d.revenues : [],
            channels: Array.isArray(d.channels) ? d.channels : [],
            audience: Array.isArray(d.audience) ? d.audience : [],
          });
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChipsLoading(false); });
    return () => { cancelled = true; };
  }, [playId, playTitle, pitch, brief?.locked]);

  // Persona prose. Re-fetches when the customer-side picks change.
  const [persona, setPersona] = useState<string | null>(null);
  const [personaLoading, setPersonaLoading] = useState(false);
  const sizesKey = (brief?.companySizes ?? []).join('|');
  const revenuesKey = (brief?.revenues ?? []).join('|');
  const audienceKey = (brief?.targetAudience ?? []).join('|');
  const channelsKey = (brief?.channels ?? []).join('|');
  useEffect(() => {
    if (brief?.locked) return;
    if (!brief || (brief.companySizes.length === 0 && brief.revenues.length === 0 && brief.targetAudience.length === 0)) {
      setPersona(null);
      return;
    }
    let cancelled = false;
    const debounce = setTimeout(() => {
      if (cancelled) return;
      setPersonaLoading(true);
      fetch(`/api/strategy/${playId}/persona`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        playTitle,
        pitch,
        industries: brief.industries,
        geographies: brief.geographies ?? [],
        companySizes: brief.companySizes,
        revenues: brief.revenues,
        channels: brief.channels,
        targetAudience: brief.targetAudience,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.ok && typeof d.persona === 'string') setPersona(d.persona);
      })
      .catch(() => {})
        .finally(() => { if (!cancelled) setPersonaLoading(false); });
    }, 1500);
    return () => { cancelled = true; clearTimeout(debounce); };
  }, [playId, playTitle, pitch, sizesKey, revenuesKey, audienceKey, channelsKey, brief?.locked]);

  // Multi-pick chip handlers (mirror the ones in Market analysis but
  // for the customer-side fields).
  function applySizeBand(picked: string[]) {
    if (!onPatch) return;
    if (picked.length === 0) {
      onPatch({ companySizes: [], companySizeMin: null, companySizeMax: null });
      return;
    }
    let minVal: number | null = null;
    let maxVal: number | null = null;
    for (const band of picked) {
      const m = band.match(/(\d+)\s*-\s*(\d+)/);
      if (m) {
        const lo = Number(m[1]);
        const hi = Number(m[2]);
        minVal = minVal === null ? lo : Math.min(minVal, lo);
        maxVal = maxVal === null ? hi : Math.max(maxVal, hi);
        continue;
      }
      const plus = band.match(/(\d+)\+/);
      if (plus) {
        const n = Number(plus[1]);
        minVal = minVal === null ? n : Math.min(minVal, n);
        maxVal = maxVal === null ? 9999 : Math.max(maxVal, 9999);
      }
    }
    onPatch({ companySizes: picked, companySizeMin: minVal, companySizeMax: maxVal });
  }
  function applyRevenueBand(picked: string[]) {
    if (!onPatch) return;
    if (picked.length === 0) {
      onPatch({ revenues: [], revenueMin: null, revenueMax: null });
      return;
    }
    const first = picked[0].match(/(£[^-\s]+)\s*-\s*(£[^\s]+)/);
    const last = picked[picked.length - 1].match(/(£[^-\s]+)\s*-\s*(£[^\s]+)/);
    const lo = first ? first[1] : picked[0];
    const hi = last ? last[2] : picked[picked.length - 1];
    onPatch({ revenues: picked, revenueMin: lo, revenueMax: hi });
  }

  const roles = brief?.targetAudience ?? [];
  const buckets = useMemo(() => bucketRoles(roles), [roles]);
  const dmTotal = buckets.decisionMakers.reduce((acc, x) => acc + x.count, 0);

  const hasDiscoveryData = !!a && a.addressableMarket > 0;
  const hasContactData = !!a && a.reachableContacts > 0;

  if (!a) {
    return (
      <div className="flex items-center justify-center py-16 text-evari-dim text-[12px]">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading target profile...
      </div>
    );
  }

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

  const highFitPctOfMarket = hasDiscoveryData ? Math.round((a.highFitCount / a.addressableMarket) * 100) : 0;
  const locked = !!brief?.locked;

  return (
    <div className="space-y-panel">
      <header className="flex items-start gap-2">
        <div className="flex-1">
          <StepTitle substep="Target profile" />
          <p className="text-[12px] text-evari-dim mt-0.5">
            {locked
              ? 'Locked. Click Unlock to refine; the AI will not redraft until you do.'
              : 'Who specifically are we hunting? Pick the company size, revenue band, roles, and channels. The persona below is what Claude believes you should write to.'}
          </p>
        </div>
        {onPatch ? (
          <button
            type="button"
            onClick={() => onPatch({ locked: !locked })}
            className={locked
              ? 'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold/15 text-evari-gold border border-evari-gold/40 hover:bg-evari-gold/25 transition'
              : 'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-surface text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 transition'}
            title={locked ? 'Unlock to allow AI to refine again' : 'Lock the brief so the AI will not redraft on revisit'}
          >
            {locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {locked ? 'Unlock' : 'Lock'}
          </button>
        ) : null}
      </header>

      {/* Run-Discovery prompt — only shown until Discovery has populated
          the shortlist. The rest of the page stays useful regardless. */}
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
              <div className="text-[13px] font-semibold text-evari-text">Run Discovery to find real companies that match this profile</div>
              <p className="text-[12px] text-evari-dim mt-0.5">
                Once the picks below feel right, Discovery turns the description into a live shortlist with company-level fit scores.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-evari-gold shrink-0" />
          </div>
        </Link>
      ) : null}

      {/* Customer-side chip pickers. Wrapped in a disabled fieldset
          when the brief is locked. */}
      {onPatch ? (
        <fieldset disabled={locked} className={cn('grid grid-cols-1 md:grid-cols-2 gap-panel', locked && 'opacity-70 pointer-events-none')}>
          <ChipPicker
            title="Company size"
            hint="Headcount band(s) of the businesses we want to reach. Pick as many as fit."
            options={chips?.companySizes ?? []}
            selected={brief?.companySizes ?? []}
            onChange={applySizeBand}
            loading={chipsLoading}
          />
          <ChipPicker
            title="Revenue"
            hint="Annual revenue band(s). Pick as many as fit."
            options={chips?.revenues ?? []}
            selected={brief?.revenues ?? []}
            onChange={applyRevenueBand}
            loading={chipsLoading}
          />
          <ChipPicker
            title="Roles to email"
            hint="The job titles we contact. Mix of decision makers and influencers is fine."
            options={chips?.audience ?? []}
            selected={brief?.targetAudience ?? []}
            onChange={(next) => onPatch({ targetAudience: next })}
            loading={chipsLoading}
          />
          <ChipPicker
            title="Channels"
            hint="How we reach this audience."
            options={chips?.channels ?? []}
            selected={brief?.channels ?? []}
            onChange={(next) => onPatch({ channels: next })}
            loading={chipsLoading}
          />
        </fieldset>
      ) : null}

      {/* Buyer persona — AI-written prose describing the actual person
          we'll email. Only renders when the customer-side picks have
          enough to go on. */}
      {persona || personaLoading ? (
        <Card title="Buyer persona" icon={<UserSquare className="h-4 w-4" />}>
          {personaLoading ? (
            <div className="text-[12px] text-evari-dim flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Claude is sketching the buyer…
            </div>
          ) : persona ? (
            <p className="text-[13px] text-evari-text leading-relaxed">{persona}</p>
          ) : null}
        </Card>
      ) : null}

      {/* Decision makers + Seniority mix — bucketed from the role
          chip. Hides when targetAudience is empty so we never render
          an empty pie. */}
      {buckets.all.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-panel">
          {buckets.decisionMakers.length > 0 ? (
            <Card title="Decision makers we will target">
              <div className="grid grid-cols-2 gap-3 items-center">
                <div className="h-[200px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={buckets.decisionMakers} dataKey="count" nameKey="label" innerRadius={55} outerRadius={80} stroke="none">
                        {buckets.decisionMakers.map((entry, i) => <Cell key={entry.key} fill={TEAL_PALETTE[i % TEAL_PALETTE.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'rgb(var(--evari-surface))', border: '1px solid rgb(var(--evari-edge))', borderRadius: 6, fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-2xl font-bold text-evari-text">{dmTotal}</div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Roles</div>
                  </div>
                </div>
                <ul className="space-y-1">
                  {buckets.decisionMakers.map((d, i) => (
                    <li key={d.key} className="flex items-center gap-2 text-[12px]">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: TEAL_PALETTE[i % TEAL_PALETTE.length] }} />
                      <span className="flex-1 text-evari-text">{d.label}</span>
                      <span className="text-evari-dim font-mono tabular-nums">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ) : null}

          <Card title="Seniority mix targeted">
            <div className="grid grid-cols-2 gap-3 items-center">
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={buckets.all} dataKey="count" nameKey="label" outerRadius={80} stroke="none">
                      {buckets.all.map((entry, i) => <Cell key={entry.key} fill={TEAL_PALETTE[i % TEAL_PALETTE.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'rgb(var(--evari-surface))', border: '1px solid rgb(var(--evari-edge))', borderRadius: 6, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1">
                {buckets.all.map((d, i) => (
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

      {/* Ideal company strip — summary of the picks above. */}
      <Card title="What do our ideal companies look like?">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-panel">
          <Attr label="Industry" value={brief?.industries && brief.industries.length > 0 ? brief.industries.slice(0, 3).join(', ') : '—'} sub={brief?.industries && brief.industries.length > 1 ? `${brief.industries.length} sectors` : 'Sector'} />
          <Attr label="Company size" value={sizesPretty} sub="Employees" />
          <Attr label="Revenue" value={revenuesPretty} sub="Annual" />
          <Attr label="Location" value={locationsPretty} sub="Primary regions" />
          <Attr label="ICP fit score" value={`${a.icpScore} /100`} sub={a.icpBand.replace('_', ' ')} />
        </div>
      </Card>

      {/* Standout numbers — only shown once Discovery has actually
          produced data. */}
      {hasDiscoveryData || hasContactData ? (
        <Card title="What Discovery has found so far">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-panel items-start">
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
            <SummaryStat
              big={String(a.icpScore)}
              pill={a.icpBand.replace('_', ' ')}
              label="ICP fit score"
              sub="Across the shortlist"
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

// ─── tiny components ────────────────────────────────────────

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
      <h3 className="text-[13px] font-semibold text-evari-text mb-3 flex items-center gap-2">
        {icon ? (
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-evari-gold/15 text-evari-gold">{icon}</span>
        ) : null}
        {title}
      </h3>
      {children}
    </section>
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
