'use client';

/**
 * Sequence editor — renders a vertical stack of email steps with
 * wait-day inputs between them. Step 0 inherits its subject + body
 * from the primary campaign fields; steps 1..N have their own
 * subject + body (compact textarea) so the operator can write
 * follow-ups without leaving the wizard.
 *
 * Persistence is the caller's job — we expose value + onChange.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Mail, Plus, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface Step {
  kind: 'email';
  subject: string | null;
  html: string | null;
  design: unknown;
  waitDays: number;
}

interface Sequence { steps: Step[] }

const MAX_STEPS = 5;

export function SequenceEditor({ value, onChange }: { value: Sequence | null; onChange: (next: Sequence | null) => void }) {
  const enabled = !!value && Array.isArray(value.steps) && value.steps.length > 1;
  const steps = value?.steps ?? [];

  function enable() {
    onChange({ steps: [
      { kind: 'email', subject: null, html: null, design: null, waitDays: 0 },
      { kind: 'email', subject: null, html: null, design: null, waitDays: 3 },
    ] });
  }
  function disable() { onChange(null); }
  function setStep(i: number, patch: Partial<Step>) {
    const next = steps.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ steps: next });
  }
  function add() {
    if (steps.length >= MAX_STEPS) return;
    onChange({ steps: [...steps, { kind: 'email', subject: null, html: null, design: null, waitDays: 3 }] });
  }
  function remove(i: number) {
    if (i === 0) return; // step 0 stays
    const next = steps.slice();
    next.splice(i, 1);
    onChange({ steps: next });
  }
  function move(i: number, dir: -1 | 1) {
    if (i === 0) return; // step 0 fixed
    const j = i + dir;
    if (j <= 0 || j >= steps.length) return;
    const next = steps.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ steps: next });
  }

  if (!enabled) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-evari-edge/40 p-3 flex items-center justify-between">
        <div className="text-[12px] text-evari-dim">
          Add follow-up emails to make this a sequence. Recipients who reply are skipped automatically.
        </div>
        <button type="button" onClick={enable} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-evari-gold/30 bg-evari-gold/5 text-evari-gold hover:bg-evari-gold/15 transition">
          <Plus className="h-3 w-3" /> Make this a sequence
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-md border border-evari-gold/30 bg-evari-gold/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-evari-gold/15 text-evari-gold"><Mail className="h-3.5 w-3.5" /></span>
        <span className="text-[11px] uppercase tracking-[0.12em] text-evari-gold flex-1">Sequence ({steps.length} step{steps.length === 1 ? '' : 's'})</span>
        <button type="button" onClick={disable} className="text-[11px] text-evari-dim hover:text-evari-text transition">Remove sequence</button>
      </div>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="rounded-md border border-evari-edge/30 bg-evari-ink/30 p-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-evari-edge text-[10px] font-mono text-evari-dim">{i + 1}</span>
              <span className="text-[12px] font-semibold text-evari-text">Email {i + 1}{i === 0 ? ' (primary)' : ''}</span>
              {i > 0 ? (
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => move(i, -1)} className="text-evari-dim hover:text-evari-text p-0.5 rounded transition" title="Move up"><ChevronUp className="h-3 w-3" /></button>
                  <button type="button" onClick={() => move(i, 1)} className="text-evari-dim hover:text-evari-text p-0.5 rounded transition" title="Move down"><ChevronDown className="h-3 w-3" /></button>
                  <button type="button" onClick={() => remove(i)} className="text-evari-dim hover:text-evari-danger p-0.5 rounded transition" title="Remove"><Trash2 className="h-3 w-3" /></button>
                </div>
              ) : null}
            </div>
            {i > 0 ? (
              <div className="flex items-center gap-2 mb-2 text-[11px] text-evari-dim">
                <Clock className="h-3 w-3 text-evari-dimmer" />
                <span>Wait</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={step.waitDays}
                  onChange={(e) => setStep(i, { waitDays: Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0)) })}
                  className="w-16 px-2 py-1 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none"
                />
                <span>day{step.waitDays === 1 ? '' : 's'} after the previous step</span>
              </div>
            ) : null}
            {i > 0 ? (
              <>
                <input
                  value={step.subject ?? ''}
                  onChange={(e) => setStep(i, { subject: e.target.value })}
                  placeholder="Subject (or leave blank to inherit)"
                  className="w-full mb-1.5 px-2 py-1 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none"
                />
                <textarea
                  value={step.html ?? ''}
                  onChange={(e) => setStep(i, { html: e.target.value })}
                  placeholder="Body (or leave blank to inherit primary body)"
                  className="w-full min-h-[80px] px-2 py-1 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none"
                />
              </>
            ) : (
              <div className="text-[11px] text-evari-dim">Inherits the primary subject + body you configured above.</div>
            )}
          </li>
        ))}
      </ol>
      {steps.length < MAX_STEPS ? (
        <button type="button" onClick={add} className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition',
          'border-evari-gold/30 bg-evari-gold/5 text-evari-gold hover:bg-evari-gold/15')}>
          <Plus className="h-3 w-3" /> Add follow-up
        </button>
      ) : null}
    </div>
  );
}
