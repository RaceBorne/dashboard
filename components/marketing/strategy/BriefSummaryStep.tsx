'use client';

/**
 * Brief summary dashboard. Shows everything captured across the
 * other steps in one read-only view. Top-right Edit brief opens the
 * unified BriefEditorDrawer scoped to Overview by default.
 */

import { useEffect, useState } from 'react';
import { Loader2, Mail, MessageSquare, Pencil, Send, Target, TrendingUp, Users } from 'lucide-react';
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
  industries: string[];
  companySizeMin: number | null;
  companySizeMax: number | null;
  revenueMin: string | null;
  revenueMax: string | null;
  channels: string[];
  messaging: { angle: string; line?: string }[] | null;
  successMetrics: { name: string; target?: string }[] | null;
  idealCustomer: string | null;
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
  }, [playId, playTitle, pitch]);

  // Helpers for chip-picked sizing/revenue, which live as min/max
  // numeric fields on the brief but as discrete bands in the chips UI.
  const sizeBand =
    brief.companySizeMin && brief.companySizeMax
      ? `${brief.companySizeMin}-${brief.companySizeMax} employees`
      : null;
  const revenueBand =
    brief.revenueMin && brief.revenueMax ? `${brief.revenueMin}-${brief.revenueMax}` : null;
  function applySizeBand(picked: string[]) {
    const last = picked[picked.length - 1];
    if (!last) {
      onPatch({ companySizeMin: null, companySizeMax: null });
      return;
    }
    const m = last.match(/(\d+)\s*-\s*(\d+)/);
    if (m) onPatch({ companySizeMin: Number(m[1]), companySizeMax: Number(m[2]) });
    else if (/(\d+)\+/.test(last)) {
      const n = Number(last.match(/(\d+)\+/)![1]);
      onPatch({ companySizeMin: n, companySizeMax: 9999 });
    }
  }
  function applyRevenueBand(picked: string[]) {
    const last = picked[picked.length - 1];
    if (!last) {
      onPatch({ revenueMin: null, revenueMax: null });
      return;
    }
    const m = last.match(/(£[^-\s]+)\s*-\s*(£[^\s]+)/);
    if (m) onPatch({ revenueMin: m[1], revenueMax: m[2] });
    else onPatch({ revenueMin: last, revenueMax: last });
  }

  const valueProp = brief.objective?.trim() ?? 'Add an objective on the Brief editor.';
  const oneLiner = valueProp.split(/[.!?]/)[0].trim() + '.';

  return (
    <div className="space-y-panel">
      <header className="flex items-start gap-2">
        <div className="flex-1">
          <StepTitle substep="Brief" />
          <p className="text-[12px] text-evari-dim mt-0.5">A summary of your go-to-market strategy. Review and share with your team.</p>
        </div>
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
            Supabase via the parent's onPatch callback. */}
        <div className="flex flex-col gap-panel">
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
            hint="Where are these companies based?"
            options={chips?.geographies ?? []}
            selected={brief.geography ? [brief.geography] : []}
            onChange={(next) => onPatch({ geography: next[next.length - 1] ?? null })}
            max={1}
            loading={chipsLoading}
          />

          <ChipPicker
            title="Company size"
            hint="Headcount band of the businesses we want to reach."
            options={chips?.companySizes ?? []}
            selected={sizeBand ? [sizeBand] : []}
            onChange={applySizeBand}
            max={1}
            loading={chipsLoading}
          />

          <ChipPicker
            title="Revenue"
            hint="Annual revenue band."
            options={chips?.revenues ?? []}
            selected={revenueBand ? [revenueBand] : []}
            onChange={applyRevenueBand}
            max={1}
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

          {/* Snapshot of analytics derived from picks above, plus
              ideal customer prose if Claude has filled it in. */}
          <Card icon={<Users className="h-4 w-4" />} title="Snapshot">
            {a === null ? <Loading /> : (
              <div className="grid grid-cols-3 gap-3">
                <Stat label="ICP fit score" value={String(a.icpScore)} sub={a.icpBand.replace('_', ' ')} accent />
                <Stat label="Market size" value={a.addressableMarket.toLocaleString()} sub="Addressable companies" />
                <Stat label="Revenue potential" value={a.revenuePotentialLabel} sub="Annual" />
              </div>
            )}
            {brief.idealCustomer && brief.idealCustomer.trim().length > 0 ? (
              <p className="mt-3 pt-3 border-t border-evari-edge/20 text-[12px] text-evari-text leading-relaxed">{brief.idealCustomer}</p>
            ) : null}
          </Card>
        </div>

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
            onClose={() => {}}
          />
        </div>
      </div>

      <Card icon={<TrendingUp className="h-4 w-4" />} title="Success metrics">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-panel">
          {(brief.successMetrics ?? []).slice(0, 6).map((m, i) => (
            <Stat key={i} label={m.name || `Metric ${i + 1}`} value={m.target ?? '—'} sub="Target" accent />
          ))}
          {(brief.successMetrics ?? []).length === 0 ? (
            <div className="col-span-full text-[11px] text-evari-dim">No metrics defined yet. Open Success metrics to set them.</div>
          ) : null}
        </div>
      </Card>
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
