'use client';

/**
 * Brief summary dashboard. Shows everything captured across the
 * other steps in one read-only view. Top-right Edit brief opens the
 * unified BriefEditorDrawer scoped to Overview by default.
 */

import { useEffect, useState } from 'react';
import { Loader2, Lock, Mail, MessageSquare, Pencil, Send, Target, TrendingUp, Unlock, Users } from 'lucide-react';
import { StepTitle } from './StepTitle';

import { humaniseChannel } from './BriefEditorDrawer';
import { SpitballPanel } from './SpitballPanel';
import { ChipPicker } from './ChipPicker';
import { cn } from '@/lib/utils';

interface Brief {
  campaignName: string | null;
  objective: string | null;
  targetAudience: string[];
  geography: string | null;
  geographies: string[];
  industries: string[];
  companySizeMin: number | null;
  companySizeMax: number | null;
  companySizes: string[];
  revenueMin: string | null;
  revenueMax: string | null;
  revenues: string[];
  channels: string[];
  messaging: { angle: string; line?: string }[] | null;
  successMetrics: { name: string; target?: string }[] | null;
  idealCustomer: string | null;
  locked: boolean;
}

interface Analytics {
  icpScore: number; icpBand: string;
  addressableMarket: number; reachableContacts: number;
  revenuePotentialLabel: string;
  decisionMakerCount: number;
  industries: string[]; companySizeMin: number | null; companySizeMax: number | null;
  revenueMin: string | null; revenueMax: string | null; locations: string[];
}

const PRIORITY_ORDER = ['email', 'linkedin_organic', 'linkedin_paid', 'phone', 'event', 'website', 'social'];
function priorityFor(channel: string, picked: string[]): 'High' | 'Medium' | 'Low' {
  if (!picked.includes(channel)) return 'Low';
  const i = PRIORITY_ORDER.indexOf(channel);
  if (i <= 1) return 'High';
  if (i <= 3) return 'Medium';
  return 'Low';
}

