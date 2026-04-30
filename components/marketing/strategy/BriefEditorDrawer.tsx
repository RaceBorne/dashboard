'use client';

/**
 * Brief editor — one drawer that opens from any dashboard substep.
 * Tabbed by section so the operator can land on the relevant form
 * fields without scrolling. All edits autosave via the parent's
 * `set` callback (debounced upstream).
 */

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { AIDraftButton } from '@/components/ai/AIDraftButton';

export type BriefSection = 'overview' | 'target' | 'ideal' | 'channels' | 'messaging' | 'metrics';

interface Brief {
  id: string;
  playId: string;
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
  handoffStatus: 'draft' | 'ready' | 'handed_off';
}

const CHANNEL_OPTIONS = ['email', 'linkedin_organic', 'linkedin_paid', 'website', 'social', 'phone', 'event'];

const TABS: { key: BriefSection; label: string }[] = [
  { key: 'overview',  label: 'Overview' },
  { key: 'target',    label: 'Target' },
  { key: 'ideal',     label: 'Ideal customer' },
  { key: 'channels',  label: 'Channels' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'metrics',   label: 'Metrics' },
];

export function BriefEditorDrawer({
  open, onClose, initialSection, brief, set,
}: {
  open: boolean;
  onClose: () => void;
  initialSection: BriefSection;
  brief: Brief;
  set: <K extends keyof Brief>(k: K, v: Brief[K]) => void;
}) {
  const [active, setActive] = useState<BriefSection>(initialSection);
  useEffect(() => { if (open) setActive(initialSection); }, [open, initialSection]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <aside className="relative h-full w-full max-w-[480px] bg-evari-surface border-l border-evari-edge/40 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="px-4 py-3 border-b border-evari-edge/30 flex items-center gap-2">
          <h3 className="text-[14px] font-semibold text-evari-text flex-1">Edit brief</h3>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text p-1 rounded transition"><X className="h-4 w-4" /></button>
        </header>
        <div className="px-3 py-2 border-b border-evari-edge/30 flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setActive(t.key)} className={cn('px-2.5 py-1 rounded-md text-[11px] font-medium transition',
              active === t.key ? 'bg-evari-gold/15 text-evari-gold' : 'text-evari-dim hover:text-evari-text')}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {active === 'overview' ? (
            <>
              <Field label="Campaign name">
                <input value={brief.campaignName ?? ''} onChange={(e) => set('campaignName', e.target.value)} className={INPUT_CLS} placeholder="Superyacht Owners UK" />
              </Field>
              <Field
                label="Objective"
                action={<AIDraftButton field="free" value={brief.objective ?? ''} context={`Brief for: ${brief.campaignName ?? ''}.`} onApply={(v) => set('objective', v)} />}
              >
                <textarea value={brief.objective ?? ''} onChange={(e) => set('objective', e.target.value)} className={`${INPUT_CLS} min-h-[100px]`} placeholder="What's the campaign trying to do?" />
              </Field>
            </>
          ) : null}

          {active === 'target' ? (
            <>
              <ChipsField label="Target audience" values={brief.targetAudience} onChange={(xs) => set('targetAudience', xs)} placeholder="e.g. Superyacht Owners" />
              <Field label="Geography">
                <input value={brief.geography ?? ''} onChange={(e) => set('geography', e.target.value)} className={INPUT_CLS} placeholder="United Kingdom" />
              </Field>
              <ChipsField label="Industries" values={brief.industries} onChange={(xs) => set('industries', xs)} placeholder="e.g. Luxury Yachts" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Company size — min">
                  <input type="number" value={brief.companySizeMin ?? ''} onChange={(e) => set('companySizeMin', e.target.value ? parseInt(e.target.value, 10) : null)} className={INPUT_CLS} />
                </Field>
                <Field label="Company size — max">
                  <input type="number" value={brief.companySizeMax ?? ''} onChange={(e) => set('companySizeMax', e.target.value ? parseInt(e.target.value, 10) : null)} className={INPUT_CLS} />
                </Field>
                <Field label="Revenue — min">
                  <input value={brief.revenueMin ?? ''} onChange={(e) => set('revenueMin', e.target.value)} className={INPUT_CLS} placeholder="£5M" />
                </Field>
                <Field label="Revenue — max">
                  <input value={brief.revenueMax ?? ''} onChange={(e) => set('revenueMax', e.target.value)} className={INPUT_CLS} placeholder="£250M" />
                </Field>
              </div>
            </>
          ) : null}

          {active === 'ideal' ? (
            <Field
              label="Ideal customer"
              action={<AIDraftButton field="free" value={brief.idealCustomer ?? ''} context={`Idea: ${brief.campaignName ?? ''}. Audience: ${brief.targetAudience.join(', ')}.`} onApply={(v) => set('idealCustomer', v)} />}
            >
              <textarea value={brief.idealCustomer ?? ''} onChange={(e) => set('idealCustomer', e.target.value)} className={`${INPUT_CLS} min-h-[180px]`} placeholder="The ideal customer is..." />
            </Field>
          ) : null}

          {active === 'channels' ? (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Selected channels</div>
              <div className="flex flex-wrap gap-2">
                {CHANNEL_OPTIONS.map((c) => {
                  const on = brief.channels.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set('channels', on ? brief.channels.filter((x) => x !== c) : [...brief.channels, c])}
                      className={cn('px-3 py-1.5 rounded-md text-[12px] font-medium transition border',
                        on ? 'bg-evari-gold text-evari-goldInk border-evari-gold' : 'bg-evari-ink/30 text-evari-dim border-evari-edge/40 hover:border-evari-gold/40')}
                    >
                      {humaniseChannel(c)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {active === 'messaging' ? (
            <MessagingEditor brief={brief} set={set} />
          ) : null}

          {active === 'metrics' ? (
            <MetricsEditor brief={brief} set={set} />
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function MessagingEditor({ brief, set }: { brief: Brief; set: <K extends keyof Brief>(k: K, v: Brief[K]) => void }) {
  const items = brief.messaging ?? [];
  function add() { set('messaging', [...items, { angle: '', line: '' }]); }
  function remove(i: number) { const next = items.slice(); next.splice(i, 1); set('messaging', next); }
  function setAt(i: number, patch: Partial<{ angle: string; line: string }>) {
    const next = items.slice(); next[i] = { ...next[i], ...patch }; set('messaging', next);
  }
  return (
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
  );
}

function MetricsEditor({ brief, set }: { brief: Brief; set: <K extends keyof Brief>(k: K, v: Brief[K]) => void }) {
  const items = brief.successMetrics ?? [];
  function add() { set('successMetrics', [...items, { name: '', target: '' }]); }
  function remove(i: number) { const next = items.slice(); next.splice(i, 1); set('successMetrics', next); }
  function setAt(i: number, patch: Partial<{ name: string; target: string }>) {
    const next = items.slice(); next[i] = { ...next[i], ...patch }; set('successMetrics', next);
  }
  return (
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

export function humaniseChannel(c: string): string {
  return c.replace('linkedin_organic', 'LinkedIn (Organic)').replace('linkedin_paid', 'LinkedIn (Paid)').replace(/\b\w/g, (s) => s.toUpperCase());
}
