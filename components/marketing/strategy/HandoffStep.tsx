'use client';

/**
 * Handoff: the committed strategy document.
 *
 * Two-column dense layout so the entire strategy fits in one viewport
 * without scrolling on a typical 14" laptop. Readiness banner sits at
 * the top with TWO active actions: "Fix issues" (calls auto-fill to
 * have Claude populate any blank fields) and "Proceed to Discovery"
 * (commits the strategy and runs the auto-scan).
 */

import { useEffect, useRef, useState } from 'react';
import {
  Briefcase, CheckCircle2, Loader2, MapPin, MessageSquare,
  Pencil, Printer, Send, Sparkles, Target, Users, Wand2,
} from 'lucide-react';
import { StepTitle } from './StepTitle';
import { humaniseChannel } from './BriefEditorDrawer';
import { cn } from '@/lib/utils';

interface Brief {
  campaignName: string | null;
  objective: string | null;
  targetAudience: string[];
  geography: string | null;
  geographies?: string[];
  industries: string[];
  companySizeMin: number | null;
  companySizeMax: number | null;
  companySizes?: string[];
  revenueMin: string | null;
  revenueMax: string | null;
  revenues?: string[];
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

interface Props {
  playId: string;
  brief: Brief;
  onEdit: () => void;
  onProceed: () => void;
  stage?: HandoffStage;
  playTitle?: string;
  pitch?: string;
  onPatch?: (patch: Partial<Brief>) => void;
}

export function HandoffStep({ playId, brief, onEdit, onProceed, stage = 'idle', playTitle, pitch, onPatch }: Props) {
  const proceedLabel =
    stage === 'persisting' ? 'Saving brief…' :
    stage === 'committing' ? 'Locking strategy…' :
    stage === 'scanning'   ? 'Finding companies…' :
                             'Proceed to Discovery';
  const inFlight = stage !== 'idle';
  const [a, setA] = useState<Analytics | null>(null);
  const [fixing, setFixing] = useState(false);
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
  const incomplete = ready < 90;

  function printDocument() {
    if (typeof window === 'undefined') return;
    window.print();
  }

  async function fixIssues() {
    if (!onPatch) return;
    setFixing(true);
    try {
      const res = await fetch(`/api/strategy/${playId}/auto-fill`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playTitle, pitch, brief }),
      });
      const d = await res.json();
      if (d?.ok && d.patch && typeof d.patch === 'object') {
        onPatch(d.patch as Partial<Brief>);
      }
    } catch {
      // Silent fail — the readiness banner will still show "Needs
      // work" and the user can retry or edit manually.
    } finally {
      setFixing(false);
    }
  }

  const sizing = formatSizing(brief);
  const revenue = formatRevenue(brief);
  const generatedAt = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const locationsPretty = brief.geographies && brief.geographies.length > 0 ? brief.geographies.join(', ') : (brief.geography ?? null);

  return (
    <div className="space-y-3">
      {/* Action bar — title + Edit + Print. Compact. */}
      <header className="flex items-start gap-2 print:hidden">
        <div className="flex-1">
          <StepTitle substep="Handoff" />
          <p className="text-[12px] text-evari-dim mt-0.5">The committed strategy at a glance. Fix any gaps, then hand off to Discovery.</p>
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

      {/* Readiness strip — top of page, always visible. The Fix issues
          button calls auto-fill so Claude populates blank fields. */}
      <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className={cn(
            'inline-flex items-center justify-center h-9 w-9 rounded-md shrink-0',
            lab.tone === 'success' ? 'bg-evari-success/15 text-evari-success' :
            lab.tone === 'gold'    ? 'bg-evari-gold/15 text-evari-gold' :
                                     'bg-evari-warn/15 text-evari-warn',
          )}>
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[14px] font-semibold text-evari-text">
                {lab.tone === 'warn' ? 'Brief incomplete' : 'Strategy ready for execution'}
              </span>
              <span className={cn('text-[11px] font-semibold',
                lab.tone === 'success' ? 'text-evari-success' :
                lab.tone === 'gold'    ? 'text-evari-gold' :
                                         'text-evari-warn')}>{ready}% · {lab.label}</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-evari-edge/30 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all',
                  lab.tone === 'success' ? 'bg-evari-success' :
                  lab.tone === 'gold'    ? 'bg-evari-gold' :
                                           'bg-evari-warn')}
                style={{ width: `${ready}%` }}
              />
            </div>
          </div>
          {incomplete && onPatch ? (
            <button
              type="button"
              onClick={() => void fixIssues()}
              disabled={fixing || inFlight}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-semibold bg-evari-gold/15 text-evari-gold border border-evari-gold/40 hover:bg-evari-gold/25 disabled:opacity-60 disabled:cursor-wait transition shrink-0"
              title="Let Claude fill the empty sections from the picks you already made"
            >
              {fixing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {fixing ? 'Fixing…' : 'Fix issues'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onProceed}
            disabled={inFlight || fixing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-60 disabled:cursor-wait transition shrink-0"
          >
            {inFlight ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {proceedLabel}
          </button>
        </div>
      </section>

      {/* The dense document. Two columns on desktop so most of the
          content fits in one viewport. */}
      <div ref={docRef} className="strategy-doc rounded-panel bg-evari-surface border border-evari-edge/30 p-4 print:bg-white print:border-0 print:p-0">
        <DocHeader title={brief.campaignName ?? 'Untitled strategy'} generatedAt={generatedAt} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3">
          <CompactSection icon={<Briefcase className="h-3.5 w-3.5" />} heading="Executive summary">
            <Field label="Campaign" value={brief.campaignName} />
            <Field label="Objective" value={brief.objective} multiline />
            <Field label="Audience" value={brief.targetAudience.length > 0 ? brief.targetAudience.join(', ') : null} />
            <Field label="Geography" value={locationsPretty} />
          </CompactSection>

          <CompactSection icon={<Target className="h-3.5 w-3.5" />} heading="Target market">
            <Field label="Industries" value={brief.industries.length > 0 ? brief.industries.join(', ') : null} />
            <Field label="Company size" value={sizing} />
            <Field label="Revenue band" value={revenue} />
            {a && a.addressableMarket > 0 ? (
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
                <Stat label="Addressable" value={a.addressableMarket.toLocaleString()} />
                <Stat label="Decision makers" value={a.decisionMakerCount.toLocaleString()} />
                <Stat label="High fit" value={a.highFitCount.toLocaleString()} />
              </div>
            ) : null}
          </CompactSection>

          <CompactSection icon={<Users className="h-3.5 w-3.5" />} heading="Ideal customer">
            {brief.idealCustomer && brief.idealCustomer.trim().length > 0 ? (
              <p className="text-[12px] text-evari-text leading-snug line-clamp-5">{brief.idealCustomer}</p>
            ) : (
              <Empty hint="Click Fix issues above and Claude will write this." />
            )}
          </CompactSection>

          <CompactSection icon={<Send className="h-3.5 w-3.5" />} heading="Channels">
            {brief.channels.length === 0 ? (
              <Empty hint="Pick channels on Target profile." />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {brief.channels.map((c) => (
                  <span key={c} className="inline-flex items-center px-2 py-0.5 rounded-md border border-evari-edge/30 bg-evari-ink/30 text-[11px] text-evari-text">
                    {humaniseChannel(c)}
                  </span>
                ))}
              </div>
            )}
          </CompactSection>

          <CompactSection icon={<MessageSquare className="h-3.5 w-3.5" />} heading="Messaging angles">
            {!brief.messaging || brief.messaging.length === 0 ? (
              <Empty hint="Click Fix issues to draft three angles." />
            ) : (
              <ol className="space-y-1 list-decimal list-inside marker:text-evari-dim">
                {brief.messaging.slice(0, 3).map((m, i) => (
                  <li key={i} className="text-[11px] text-evari-text leading-snug">
                    <span className="font-semibold">{m.angle}</span>
                    {m.line ? <span className="text-evari-dim">, {m.line}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </CompactSection>

          <CompactSection icon={<CheckCircle2 className="h-3.5 w-3.5" />} heading="Success metrics">
            {!brief.successMetrics || brief.successMetrics.length === 0 ? (
              <Empty hint="Click Fix issues to set three metrics." />
            ) : (
              <ul className="space-y-0.5">
                {brief.successMetrics.slice(0, 3).map((m, i) => (
                  <li key={i} className="flex items-baseline justify-between text-[11px] gap-2">
                    <span className="text-evari-text font-medium truncate">{m.name}</span>
                    <span className="text-evari-dim shrink-0">{m.target ?? '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </CompactSection>

          {/* Sequence spans both columns at the bottom. */}
          <div className="lg:col-span-2">
            <CompactSection icon={<MapPin className="h-3.5 w-3.5" />} heading="Outreach sequence">
              {seq.length === 0 ? (
                <Empty hint="Pick channels to generate a sequence." />
              ) : (
                <table className="w-full text-[11px]">
                  <thead className="text-[9px] uppercase tracking-[0.12em] text-evari-dimmer">
                    <tr>
                      <th className="text-left py-1 w-8">#</th>
                      <th className="text-left py-1">Channel</th>
                      <th className="text-left py-1 w-24">When</th>
                      <th className="text-left py-1">Objective</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seq.map((s, i) => (
                      <tr key={i} className="border-t border-evari-edge/20">
                        <td className="py-1 font-mono tabular-nums text-evari-dim">{i + 1}</td>
                        <td className="py-1 text-evari-text font-medium">{humaniseChannel(s.channel)}</td>
                        <td className="py-1 text-evari-dim">{s.day}</td>
                        <td className="py-1 text-evari-dim">{s.objective}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CompactSection>
          </div>
        </div>

        <DocFooter />
      </div>
    </div>
  );
}

// ─── document chrome ─────────────────────────────────────────────────

function DocHeader({ title, generatedAt }: { title: string; generatedAt: string }) {
  return (
    <header className="border-b border-evari-edge/30 pb-2 mb-3 print:border-black">
      <div className="text-[9px] uppercase tracking-[0.16em] text-evari-dimmer">Strategy document</div>
      <h1 className="text-[16px] font-bold text-evari-text leading-tight">{title}</h1>
      <div className="text-[10px] text-evari-dim mt-0.5">Generated {generatedAt}, Evari Speed Bikes</div>
    </header>
  );
}

function DocFooter() {
  return (
    <footer className="mt-3 pt-2 border-t border-evari-edge/30 text-[9px] text-evari-dimmer print:border-black">
      Confidential. Internal Evari Speed Bikes strategy document.
    </footer>
  );
}

function CompactSection({ icon, heading, children }: { icon: React.ReactNode; heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold text-evari-text mb-1.5 flex items-center gap-1.5">
        <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-evari-gold/15 text-evari-gold print:bg-transparent print:text-black">
          {icon}
        </span>
        {heading}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value, multiline }: { label: string; value: string | null | undefined; multiline?: boolean }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2 py-0.5 text-[11px] items-baseline">
      <span className="text-evari-dim text-[10px] uppercase tracking-[0.08em]">{label}</span>
      <span className={cn('text-evari-text', multiline ? 'leading-snug' : 'truncate')}>
        {value && value.trim().length > 0 ? value : <span className="text-evari-dimmer italic">not set</span>}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-evari-edge/30 bg-evari-ink/30 px-2 py-1">
      <div className="text-[8px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</div>
      <div className="text-[13px] font-bold text-evari-text tabular-nums">{value}</div>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return <div className="text-[10px] text-evari-dimmer italic">{hint}</div>;
}

function formatSizing(b: Brief): string | null {
  if (b.companySizes && b.companySizes.length > 0) return b.companySizes.join(', ');
  const lo = b.companySizeMin;
  const hi = b.companySizeMax;
  if (lo == null && hi == null) return null;
  if (lo != null && hi != null) return `${lo} to ${hi} employees`;
  if (lo != null) return `${lo}+ employees`;
  return `Up to ${hi} employees`;
}

function formatRevenue(b: Brief): string | null {
  if (b.revenues && b.revenues.length > 0) return b.revenues.join(', ');
  const lo = b.revenueMin?.trim();
  const hi = b.revenueMax?.trim();
  if (!lo && !hi) return null;
  if (lo && hi) return `${lo} to ${hi}`;
  return lo || hi || null;
}