export function BriefSummaryStep({ playId, brief, onEdit, playTitle, pitch, onPatch }: { playId: string; brief: Brief; onEdit: () => void; playTitle: string; pitch: string; onPatch: (patch: Partial<Brief>) => void }) {
  const [a, setA] = useState<Analytics | null>(null);
  useEffect(() => {
    fetch(`/api/strategy/${playId}/analytics`, { cache: 'no-store' })
      .then((r) => r.json()).then((d) => setA(d?.analytics ?? null)).catch(() => setA(null));
  }, [playId]);

  // Chip suggestions for this stage. Loaded once per play; the AI
  // tailors options to the pitch + idea. Fallback static options ship
  // from the API if the gateway is offline.
  const [chips, setChips] = useState<{ industries: string[]; geographies: string[]; companySizes: string[]; revenues: string[]; channels: string[]; audience: string[] } | null>(null);
  const [chipsLoading, setChipsLoading] = useState(true);
  useEffect(() => {
    // Locked briefs never re-fetch chip suggestions. The picks the user
    // already made still render (we feed them into the picker as
    // `selected`); we just don't ask the AI for fresh options.
    if (brief.locked) {
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
            industries:   Array.isArray(d.industries)   ? d.industries   : [],
            geographies:  Array.isArray(d.geographies)  ? d.geographies  : [],
            companySizes: Array.isArray(d.companySizes) ? d.companySizes : [],
            revenues:     Array.isArray(d.revenues)     ? d.revenues     : [],
            channels:     Array.isArray(d.channels)     ? d.channels     : [],
            audience:     Array.isArray(d.audience)     ? d.audience     : [],
          });
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChipsLoading(false); });
    return () => { cancelled = true; };
  }, [playId, playTitle, pitch, brief.locked]);

  // Multi-pick chip handlers. The brief stores both the raw band labels
  // (companySizes / revenues / geographies arrays) AND a derived numeric
  // span (companySizeMin..Max, revenueMin..Max) for backwards-compatible
  // analytics. The arrays preserve exactly what the user picked.
  function applySizeBand(picked: string[]) {
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
    if (picked.length === 0) {
      onPatch({ revenues: [], revenueMin: null, revenueMax: null });
      return;
    }
    // Heuristic: take min from first band, max from last band so the
    // numeric span covers the union. Order is whatever order the user
    // clicked (which usually correlates with revenue magnitude). For the
    // numeric span we just take the first and last band's tokens.
    const first = picked[0].match(/(£[^-\s]+)\s*-\s*(£[^\s]+)/);
    const last = picked[picked.length - 1].match(/(£[^-\s]+)\s*-\s*(£[^\s]+)/);
    const lo = first ? first[1] : picked[0];
    const hi = last ? last[2] : picked[picked.length - 1];
    onPatch({ revenues: picked, revenueMin: lo, revenueMax: hi });
  }
  function applyGeographies(picked: string[]) {
    onPatch({
      geographies: picked,
      // Keep legacy single-string column populated (comma-joined) so any
      // older code paths that still read brief.geography stay readable.
      geography: picked.length > 0 ? picked.join(', ') : null,
    });
  }

  const valueProp = brief.objective?.trim() ?? 'Add an objective on the Brief editor.';
  const oneLiner = valueProp.split(/[.!?]/)[0].trim() + '.';

  return (
    <div className="space-y-panel">
      <header className="flex items-start gap-2">
        <div className="flex-1">
          <StepTitle substep="Market analysis" />
          <p className="text-[12px] text-evari-dim mt-0.5">{brief.locked ? 'Locked. Click Unlock to refine; the AI will not redraft until you do.' : 'Define who we are hunting and how we will reach them. The pitch sits at the top, the chips on the left, and Claude on the right is here to think with you.'}</p>
        </div>
        <button
          type="button"
          onClick={() => onPatch({ locked: !brief.locked })}
          className={brief.locked
            ? 'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold/15 text-evari-gold border border-evari-gold/40 hover:bg-evari-gold/25 transition'
            : 'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-surface text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 transition'}
          title={brief.locked ? 'Unlock to allow AI to refine again' : 'Lock the brief so the AI will not redraft on revisit'}
        >
          {brief.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {brief.locked ? 'Unlock' : 'Lock'}
        </button>
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-text text-evari-ink hover:brightness-110 transition">
          <Pencil className="h-3.5 w-3.5" /> Edit brief
        </button>
      </header>

      {/* Two-column row: structured brief on the left, Spitball with
          Claude on the right. Right column takes full row height so
          the chat fills the depth. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-panel">
        {/* LEFT: chip-pick questions. Each ChipPicker is one stage
            question: pick options to lock in your market. Custom
            options can be added inline. The brief patches back to
            Supabase via the parent's onPatch callback. When the brief
            is locked, the whole column is wrapped in a disabled
            fieldset so chip picks do not fire onPatch. */}
        <fieldset disabled={brief.locked} className={brief.locked ? 'flex flex-col gap-panel opacity-70 pointer-events-none' : 'flex flex-col gap-panel'}>
          <ChipPicker
            title="Sector"
            hint="Which industries are we targeting?"
            options={chips?.industries ?? []}
            selected={brief.industries}
            onChange={(next) => onPatch({ industries: next })}
            loading={chipsLoading}
          />

          <ChipPicker
            title="Geography"
            hint="Where are these companies based? Pick as many as you like."
            options={chips?.geographies ?? []}
            selected={brief.geographies.length > 0 ? brief.geographies : (brief.geography ? brief.geography.split(/,\s*/).filter(Boolean) : [])}
            onChange={applyGeographies}
            loading={chipsLoading}
          />

          <ChipPicker
            title="Company size"
            hint="Headcount band(s) of the businesses we want to reach. Pick as many as fit."
            options={chips?.companySizes ?? []}
            selected={brief.companySizes}
            onChange={applySizeBand}
            loading={chipsLoading}
          />

          <ChipPicker
            title="Revenue"
            hint="Annual revenue band(s). Pick as many as fit."
            options={chips?.revenues ?? []}
            selected={brief.revenues}
            onChange={applyRevenueBand}
            loading={chipsLoading}
          />

          <ChipPicker
            title="Channels"
            hint="How we reach this audience."
            options={chips?.channels ?? []}
            selected={brief.channels}
            onChange={(next) => onPatch({ channels: next })}
            loading={chipsLoading}
          />

          <ChipPicker
            title="Target audience"
            hint="The roles we email."
            options={chips?.audience ?? []}
            selected={brief.targetAudience}
            onChange={(next) => onPatch({ targetAudience: next })}
            loading={chipsLoading}
          />

          {/* Snapshot card. Only render the analytics row once Discovery
              has actually run and shortlisted companies, so we never
              show fake placeholder numbers (ICP 50 / market 0 / revenue
              dash) on a fresh brief. */}
          {a === null ? null :
            a.addressableMarket > 0 ? (
              <Card icon={<Users className="h-4 w-4" />} title="Snapshot">
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="ICP fit score" value={String(a.icpScore)} sub={a.icpBand.replace('_', ' ')} accent />
                  <Stat label="Market size" value={a.addressableMarket.toLocaleString()} sub="Addressable companies" />
                  <Stat label="Revenue potential" value={a.revenuePotentialLabel} sub="Annual" />
                </div>
                {brief.idealCustomer && brief.idealCustomer.trim().length > 0 ? (
                  <p className="mt-3 pt-3 border-t border-evari-edge/20 text-[12px] text-evari-text leading-relaxed">{brief.idealCustomer}</p>
                ) : null}
              </Card>
            ) : brief.idealCustomer && brief.idealCustomer.trim().length > 0 ? (
              <Card icon={<Users className="h-4 w-4" />} title="Ideal customer">
                <p className="text-[12px] text-evari-text leading-relaxed">{brief.idealCustomer}</p>
              </Card>
            ) : null
          }
        </fieldset>

        {/* RIGHT: Spitball with Claude, full column depth. Compact mode
            so it doesn't compete with the seven-step Next button. */}
        <div className="rounded-panel overflow-hidden border border-evari-edge/30 bg-evari-ink min-h-[600px] flex">
          <SpitballPanel
            playId={playId}
            playTitle={playTitle}
            pitch={pitch}
            open={true}
            kickoff={false}
            compact
            locked={brief.locked}
            onClose={() => {}}
          />
        </div>
      </div>

      {(brief.successMetrics ?? []).length > 0 ? (
        <Card icon={<TrendingUp className="h-4 w-4" />} title="Success metrics">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-panel">
            {(brief.successMetrics ?? []).slice(0, 6).map((m, i) => (
              <Stat key={i} label={m.name || `Metric ${i + 1}`} value={m.target ?? '—'} sub="Target" accent />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
      <h3 className="text-[13px] font-semibold text-evari-text mb-3 flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-evari-gold/15 text-evari-gold">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</div>
      <div className={cn('text-[20px] font-bold tabular-nums mt-0.5', accent ? 'text-evari-gold' : 'text-evari-text')}>{value}</div>
      {sub ? <div className="text-[10px] text-evari-dim">{sub}</div> : null}
    </div>
  );
}

function KV({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3 py-1.5 border-t first:border-t-0 border-evari-edge/20 text-[12px] items-baseline">
      <span className="text-evari-dim">{label}</span>
      <span className={cn('text-evari-text', multiline ? '' : 'truncate')}>{value}</span>
    </div>
  );
}

function PriorityPill({ p }: { p: 'High' | 'Medium' | 'Low' }) {
  const cls = p === 'High' ? 'bg-evari-gold/15 text-evari-gold' : p === 'Medium' ? 'bg-evari-warn/15 text-evari-warn' : 'bg-evari-ink/40 text-evari-dim';
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold', cls)}>{p} priority</span>;
}

function Loading() {
  return <div className="text-[11px] text-evari-dim flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...</div>;
}
