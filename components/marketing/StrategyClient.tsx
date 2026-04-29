'use client';

/**
 * Strategy workspace.
 *
 * Layout:
 *   - Top scroll area = the active step's content
 *   - Fixed-bottom horizontal timeline = the seven-step rail
 *
 * Step transitions slide right-to-left over 1s with ease.
 *
 * Steps:
 *   Brief            (form editor)
 *   Target profile   (dashboard, reads /api/strategy/[playId]/analytics)
 *   Ideal customer   (dashboard, same source)
 *   Channels         (toggle chips)
 *   Messaging        (angle list)
 *   Success metrics  (metric list)
 *   Handoff          (summary + button to Discovery)
 *
 * All editable brief fields live on the Brief step. Target profile and
 * Ideal customer are read-only dashboards based on Supabase data.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronRight, Loader2, Plus, Sparkles, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAISurface } from '@/components/ai/AIAssistantPane';
import { AIDraftButton } from '@/components/ai/AIDraftButton';
import { TargetProfileStep } from './strategy/TargetProfileStep';
import { HandoffStep as HandoffStepDashboard } from './strategy/HandoffStep';
import { BriefSummaryStep } from './strategy/BriefSummaryStep';
import { SynopsisStep } from './strategy/SynopsisStep';
import { BriefEditorDrawer, type BriefSection } from './strategy/BriefEditorDrawer';
import { StrategyTimeline, STRATEGY_STEPS } from './strategy/StrategyTimeline';
import { SpitballPanel } from './strategy/SpitballPanel';
import { useSearchParams } from 'next/navigation';

interface Brief {
  id: string;
  playId: string;
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
  handoffStatus: 'draft' | 'ready' | 'handed_off';
}

const STEPS = [
  { key: 'market',   label: 'Market analysis' },
  { key: 'target',   label: 'Target' },
  { key: 'synopsis', label: 'Synopsis' },
  { key: 'handoff',  label: 'Handoff' },
] as const;

type StepKey = typeof STEPS[number]['key'];

// Map old query-param values onto the new four-stage flow so existing
// links and bookmarks land on the right stage.
const LEGACY_STEP_MAP: Record<string, StepKey> = {
  brief:     'market',
  market:    'market',
  target:    'target',
  ideal:     'target',
  channels:  'target',
  messaging: 'target',
  metrics:   'synopsis',
  synopsis:  'synopsis',
  handoff:   'handoff',
};

const CHANNEL_OPTIONS = ['email', 'linkedin', 'website', 'social', 'phone', 'event'];

interface Props {
  plays: { id: string; title: string }[];
  play: { id: string; title: string; brief: string };
  initialBrief: Brief | null;
}

export function StrategyClient({ plays, play, initialBrief }: Props) {
  const router = useRouter();
  const [brief, setBrief] = useState<Brief | null>(initialBrief);
  const searchParams = useSearchParams();
  const initialStep = (LEGACY_STEP_MAP[searchParams?.get('step') ?? 'market'] ?? 'market') as StepKey;
  const [step, setStep] = useState<StepKey>(STRATEGY_STEPS.find((s) => s.key === initialStep) ? initialStep : 'market');
  useEffect(() => {
    const q = searchParams?.get('step');
    if (!q) return;
    const mapped = LEGACY_STEP_MAP[q];
    if (mapped && mapped !== step) setStep(mapped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSection, setEditorSection] = useState<BriefSection>('overview');
  // Spitball panel: opens automatically when ?kickoff=1 is in the URL
  // (the path after creating a new idea), or manually via the Spitball
  // button in the header. `kickoff` flag drives the auto-opener.
  const kickoffFlag = searchParams?.get('kickoff') === '1';
  // The seven-step rail is the default surface. Spitball auto-opens
  // ONLY in kickoff mode (just-created idea). For existing ideas the
  // user clicks the Spitball button in the header to engage Claude.
  const [spitballOpen, setSpitballOpen] = useState<boolean>(kickoffFlag);
  const [kickoffOnOpen, setKickoffOnOpen] = useState<boolean>(kickoffFlag);
  // Strip kickoff=1 from the URL after first paint so a refresh doesn't
  // re-arm the opener. We keep the panel open via local state.
  useEffect(() => {
    if (!kickoffFlag) return;
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('kickoff');
    window.history.replaceState(null, '', url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [savingAt, setSavingAt] = useState<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  useAISurface({
    surface: 'strategy',
    scopeId: play.id,
    context: { playTitle: play.title, brief: play.brief },
    suggestions: [
      { title: 'Suggest ideal customer profile', subtitle: 'Refine your target customer', prompt: `Given the idea "${play.title}" and brief "${play.brief}", draft a tight ideal customer profile. Three sentences max.` },
      { title: 'Recommend channels', subtitle: 'Best performing channels for this audience', prompt: `For the idea "${play.title}", which channels (email, linkedin, website, social, phone, event) are likely to perform best, and why? Three lines max.` },
      { title: 'Improve messaging angles', subtitle: 'Tailored messaging suggestions', prompt: `For the idea "${play.title}", give me three distinct messaging angles. Format: Angle name then a one-liner.` },
    ],
  });

  // Debounced autosave on any brief mutation.
  useEffect(() => {
    if (!brief) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void persist(brief); }, 600);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief]);

  async function persist(b: Brief) {
    const res = await fetch(`/api/strategy/${b.playId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(b),
    });
    if (res.ok) setSavingAt(Date.now());
  }

  function set<K extends keyof Brief>(key: K, val: Brief[K]) {
    setBrief((cur) => cur ? { ...cur, [key]: val } : cur);
  }

  function openEditor(section: BriefSection) {
    setEditorSection(section);
    setEditorOpen(true);
  }
  function go(next: StepKey) {
    const curIdx = STEPS.findIndex((s) => s.key === step);
    const nextIdx = STEPS.findIndex((s) => s.key === next);
    setDirection(nextIdx >= curIdx ? 'forward' : 'backward');
    setStep(next);
  }
  // 'Next' button advances through the seven steps in order. On the
  // last step (Handoff) it routes to Discovery instead, since Discovery
  // is the natural next surface after the strategy is committed.
  function nextStep() {
    const curIdx = STEPS.findIndex((s) => s.key === step);
    if (curIdx < 0) return;
    if (curIdx >= STEPS.length - 1) {
      handoff();
      return;
    }
    go(STEPS[curIdx + 1].key);
  }
  const isLastStep = step === 'handoff';
  const currentStepIdx = STEPS.findIndex((s) => s.key === step);
  const nextLabel = isLastStep
    ? 'Hand off to Discovery'
    : 'Next: ' + (STEPS[currentStepIdx + 1]?.label ?? '');

  // Handoff is a multi-stage operation, not just navigation. We must
  // (1) persist the latest brief incl. handoffStatus, (2) lock the
  // structured strategy via commit-strategy, (3) populate Discover via
  // auto-scan, then (4) route to Discover. Each stage updates UI so
  // the user sees progress instead of a frozen button.
  type HandoffStage = 'idle' | 'persisting' | 'committing' | 'scanning';
  const [handoffStage, setHandoffStage] = useState<HandoffStage>('idle');
  async function handoff() {
    if (!brief) return;
    if (handoffStage !== 'idle') return;
    const next = { ...brief, handoffStatus: 'handed_off' as const };
    setBrief(next);
    setHandoffStage('persisting');
    try {
      // 1. Persist brief (including handoffStatus). Skip the debounce —
      // we want this to land before we proceed.
      await fetch(`/api/strategy/${next.playId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      }).catch(() => {});

      // 2. Lock the structured strategy.
      setHandoffStage('committing');
      await fetch(`/api/plays/${next.playId}/commit-strategy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {});

      // 3. Run the auto-scan synchronously so Discover populates.
      setHandoffStage('scanning');
      await fetch(`/api/plays/${next.playId}/auto-scan`, {
        method: 'POST',
      }).catch(() => {});

      // 4. Route to Discover with the autoScanned flag so the banner
      // shows.
      router.push(`/discover?playId=${next.playId}&autoScanned=1`);
    } catch {
      setHandoffStage('idle');
    }
  }
  // Open the Spitball manually. Re-arming kickoff=true means the user
  // gets the opener every time they re-open it, even after the initial
  // creation flow, which is what they want for refining an existing
  // idea.
  function openSpitball() {
    setKickoffOnOpen(true);
    setSpitballOpen(true);
  }

  if (!brief) return null;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-evari-ink relative">
      {/* Scaling viewport — caps width at xl breakpoints, scales slightly at 2xl. */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className={cn(
          spitballOpen ? 'shrink-0 px-gutter pt-5' : 'h-full px-gutter py-5 pb-28 overflow-y-auto',
        )}>
          {/* Header */}
          <div className="flex items-center gap-2 mb-4">
            <select
              value={brief.playId}
              onChange={(e) => router.push(`/strategy?playId=${e.target.value}`)}
              className="px-2 py-1.5 rounded-panel bg-evari-surface text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
            >
              {plays.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <div className="ml-auto inline-flex items-center gap-2">
              {savingAt && Date.now() - savingAt < 2000 ? (
                <span className="text-[10px] text-evari-success inline-flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>
              ) : null}
              <button
                type="button"
                onClick={() => spitballOpen ? setSpitballOpen(false) : openSpitball()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold/15 text-evari-gold hover:bg-evari-gold/25 border border-evari-gold/30 transition"
                title={spitballOpen ? 'Hide Spitball, show seven-step brief' : 'Spitball with Claude, then commit'}
              >
                <Sparkles className="h-3.5 w-3.5" /> {spitballOpen ? 'Show brief' : 'Spitball'}
              </button>
              {/* Big Next button — advances through the seven steps,
                  and on Handoff it commits and routes to Discovery. */}
              <button
                type="button"
                onClick={nextStep}
                disabled={spitballOpen}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-[13px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
                title={isLastStep ? 'Commit and start finding companies' : 'Move to the next step'}
              >
                {nextLabel} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Seven-step rail (only when Spitball is closed). */}
          {spitballOpen ? null : (
            <SlideContainer step={step} direction={direction}>
              {step === 'market'   ? <BriefSummaryStep playId={brief.playId} brief={brief} onEdit={() => openEditor('overview')} playTitle={play.title} pitch={play.brief} onPatch={(patch) => setBrief((cur) => cur ? { ...cur, ...patch } : cur)} /> : null}
              {step === 'target'   ? <TargetProfileStep playId={brief.playId} brief={brief} /> : null}
              {step === 'synopsis' ? <SynopsisStep playId={brief.playId} playTitle={play.title} pitch={play.brief} brief={brief} onEdit={() => openEditor('overview')} /> : null}
              {step === 'handoff'  ? <HandoffStepDashboard playId={brief.playId} brief={brief} onEdit={() => openEditor('overview')} onProceed={handoff} stage={handoffStage} /> : null}
            </SlideContainer>
          )}
        </div>

        {/* Spitball fills the remaining height when open. Sibling of
            the header so it occupies the entire viewable area between
            header and bottom timeline. */}
        {spitballOpen ? (
          <div className="flex-1 min-h-0">
            <SpitballPanel
              playId={brief.playId}
              playTitle={play.title}
              pitch={play.brief}
              open={spitballOpen}
              kickoff={kickoffOnOpen}
              onClose={() => { setSpitballOpen(false); setKickoffOnOpen(false); }}
            />
          </div>
        ) : null}
      </div>

      {/* Bottom timeline only when the structured brief is the
          surface. Hidden during Spitball so the chat owns the bottom. */}
      {spitballOpen ? null : (
        <StrategyTimeline mode="internal" step={step} onPick={go} playId={brief.playId} />
      )}

      <BriefEditorDrawer
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        initialSection={editorSection}
        brief={brief}
        set={set}
      />


    </div>
  );
}

