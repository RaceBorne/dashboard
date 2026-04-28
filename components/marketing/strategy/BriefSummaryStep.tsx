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

export function BriefSummaryStep({ playId, brief, onEdit }: { playId: string; brief: Brief; onEdit: () => void }) {
  const [a, setA] = useState<Analytics | null>(null);
  useEffect(() => {
    fetch(`/api/strategy/${playId}/analytics`, { cache: 'no-store' })
      .then((r) => r.json()).then((d) => setA(d?.analytics ?? null)).catch(() => setA(null));
  }, [playId]);

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-panel">
        <Card icon={<Users className="h-4 w-4" />} title="Target market">
          {a === null ? <Loading /> : (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="ICP fit score" value={String(a.icpScore)} sub={a.icpBand.replace('_', ' ')} accent />
              <Stat label="Market size" value={a.addressableMarket.toLocaleString()} sub="Addressable companies" />
              <Stat label="Revenue potential" value={a.revenuePotentialLabel} sub="Annual" />
            </div>
          )}
        </Card>

        <Card icon={<Target className="h-4 w-4" />} title="Ideal customer">
          <KV label="Industry"     value={brief.industries.length > 0 ? brief.industries.join(', ') : '—'} />
          <KV label="Company size" value={brief.companySizeMin && brief.companySizeMax ? `${brief.companySizeMin} – ${brief.companySizeMax} employees` : '—'} />
          <KV label="Revenue"      value={brief.revenueMin && brief.revenueMax ? `${brief.revenueMin} – ${brief.revenueMax}` : '—'} />
          <KV label="Location"     value={brief.geography || '—'} />
        </Card>

        <Card icon={<Send className="h-4 w-4" />} title="Channels">
          {brief.channels.length === 0 ? (
            <div className="text-[11px] text-evari-dim">No channels selected. Open Channels to set them.</div>
          ) : (
            <ul className="divide-y divide-evari-edge/20">
              {PRIORITY_ORDER.filter((c) => brief.channels.includes(c)).map((c) => (
                <li key={c} className="flex items-center justify-between py-2 text-[12px]">
                  <span className="text-evari-text">{humaniseChannel(c)}</span>
                  <PriorityPill p={priorityFor(c, brief.channels)} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card icon={<MessageSquare className="h-4 w-4" />} title="Messaging">
          <KV label="Value proposition" value={valueProp} multiline />
          <KV label="One-liner" value={oneLiner} multiline />
          <KV label="Tone of voice" value="Credible, human, relevant, concise, helpful" />
        </Card>
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
