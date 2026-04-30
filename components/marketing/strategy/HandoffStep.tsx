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

// Strategic picks the user makes on Market analysis + Target profile.
// These are the real decisions; the brief can't ship without them.
const PICK_FIELDS = ['industries', 'targetAudience', 'channels'] as const;

// AI-articulated prose. Optional from a strategy point of view; the
// auto-fill button on the readiness banner writes all of them in one
// pass from the picks above.
const PROSE_FIELDS = ['campaignName', 'objective', 'idealCustomer', 'messaging', 'successMetrics'] as const;

function isFieldFilled(brief: Brief, key: keyof Brief): boolean {
  const v = brief[key];
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return !Number.isNaN(v);
  return v !== null && v !== undefined;
}

interface Readiness {
  picksFilled: number;
  picksTotal: number;
  proseFilled: number;
  proseTotal: number;
  picksComplete: boolean;
  proseComplete: boolean;
  proseMissingLabels: string[];
  state: 'picks_missing' | 'prose_missing' | 'ready';
}

const PROSE_LABELS: Record<typeof PROSE_FIELDS[number], string> = {
  campaignName: 'Campaign name',
  objective: 'Objective',
  idealCustomer: 'Ideal customer',
  messaging: 'Messaging angles',
  successMetrics: 'Success metrics',
};

function computeReadiness(brief: Brief): Readiness {
  const picksFilled = PICK_FIELDS.filter((k) => isFieldFilled(brief, k as keyof Brief)).length;
  const proseFilled = PROSE_FIELDS.filter((k) => isFieldFilled(brief, k as keyof Brief)).length;
  const proseMissingLabels = PROSE_FIELDS
    .filter((k) => !isFieldFilled(brief, k as keyof Brief))
    .map((k) => PROSE_LABELS[k]);
  const picksComplete = picksFilled === PICK_FIELDS.length;
  const proseComplete = proseFilled === PROSE_FIELDS.length;
  const state = !picksComplete ? 'picks_missing' : proseComplete ? 'ready' : 'prose_missing';
  return {
    picksFilled, picksTotal: PICK_FIELDS.length,
    proseFilled, proseTotal: PROSE_FIELDS.length,
    picksComplete, proseComplete, proseMissingLabels, state,
  };
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

  const r = computeReadiness(brief);
  const seq = sequenceFromBrief(brief);
  const incomplete = r.state !== 'ready';

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

      {/* Readiness strip. Two honest checklist rows instead of a fake
          gauge: strategic picks (the real decisions) and prose
          articulations (auto-fillable). */}
      <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <ReadyRow
              done={isFieldFilled(brief, 'industries')}
              label="Sectors"
              detail={isFieldFilled(brief, 'industries')
                ? brief.industries.join(', ')
                : 'Pick on Market analysis (or Auto-fill will infer from your pitch).'}
            />
            <ReadyRow
              done={isFieldFilled(brief, 'targetAudience')}
              label="Audience"
              detail={isFieldFilled(brief, 'targetAudience')
                ? brief.targetAudience.join(', ')
                : 'Pick on Target profile.'}
            />
            <ReadyRow
              done={isFieldFilled(brief, 'channels')}
              label="Channels"
              detail={isFieldFilled(brief, 'channels')
                ? brief.channels.join(', ')
                : 'Pick on Target profile.'}
            />
            <ReadyRow
              done={r.proseComplete}
              label="Brief articulations"
              detail={r.proseComplete
                ? 'Campaign name, objective, persona, angles, metrics all written.'
                : r.proseMissingLabels.length === r.proseTotal
                  ? `${r.proseTotal} prose fields not written yet (${r.proseMissingLabels.join(', ')}). Click Auto-fill to write them from your picks.`
                  : `${r.proseMissingLabels.length} field${r.proseMissingLabels.length === 1 ? '' : 's'} missing: ${r.proseMissingLabels.join(', ')}`}
            />
          </div>
          {!r.proseComplete && onPatch ? (
            <button
              type="button"
              onClick={() => void fixIssues()}
              disabled={fixing || inFlight}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-semibold bg-evari-gold/15 text-evari-gold border border-evari-gold/40 hover:bg-evari-gold/25 disabled:opacity-60 disabled:cursor-not-allowed transition shrink-0"
              title="Have Claude write the missing prose from whatever's there: title, pitch, picks. Industries and geography will be inferred if blank."
            >
              {fixing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {fixing ? 'Auto-filling…' : 'Auto-fill blanks'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onProceed}
            disabled={inFlight || fixing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition shrink-0"
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

function ReadyRow({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className={cn(
        'inline-flex items-center justify-center h-4 w-4 rounded-full text-[9px] font-bold shrink-0',
        done ? 'bg-evari-success/20 text-evari-success' : 'bg-evari-edge/30 text-evari-dim',
      )}>
        {done ? <CheckCircle2 className="h-3 w-3" /> : <span>•</span>}
      </span>
      <span className="font-semibold text-evari-text shrink-0">{label}:</span>
      <span className={cn('truncate', done ? 'text-evari-dim' : 'text-evari-text')}>{detail}</span>
    </div>
  );
}

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