// ─── Slide container ──────────────────────────────────────────

function SlideContainer({ step, direction, children }: { step: StepKey; direction: 'forward' | 'backward'; children: React.ReactNode }) {
  // Keying on step forces a remount so the entrance animation runs.
  const cls = direction === 'forward'
    ? 'translate-x-[8%] opacity-0 animate-strategy-in-forward'
    : 'translate-x-[-8%] opacity-0 animate-strategy-in-backward';
  return (
    <div key={step} className={cn('will-change-transform', cls)}>
      <style jsx>{`
        @keyframes strategyInForward { from { transform: translateX(8%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes strategyInBackward { from { transform: translateX(-8%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .animate-strategy-in-forward { animation: strategyInForward 1s cubic-bezier(0.22, 0.61, 0.36, 1) forwards; }
        .animate-strategy-in-backward { animation: strategyInBackward 1s cubic-bezier(0.22, 0.61, 0.36, 1) forwards; }
      `}</style>
      {children}
    </div>
  );
}

// ─── Step bodies (Brief + Channels + Messaging + Metrics + Handoff) ──

function BriefStep({ brief, set }: { brief: Brief; set: <K extends keyof Brief>(k: K, v: Brief[K]) => void }) {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-[20px] font-bold text-evari-text">Brief</h2>
        <p className="text-[12px] text-evari-dim mt-0.5">Define the strategy and target for this idea.</p>
      </header>

      <Card title="Goal">
        <div className="space-y-3">
          <Field label="Campaign name">
            <input value={brief.campaignName ?? ''} onChange={(e) => set('campaignName', e.target.value)} className={INPUT_CLS} placeholder="Superyacht Owners UK" />
          </Field>
          <Field
            label="Objective"
            action={<AIDraftButton field="free" value={brief.objective ?? ''} context={`Brief for: ${brief.campaignName ?? ''}.`} onApply={(v) => set('objective', v)} />}
          >
            <textarea value={brief.objective ?? ''} onChange={(e) => set('objective', e.target.value)} className={`${INPUT_CLS} min-h-[80px]`} placeholder="Connect with..." />
          </Field>
        </div>
      </Card>

      <Card title="Target profile">
        <div className="space-y-3">
          <ChipsField label="Target audience" values={brief.targetAudience} onChange={(xs) => set('targetAudience', xs)} placeholder="e.g. Superyacht Owners" />
          <Field label="Geography">
            <input value={brief.geography ?? ''} onChange={(e) => set('geography', e.target.value)} className={INPUT_CLS} placeholder="United Kingdom" />
          </Field>
          <ChipsField label="Industries" values={brief.industries} onChange={(xs) => set('industries', xs)} placeholder="e.g. Luxury Yachts" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company size — min">
              <input type="number" value={brief.companySizeMin ?? ''} onChange={(e) => set('companySizeMin', e.target.value ? parseInt(e.target.value, 10) : null)} className={INPUT_CLS} placeholder="10" />
            </Field>
            <Field label="Company size — max">
              <input type="number" value={brief.companySizeMax ?? ''} onChange={(e) => set('companySizeMax', e.target.value ? parseInt(e.target.value, 10) : null)} className={INPUT_CLS} placeholder="500" />
            </Field>
            <Field label="Revenue — min">
              <input value={brief.revenueMin ?? ''} onChange={(e) => set('revenueMin', e.target.value)} className={INPUT_CLS} placeholder="£5M" />
            </Field>
            <Field label="Revenue — max">
              <input value={brief.revenueMax ?? ''} onChange={(e) => set('revenueMax', e.target.value)} className={INPUT_CLS} placeholder="£250M" />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Ideal customer">
        <Field
          label="Ideal customer prose"
          action={<AIDraftButton field="free" value={brief.idealCustomer ?? ''} context={`Idea: ${brief.campaignName ?? ''}. Audience: ${brief.targetAudience.join(', ')}.`} onApply={(v) => set('idealCustomer', v)} />}
        >
          <textarea value={brief.idealCustomer ?? ''} onChange={(e) => set('idealCustomer', e.target.value)} className={`${INPUT_CLS} min-h-[120px]`} placeholder="The ideal customer is..." />
        </Field>
      </Card>
    </div>
  );
}

