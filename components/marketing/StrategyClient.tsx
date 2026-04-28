'use client';

/**
 * Strategy brief builder for a single idea (play).
 *
 * Vertical step list on the left (Brief, Target profile, Ideal
 * customer, Channels, Messaging, Success metrics, Handoff). Right
 * column hosts the active step's editor. The Strategy summary card
 * (sticky on the right when wide) shows the brief at a glance and
 * holds the "Hand off to Discovery" action.
 *
 * Persistence: every edit autosaves via PATCH /api/strategy/[playId].
 * Handoff sets handoff_status='handed_off' and routes to /discover
 * with playId in the query.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAISurface } from '@/components/ai/AIAssistantPane';
import { AIDraftButton } from '@/components/ai/AIDraftButton';

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
  { key: 'brief', label: 'Brief' },
  { key: 'target', label: 'Target profile' },
  { key: 'ideal', label: 'Ideal customer' },
  { key: 'channels', label: 'Channels' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'metrics', label: 'Success metrics' },
  { key: 'handoff', label: 'Handoff' },
] as const;

type StepKey = typeof STEPS[number]['key'];

const CHANNEL_OPTIONS = ['email', 'linkedin', 'website', 'social', 'phone', 'event'];

interface Props {
  plays: { id: string; title: string }[];
  play: { id: string; title: string; brief: string };
  initialBrief: Brief | null;
}

export function StrategyClient({ plays, play, initialBrief }: Props) {
  const router = useRouter();
  const [brief, setBrief] = useState<Brief | null>(initialBrief);
  const [step, setStep] = useState<StepKey>('brief');
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

  function handoff() {
    if (!brief) return;
    setBrief({ ...brief, handoffStatus: 'handed_off' });
    router.push(`/discover?playId=${brief.playId}`);
  }

  if (!brief) return null;

  return (
    <div className="flex-1 min-h-0 flex bg-evari-ink overflow-hidden">
      <div className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-5xl mx-auto px-4 py-5 grid grid-cols-[200px_minmax(0,1fr)_280px] gap-4">
          {/* Step rail */}
          <aside className="space-y-1">
            <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2 px-2">For idea</div>
            <select
              className="w-full mb-3 px-2 py-1.5 rounded-md bg-evari-surface text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
              value={brief.playId}
              onChange={(e) => router.push(`/strategy?playId=${e.target.value}`)}
            >
              {plays.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <ol className="space-y-1">
              {STEPS.map((s, i) => (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => setStep(s.key)}
                    className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[12px] transition',
                      step === s.key ? 'bg-evari-gold/10 text-evari-text' : 'text-evari-dim hover:text-evari-text hover:bg-evari-surface')}
                  >
                    <span className={cn('inline-flex items-center justify-center h-5 w-5 rounded-full border text-[10px] font-mono',
                      step === s.key ? 'border-evari-gold bg-evari-gold text-evari-goldInk' : 'border-evari-edge text-evari-dim')}>
                      {i + 1}
                    </span>
                    <span className="flex-1">{s.label}</span>
                    {step === s.key ? <ChevronRight className="h-3 w-3" /> : null}
                  </button>
                </li>
              ))}
            </ol>
          </aside>

          {/* Active step editor */}
          <main className="rounded-md bg-evari-surface border border-evari-edge/30 p-5 min-h-[460px]">
            {step === 'brief' ? <BriefStep brief={brief} set={set} /> : null}
            {step === 'target' ? <TargetStep brief={brief} set={set} /> : null}
            {step === 'ideal' ? <IdealStep brief={brief} set={set} /> : null}
            {step === 'channels' ? <ChannelsStep brief={brief} set={set} /> : null}
            {step === 'messaging' ? <MessagingStep brief={brief} set={set} /> : null}
            {step === 'metrics' ? <MetricsStep brief={brief} set={set} /> : null}
            {step === 'handoff' ? <HandoffStep brief={brief} onHandoff={handoff} /> : null}
          </main>

          {/* Summary card */}
          <aside className="rounded-md bg-evari-surface border border-evari-edge/30 p-3 h-fit sticky top-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2">Strategy summary</div>
            <SumRow label="Audience" value={brief.targetAudience.length > 0 ? brief.targetAudience.join(', ') : '—'} />
            <SumRow label="Geography" value={brief.geography || '—'} />
            <SumRow label="Industries" value={brief.industries.length > 0 ? brief.industries.join(', ') : '—'} />
            <SumRow label="Company size" value={brief.companySizeMin && brief.companySizeMax ? `${brief.companySizeMin} – ${brief.companySizeMax}` : '—'} />
            <SumRow label="Revenue" value={brief.revenueMin && brief.revenueMax ? `${brief.revenueMin} – ${brief.revenueMax}` : '—'} />
            <SumRow label="Channels" value={brief.channels.length > 0 ? brief.channels.join(', ') : '—'} />
            <SumRow label="Handoff" value={brief.handoffStatus === 'handed_off' ? 'Done' : brief.handoffStatus} />
            <button
              type="button"
              onClick={handoff}
              className="w-full mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-semibold bg-evari-text text-evari-ink hover:brightness-110 transition"
            >
              Hand off to Discovery <ChevronRight className="h-3.5 w-3.5" />
            </button>
            {savingAt && Date.now() - savingAt < 2000 ? (
              <div className="mt-2 text-[10px] text-evari-success inline-flex items-center gap-1"><Check className="h-3 w-3" /> Saved</div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

function BriefStep({ brief, set }: { brief: Brief; set: <K extends keyof Brief>(k: K, v: Brief[K]) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-evari-text">Brief</h2>
      <p className="text-[12px] text-evari-dim">Define the strategy and target for this idea.</p>
      <Field label="Campaign name">
        <input value={brief.campaignName ?? ''} onChange={(e) => set('campaignName', e.target.value)} className={INPUT_CLS} placeholder="Superyacht Owners UK" />
      </Field>
      <Field
        label="Objective"
        action={
          <AIDraftButton field="free" value={brief.objective ?? ''} context={`Brief for: ${brief.campaignName ?? ''}.`} onApply={(v) => set('objective', v)} />
        }
      >
        <textarea value={brief.objective ?? ''} onChange={(e) => set('objective', e.target.value)} className={`${INPUT_CLS} min-h-[80px]`} placeholder="Connect with superyacht owners and decision makers in the UK to build relationships and generate sales opportunities." />
      </Field>
    </div>
  );
}

function TargetStep({ brief, set }: { brief: Brief; set: <K extends keyof Brief>(k: K, v: Brief[K]) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-evari-text">Target profile</h2>
      <p className="text-[12px] text-evari-dim">Who are we going after and where do they live?</p>
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
  );
}

function IdealStep({ brief, set }: { brief: Brief; set: <K extends keyof Brief>(k: K, v: Brief[K]) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-evari-text">Ideal customer</h2>
      <p className="text-[12px] text-evari-dim">A prose description of the most-likely buyer. Used by the fit scorer to rank candidates.</p>
      <Field
        label="Ideal customer"
        action={<AIDraftButton field="free" value={brief.idealCustomer ?? ''} context={`Idea: ${brief.campaignName ?? ''}. Audience: ${brief.targetAudience.join(', ')}.`} onApply={(v) => set('idealCustomer', v)} />}
      >
        <textarea value={brief.idealCustomer ?? ''} onChange={(e) => set('idealCustomer', e.target.value)} className={`${INPUT_CLS} min-h-[160px]`} placeholder="The ideal customer is..." />
      </Field>
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
      <h2 className="text-base font-semibold text-evari-text">Channels</h2>
      <p className="text-[12px] text-evari-dim">Where will we reach this audience?</p>
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
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-evari-text">Messaging</h2>
      <p className="text-[12px] text-evari-dim">A few angles you'll want to use. Each angle gets a name and an example line.</p>
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
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-evari-text">Success metrics</h2>
      <p className="text-[12px] text-evari-dim">What does winning look like? Reply rate, meetings booked, pipeline impact.</p>
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
    </div>
  );
}

function HandoffStep({ brief, onHandoff }: { brief: Brief; onHandoff: () => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-evari-text">Handoff</h2>
      <p className="text-[12px] text-evari-dim">Hand the strategy off to Discovery to find candidate companies. Your filters carry through.</p>
      <div className="rounded-md border border-evari-edge/30 bg-evari-ink/30 p-3 space-y-1 text-[12px]">
        <div><span className="text-evari-dim">Audience:</span> <span className="text-evari-text">{brief.targetAudience.join(', ') || '—'}</span></div>
        <div><span className="text-evari-dim">Industries:</span> <span className="text-evari-text">{brief.industries.join(', ') || '—'}</span></div>
        <div><span className="text-evari-dim">Geography:</span> <span className="text-evari-text">{brief.geography || '—'}</span></div>
      </div>
      <button
        type="button"
        onClick={onHandoff}
        className="inline-flex items-center gap-1 px-4 py-2 rounded-md text-[12px] font-semibold bg-evari-text text-evari-ink hover:brightness-110 transition"
      >
        <Sparkles className="h-3.5 w-3.5" /> Hand off to Discovery
      </button>
    </div>
  );
}

const INPUT_CLS = 'w-full px-2 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none';

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
    if (!v) return;
    if (values.includes(v)) return;
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

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-[11px] flex items-baseline justify-between gap-2 py-1 border-t first:border-t-0 border-evari-edge/20">
      <span className="text-evari-dim">{label}</span>
      <span className="text-evari-text text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}
