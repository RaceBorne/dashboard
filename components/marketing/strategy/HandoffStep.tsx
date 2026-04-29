'use client';

/**
 * Handoff: the committed strategy document.
 *
 * Synthesises every brief field into a single readable page that a
 * human can print to PDF and walk into a meeting with. Below the
 * document the operator gets a readiness summary and the Proceed to
 * Discovery action.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Briefcase, CheckCircle2, FileText, Loader2, MapPin, MessageSquare,
  Pencil, Printer, Send, Target, Users,
} from 'lucide-react';
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
  addressableMarket: number;
  reachableContacts: number;
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
  if (has('email'))            out.push({ day: 'Day 1',     channel: 'email',            objective: 'Introduce and create relevance' });
  if (has('linkedin_organic')) out.push({ day: 'Day 2-3',   channel: 'linkedin_organic', objective: 'Build connection and visibility' });
  if (has('email'))            out.push({ day: 'Day 5',     channel: 'email',            objective: 'Share value and build interest' });
  if (has('linkedin_paid'))    out.push({ day: 'Day 7-10',  channel: 'linkedin_paid',    objective: 'Stay top of mind and reinforce' });
  if (has('phone'))            out.push({ day: 'Day 12-15', channel: 'phone',            objective: 'Qualify and start conversation' });
  if (has('event'))            out.push({ day: 'Day 14',    channel: 'event',            objective: 'In-person introduction' });
  if (has('email'))            out.push({ day: 'Day 18',    channel: 'email',            objective: 'Final follow-up and break-up' });
  return out;
}

type HandoffStage = 'idle' | 'persisting' | 'committing' | 'scanning';

export function HandoffStep({ playId, brief, onEdit, onProceed, stage = 'idle' }: { playId: string; brief: Brief; onEdit: () => void; onProceed: () => void; stage?: HandoffStage }) {
  const proceedLabel =
    stage === 'persisting' ? 'Saving brief…' :
    stage === 'committing' ? 'Locking strategy…' :
    stage === 'scanning'   ? 'Finding companies…' :
                             'Proceed to Discovery';
  const inFlight = stage !== 'idle';
  const [a, setA] = useState<Analytics | null>(null);
  const docRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch(`/api/strategy/${playId}/analytics`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setA(d?.analytics ?? null))
      .catch(() => setA(null));
  }, [playId]);

  const ready = readiness(brief);
  const lab = readinessLabel(ready);
  const seq = sequenceFromBrief(brief);

  function printDocument() {
    if (typeof window === 'undefined') return;
    window.print();
  }

  const sizing = formatSizing(brief);
  const revenue = formatRevenue(brief);
  const generatedAt = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-panel">
      {/* Top action bar — hidden in print */}
      <header className="flex items-start gap-2 print:hidden">
        <div className="flex-1">
          <StepTitle substep="Handoff" />
          <p className="text-[12px] text-evari-dim mt-0.5">A printable strategy document. Review, refine, then hand off to Discovery.</p>
        </div>
        <button
          type="button"
          onClick={printDocument}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 hover:bg-evari-gold/5 transition"
          title="Open the browser print dialog. Save as PDF to keep a copy."
        >
          <Printer className="h-3.5 w-3.5" /> Print / Save PDF
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 hover:bg-evari-gold/5 transition"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit strategy
        </button>
      </header>

      {/* The document itself. Has a special print stylesheet so it
          renders cleanly when the user hits Print. */}
      <div ref={docRef} className="strategy-doc rounded-panel bg-evari-surface border border-evari-edge/30 p-6 print:bg-white print:border-0 print:p-0">
        <DocHeader title={brief.campaignName ?? 'Untitled strategy'} generatedAt={generatedAt} />

        {/* Executive summary block */}
        <Section icon={<Briefcase className="h-4 w-4" />} heading="Executive summary">
          <Field label="Campaign" value={brief.campaignName} />
          <Field label="Objective" value={brief.objective} />
          <Field label="Target audience" value={brief.targetAudience.length > 0 ? brief.targetAudience.join(' · ') : null} />
          <Field label="Geography" value={brief.geography} />
        </Section>

        {/* Target market */}
        <Section icon={<Target className="h-4 w-4" />} heading="Target market">
          <Field label="Industries" value={brief.industries.length > 0 ? brief.industries.join(' · ') : null} />
          <Field label="Company size" value={sizing} />
          <Field label="Revenue band" value={revenue} />
          {a && a.addressableMarket > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <Stat label="Addressable" value={a.addressableMarket.toLocaleString()} />
              <Stat label="Decision makers" value={a.decisionMakerCount.toLocaleString()} />
              <Stat label="High fit (≥80)" value={a.highFitCount.toLocaleString()} />
            </div>
          ) : null}
        </Section>

        {/* Ideal customer prose */}
        <Section icon={<Users className="h-4 w-4" />} heading="Ideal customer">
          {brief.idealCustomer && brief.idealCustomer.trim().length > 0 ? (
            <p className="text-[13px] text-evari-text leading-relaxed">{brief.idealCustomer}</p>
          ) : (
            <Empty hint="Edit strategy → Ideal customer to fill this in." />
          )}
        </Section>

        {/* Channels */}
        <Section icon={<Send className="h-4 w-4" />} heading="Channels">
          {brief.channels.length === 0 ? (
            <Empty hint="Pick channels on the Channels step." />
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {brief.channels.map((c) => (
                <li key={c} className="rounded-md border border-evari-edge/30 bg-evari-ink/30 px-2.5 py-1.5 text-[12px] text-evari-text">
                  {humaniseChannel(c)}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Messaging angles */}
        <Section icon={<MessageSquare className="h-4 w-4" />} heading="Messaging angles">
          {!brief.messaging || brief.messaging.length === 0 ? (
            <Empty hint="Add messaging angles on the Messaging step." />
          ) : (
            <ol className="space-y-2 list-decimal list-inside marker:text-evari-dim">
              {brief.messaging.map((m, i) => (
                <li key={i} className="text-[12px] text-evari-text">
                  <span className="font-semibold">{m.angle}</span>
                  {m.line ? <span className="text-evari-dim"> — {m.line}</span> : null}
                </li>
              ))}
            </ol>
          )}
        </Section>

        {/* Success metrics */}
        <Section icon={<CheckCircle2 className="h-4 w-4" />} heading="Success metrics">
          {!brief.successMetrics || brief.successMetrics.length === 0 ? (
            <Empty hint="Set success metrics on the Metrics step." />
          ) : (
            <ul className="divide-y divide-evari-edge/20">
              {brief.successMetrics.map((m, i) => (
                <li key={i} className="flex items-baseline justify-between py-2 text-[12px]">
                  <span className="text-evari-text font-medium">{m.name}</span>
                  <span className="text-evari-dim">{m.target ?? '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Sequence */}
        <Section icon={<MapPin className="h-4 w-4" />} heading="Outreach sequence">
          {seq.length === 0 ? (
            <Empty hint="Pick channels to generate a sequence." />
          ) : (
            <table className="w-full text-[12px]">
              <thead className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">
                <tr>
                  <th className="text-left py-2 w-10">#</th>
                  <th className="text-left py-2">Channel</th>
                  <th className="text-left py-2">When</th>
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
        </Section>

        <DocFooter />
      </div>

      {/* Readiness banner + proceed action — hidden in print so the
          PDF copy ends with the document, not a UI button. */}
      <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] items-center gap-4">
          <div className="flex items-center gap-3">
            <span className={cn(
              'inline-flex items-center justify-center h-9 w-9 rounded-md',
              lab.tone === 'success' ? 'bg-evari-success/15 text-evari-success' :
              lab.tone === 'gold'    ? 'bg-evari-gold/15 text-evari-gold' :
                                       'bg-evari-warn/15 text-evari-warn',
            )}>
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[15px] font-semibold text-evari-text">
                {lab.tone === 'warn' ? 'Brief incomplete' : 'Strategy ready for execution'}
              </div>
              <p className="text-[12px] text-evari-dim mt-0.5">
                {lab.tone === 'warn'
                  ? 'Some sections are still empty. Click Edit strategy to fill them in.'
                  : 'All key elements are aligned. Hand off to Discovery to start finding companies.'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Readiness</div>
            <div className={cn('text-[26px] font-bold tabular-nums',
              lab.tone === 'success' ? 'text-evari-success' :
              lab.tone === 'gold'    ? 'text-evari-gold' :
                                       'text-evari-warn')}>{ready}%</div>
            <div className={cn('text-[11px] font-semibold',
              lab.tone === 'success' ? 'text-evari-success' :
              lab.tone === 'gold'    ? 'text-evari-gold' :
                                       'text-evari-warn')}>{lab.label}</div>
          </div>
          <button
            type="button"
            onClick={onProceed}
            disabled={inFlight}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-60 disabled:cursor-wait transition"
          >
            {inFlight ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {proceedLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

// ─── document chrome ─────────────────────────────────────────────────

function DocHeader({ title, generatedAt }: { title: string; generatedAt: string }) {
  return (
    <header className="border-b border-evari-edge/30 pb-4 mb-5 print:border-black">
      <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer mb-1">Strategy document</div>
      <h1 className="text-[22px] font-bold text-evari-text leading-tight">{title}</h1>
      <div className="text-[11px] text-evari-dim mt-1">Generated {generatedAt} · Evari Speed Bikes</div>
    </header>
  );
}

function DocFooter() {
  return (
    <footer className="mt-6 pt-4 border-t border-evari-edge/30 text-[10px] text-evari-dimmer print:border-black">
      Confidential. Internal Evari Speed Bikes strategy document. Do not share without permission.
    </footer>
  );
}

function Section({ icon, heading, children }: { icon: React.ReactNode; heading: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="text-[13px] font-semibold text-evari-text mb-2 flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-evari-gold/15 text-evari-gold print:bg-transparent print:text-black">
          {icon}
        </span>
        {heading}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1.5 border-t first:border-t-0 border-evari-edge/20 text-[12px] items-baseline">
      <span className="text-evari-dim">{label}</span>
      <span className="text-evari-text">{value && value.trim().length > 0 ? value : <span className="text-evari-dimmer italic">not set</span>}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-evari-edge/30 bg-evari-ink/30 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</div>
      <div className="text-[15px] font-bold text-evari-text tabular-nums">{value}</div>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return <div className="text-[11px] text-evari-dimmer italic">{hint}</div>;
}

function formatSizing(b: Brief): string | null {
  const lo = b.companySizeMin;
  const hi = b.companySizeMax;
  if (lo == null && hi == null) return null;
  if (lo != null && hi != null) return `${lo}-${hi} employees`;
  if (lo != null) return `${lo}+ employees`;
  return `Up to ${hi} employees`;
}

function formatRevenue(b: Brief): string | null {
  const lo = b.revenueMin?.trim();
  const hi = b.revenueMax?.trim();
  if (!lo && !hi) return null;
  if (lo && hi) return `${lo} - ${hi}`;
  return lo || hi || null;
}