function ChannelsStep({ brief, set }: { brief: Brief; set: <K extends keyof Brief>(k: K, v: Brief[K]) => void }) {
  function toggle(c: string) {
    if (brief.channels.includes(c)) set('channels', brief.channels.filter((x) => x !== c));
    else set('channels', [...brief.channels, c]);
  }
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-[20px] font-bold text-evari-text">Channels</h2>
        <p className="text-[12px] text-evari-dim mt-0.5">Where will we reach this audience?</p>
      </header>
      <Card title="Selected channels">
        <div className="flex flex-wrap gap-2">
          {CHANNEL_OPTIONS.map((c) => {
            const on = brief.channels.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                className={cn('px-3 py-1.5 rounded-md text-[12px] font-medium transition border',
                  on ? 'bg-evari-gold text-evari-goldInk border-evari-gold' : 'bg-evari-ink/30 text-evari-dim border-evari-edge/40 hover:border-evari-gold/40')}
              >
                {c}
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function MessagingStep({ brief, set }: { brief: Brief; set: <K extends keyof Brief>(k: K, v: Brief[K]) => void }) {
  const items = brief.messaging ?? [];
  function add() { set('messaging', [...items, { angle: '', line: '' }]); }
  function remove(i: number) { const next = items.slice(); next.splice(i, 1); set('messaging', next); }
  function setAt(i: number, patch: Partial<{ angle: string; line: string }>) {
    const next = items.slice(); next[i] = { ...next[i], ...patch }; set('messaging', next);
  }
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-[20px] font-bold text-evari-text">Messaging</h2>
        <p className="text-[12px] text-evari-dim mt-0.5">A few angles you'll want to use. Each angle gets a name and an example line.</p>
      </header>
      <Card title="Messaging angles">
        <div className="space-y-2">
          {items.map((m, i) => (
            <div key={i} className="rounded-md border border-evari-edge/30 bg-evari-ink/30 p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <input value={m.angle} onChange={(e) => setAt(i, { angle: e.target.value })} className={`${INPUT_CLS} flex-1`} placeholder={`Angle ${i + 1}`} />
                <button type="button" onClick={() => remove(i)} className="text-evari-dim hover:text-evari-danger transition"><X className="h-3.5 w-3.5" /></button>
              </div>
              <input value={m.line ?? ''} onChange={(e) => setAt(i, { line: e.target.value })} className={INPUT_CLS} placeholder="Example line..." />
            </div>
          ))}
          <button type="button" onClick={add} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-evari-gold hover:text-evari-text border border-evari-edge/30 hover:border-evari-gold/40 transition">
            <Plus className="h-3 w-3" /> Add angle
          </button>
        </div>
      </Card>
    </div>
  );
}

function MetricsStep({ brief, set }: { brief: Brief; set: <K extends keyof Brief>(k: K, v: Brief[K]) => void }) {
  const items = brief.successMetrics ?? [];
  function add() { set('successMetrics', [...items, { name: '', target: '' }]); }
  function remove(i: number) { const next = items.slice(); next.splice(i, 1); set('successMetrics', next); }
  function setAt(i: number, patch: Partial<{ name: string; target: string }>) {
    const next = items.slice(); next[i] = { ...next[i], ...patch }; set('successMetrics', next);
  }
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-[20px] font-bold text-evari-text">Success metrics</h2>
        <p className="text-[12px] text-evari-dim mt-0.5">What does winning look like? Reply rate, meetings booked, pipeline impact.</p>
      </header>
      <Card title="Metrics">
        <div className="space-y-2">
          {items.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={m.name} onChange={(e) => setAt(i, { name: e.target.value })} className={`${INPUT_CLS} flex-1`} placeholder="Metric name" />
              <input value={m.target ?? ''} onChange={(e) => setAt(i, { target: e.target.value })} className={`${INPUT_CLS} w-32`} placeholder="Target" />
              <button type="button" onClick={() => remove(i)} className="text-evari-dim hover:text-evari-danger transition"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button type="button" onClick={add} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-evari-gold hover:text-evari-text border border-evari-edge/30 hover:border-evari-gold/40 transition">
            <Plus className="h-3 w-3" /> Add metric
          </button>
        </div>
      </Card>
    </div>
  );
}

function HandoffStep({ brief, onHandoff }: { brief: Brief; onHandoff: () => void }) {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-[20px] font-bold text-evari-text">Handoff</h2>
        <p className="text-[12px] text-evari-dim mt-0.5">Hand the strategy off to Discovery to find candidate companies. Your filters carry through.</p>
      </header>
      <Card title="Strategy summary">
        <div className="space-y-1 text-[12px]">
          <SumLine label="Audience" value={brief.targetAudience.join(', ') || '—'} />
          <SumLine label="Industries" value={brief.industries.join(', ') || '—'} />
          <SumLine label="Geography" value={brief.geography || '—'} />
          <SumLine label="Company size" value={brief.companySizeMin && brief.companySizeMax ? `${brief.companySizeMin} – ${brief.companySizeMax}` : '—'} />
          <SumLine label="Revenue" value={brief.revenueMin && brief.revenueMax ? `${brief.revenueMin} – ${brief.revenueMax}` : '—'} />
          <SumLine label="Channels" value={brief.channels.join(', ') || '—'} />
        </div>
      </Card>
      <button
        type="button"
        onClick={onHandoff}
        className="inline-flex items-center gap-1 px-4 py-2 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition"
      >
        <Sparkles className="h-3.5 w-3.5" /> Hand off to Discovery
      </button>
    </div>
  );
}

// ─── Shared form bits ─────────────────────────────────────────

const INPUT_CLS = 'w-full px-2 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
      <h3 className="text-[13px] font-semibold text-evari-text mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</span>
        {action ?? null}
      </div>
      {children}
    </div>
  );
}

function ChipsField({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (xs: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  function add() {
    const v = draft.trim();
    if (!v || values.includes(v)) { setDraft(''); return; }
    onChange([...values, v]);
    setDraft('');
  }
  function remove(v: string) { onChange(values.filter((x) => x !== v)); }
  return (
    <div>
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">{label}</span>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-evari-gold/10 text-evari-gold text-[11px] border border-evari-gold/30">
            {v}
            <button type="button" onClick={() => remove(v)} className="hover:text-evari-text"><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} className={`${INPUT_CLS} flex-1`} placeholder={placeholder} />
        <button type="button" onClick={add} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-evari-gold border border-evari-edge/30 hover:border-evari-gold/40 transition">
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
    </div>
  );
}

function SumLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-t first:border-t-0 border-evari-edge/20">
      <span className="text-evari-dim">{label}</span>
      <span className="text-evari-text text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}
