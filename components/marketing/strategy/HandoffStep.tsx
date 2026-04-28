'use client';

/**
 * Handoff dashboard. Synthesises everything else into an execution-
 * ready view: readiness score (% of brief fields complete), campaign
 * blueprint (derived from brief), target list (counts from analytics +
 * enrichment coverage), sequencing (computed from picked channels),
 * assets (linked to dashboard_mkt_templates).
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Pencil, Send, Users } from 'lucide-react';
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
  addressableMarket: number; reachableContacts: number;
  decisionMakerCount: number;
  highFitCount: number;
}

const FIELD_KEYS: (keyof Brief)[] = [
  'campaignName', 'objective', 'targetAudience', 'geography', 'industries',
  'companySizeMin', 'companySizeMax', 'revenueMin', 'revenueMax',
  'channels', 'messaging', 'successMetrics', 'idealCustomer',
];

function readiness(brief: Brief): number {
  let filled = 0;
  for (const k of FIELD_KEYS) {
    const v = brief[k];
    if (Array.isArray(v)) { if (v.length > 0) filled++; }
    else if (typeof v === 'number') { if (v !== null && !Number.isNaN(v)) filled++; }
    else if (typeof v === 'string') { if (v.trim().length > 0) filled++; }
    else if (v !== null && v !== undefined) filled++;
  }
  return Math.round((filled / FIELD_KEYS.length) * 100);
}

function readinessLabel(pct: number): { label: string; tone: 'success' | 'gold' | 'warn' } {
  if (pct >= 90) return { label: 'Excellent', tone: 'success' };
  if (pct >= 70) return { label: 'Strong', tone: 'gold' };
  return { label: 'Needs work', tone: 'warn' };
}

interface SequenceStep { day: string; channel: string; objective: string }

function sequenceFromBrief(brief: Brief): SequenceStep[] {
  const c = brief.channels;
  const has = (k: string) => c.includes(k);
  const out: SequenceStep[] = [];
  if (has('email')) out.push({ day: 'Day 1', channel: 'email', objective: 'Introduce and create relevance' });
  if (has('linkedin_organic')) out.push({ day: 'Day 2–3', channel: 'linkedin_organic', objective: 'Build connection and visibility' });
  if (has('email')) out.push({ day: 'Day 5', channel: 'email', objective: 'Share value and build interest' });
  if (has('linkedin_paid')) out.push({ day: 'Day 7–10', channel: 'linkedin_paid', objective: 'Stay top of mind and reinforce' });
  if (has('phone')) out.push({ day: 'Day 12–15', channel: 'phone', objective: 'Qualify and start conversation' });
  if (has('email')) out.push({ day: 'Day 18', channel: 'email', objective: 'Final follow-up and break-up' });
  return out;
}

export function HandoffStep({ playId, brief, onEdit, onProceed }: { playId: string; brief: Brief; onEdit: () => void; onProceed: () => void }) {
  const [a, setA] = useState<Analytics | null>(null);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch(`/api/strategy/${playId}/analytics`, { cache: 'no-store' })
      .then((r) => r.json()).then((d) => setA(d?.analytics ?? null)).catch(() => setA(null));
    fetch('/api/marketing/templates', { cache: 'no-store' })
      .then((r) => r.json()).then((d) => setTemplates(Array.isArray(d?.templates) ? d.templates.slice(0, 6) : [])).catch(() => setTemplates([]));
  }, [playId]);

  const ready = readiness(brief);
  const lab = readinessLabel(ready);
  const seq = sequenceFromBrief(brief);
  const dataCoverage = a && a.addressableMarket > 0 ? Math.min(100, Math.round((a.reachableContacts / Math.max(1, a.addressableMarket)) * 100)) : 0;

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-2">
        <div className="flex-1">
          <StepTitle substep="Handoff" />
          <p className="text-[12px] text-evari-dim mt-0.5">Your strategy is ready to execute. Review the plan, confirm, and move into execution.</p>
        </div>
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 hover:bg-evari-gold/5 transition">
          <Pencil className="h-3.5 w-3.5" /> Edit strategy
        </button>
      </header>

      {/* Readiness banner */}
      <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-evari-success/15 text-evari-success"><CheckCircle2 className="h-5 w-5" /></span>
            <div>
              <div className="text-[15px] font-semibold text-evari-text">Strategy ready for execution</div>
              <p className="text-[12px] text-evari-dim mt-0.5">All key elements are aligned. Build the target list and launch your first campaign.</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Readiness</div>
            <div className={cn('text-[26px] font-bold tabular-nums',
              lab.tone === 'success' ? 'text-evari-success' : lab.tone === 'gold' ? 'text-evari-gold' : 'text-evari-warn')}>{ready}%</div>
            <div className={cn('text-[11px] font-semibold',
              lab.tone === 'success' ? 'text-evari-success' : lab.tone === 'gold' ? 'text-evari-gold' : 'text-evari-warn')}>{lab.label}</div>
          </div>
          <button type="button" onClick={onProceed} className="inline-flex items-center gap-1 px-4 py-2.5 rounded-md text-[13px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition">
            Proceed to Discovery
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card icon={<Send className="h-4 w-4" />} title="Campaign blueprint">
          <KV label="Primary objective" value={brief.objective ? brief.objective.split(/[.!?]/)[0] : '—'} />
          <KV label="Target accounts"   value={a ? `${a.addressableMarket.toLocaleString()} companies` : '—'} />
          <KV label="Target contacts"   value={a ? `${a.decisionMakerCount.toLocaleString()} decision makers` : '—'} />
          <KV label="Channels"          value={brief.channels.length > 0 ? brief.channels.map(humaniseChannel).join(', ') : '—'} />
          <KV label="Campaign type"     value={brief.channels.length > 1 ? 'Multi-touch outbound' : 'Single channel'} />
        </Card>

        <Card icon={<Users className="h-4 w-4" />} title="Target list">
          {a === null ? <Loading /> : (
            <>
              <KV label="Companies"      value={a.addressableMarket.toLocaleString()} />
              <KV label="Decision makers" value={a.decisionMakerCount.toLocaleString()} />
              <KV label="Data coverage"  value={`${dataCoverage}%`} />
              <KV label="High-fit count" value={`${a.highFitCount.toLocaleString()} (≥80 score)`} />
            </>
          )}
        </Card>

        <Card icon={<Send className="h-4 w-4" />} title="Sequencing overview">
          {seq.length === 0 ? (
            <div className="text-[11px] text-evari-dim">Pick channels on the Channels step to generate a sequence.</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">
                <tr>
                  <th className="text-left py-2 w-8">Step</th>
                  <th className="text-left py-2">Channel</th>
                  <th className="text-left py-2">Timing</th>
                  <th className="text-left py-2">Objective</th>
                </tr>
              </thead>
              <tbody>
                {seq.map((s, i) => (
                  <tr key={i} className="border-t border-evari-edge/20">
                    <td className="py-2 font-mono tabular-nums text-evari-dim">{i + 1}</td>
                    <td className="py-2 text-evari-text font-medium">{humaniseChannel(s.channel)}</td>
                    <td className="py-2 text-evari-dim">{s.day}</td>
                    <td className="py-2 text-evari-dim">{s.objective}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card icon={<FileText className="h-4 w-4" />} title="Assets ready">
          {templates.length === 0 ? (
            <div className="text-[11px] text-evari-dim">No saved templates yet. Build some on /email/templates.</div>
          ) : (
            <ul className="divide-y divide-evari-edge/20">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-2 text-[12px]">
                  <FileText className="h-3.5 w-3.5 text-evari-dim" />
                  <a href={`/email/templates/${t.id}`} className="text-evari-text hover:text-evari-gold transition flex-1 truncate">{t.name}</a>
                  <span className="text-[10px] text-evari-dimmer uppercase tracking-wider">Template</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4">
      <h3 className="text-[13px] font-semibold text-evari-text mb-3 flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-evari-gold/15 text-evari-gold">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1.5 border-t first:border-t-0 border-evari-edge/20 text-[12px] items-baseline">
      <span className="text-evari-dim">{label}</span>
      <span className="text-evari-text">{value}</span>
    </div>
  );
}

function Loading() {
  return <div className="text-[11px] text-evari-dim flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...</div>;
}
