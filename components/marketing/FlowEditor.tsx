'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Loader2, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Flow, FlowStep, FlowStepConfig } from '@/lib/marketing/types';

interface Props {
  mode: 'new' | 'edit';
  flow?: Flow;
  initialSteps?: FlowStep[];
}

const SAMPLE_STEPS: FlowStepConfig[] = [
  { type: 'delay', hours: 1 },
  { type: 'email', subject: 'Welcome to Evari', html: '<p>Glad to have you.</p>' },
];

/**
 * Minimal JSON-config flow editor — per spec, no visual builder.
 * Identity (name/trigger/active) on the left; raw JSON for the
 * ordered list of steps on the right. Validates JSON.parse on save.
 */
export function FlowEditor({ mode, flow, initialSteps }: Props) {
  const router = useRouter();
  const editing = mode === 'edit' && !!flow;
  const [name, setName] = useState(flow?.name ?? '');
  const [triggerValue, setTriggerValue] = useState(flow?.triggerValue ?? '');
  const [isActive, setIsActive] = useState<boolean>(flow?.isActive ?? false);
  const initialJson =
    initialSteps && initialSteps.length > 0
      ? JSON.stringify(initialSteps.map((s) => s.config), null, 2)
      : JSON.stringify(SAMPLE_STEPS, null, 2);
  const [stepsJson, setStepsJson] = useState(initialJson);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function validateSteps(): FlowStepConfig[] | null {
    try {
      const parsed = JSON.parse(stepsJson);
      if (!Array.isArray(parsed)) {
        setError('Steps must be a JSON array of step configs.');
        return null;
      }
      for (const s of parsed) {
        if (!s || typeof s !== 'object' || !('type' in s)) {
          setError('Each step needs a "type" of delay | email | condition.');
          return null;
        }
      }
      setError(null);
      return parsed as FlowStepConfig[];
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON');
      return null;
    }
  }

  async function persist(): Promise<Flow | null> {
    const steps = validateSteps();
    if (!steps) return null;
    setSaving(true);
    setInfo(null);
    try {
      // 1. Save flow identity
      const url = editing ? `/api/marketing/flows/${flow!.id}` : '/api/marketing/flows';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          triggerType: 'event',
          triggerValue: triggerValue.trim(),
          isActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Save failed');
      const savedFlow: Flow = data.flow;

      // 2. Reconcile steps — wipe + re-create. Tiny scale, simple.
      const stepsRes = await fetch(`/api/marketing/flows/${savedFlow.id}/steps`, {
        cache: 'no-store',
      });
      const stepsData = await stepsRes.json().catch(() => ({}));
      const existing: FlowStep[] = stepsData.steps ?? [];
      for (const ex of existing) {
        await fetch(`/api/marketing/flows/${savedFlow.id}/steps/${ex.id}`, { method: 'DELETE' });
      }
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        await fetch(`/api/marketing/flows/${savedFlow.id}/steps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepType: s.type, config: s, order: i }),
        });
      }

      router.refresh();
      return savedFlow;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    const f = await persist();
    if (f && !editing) router.push(`/email/flows/${f.id}`);
    else if (f) setInfo('Saved');
  }

  async function handleDelete() {
    if (!editing || !flow) return;
    if (!confirm(`Delete flow "${flow.name}"?`)) return;
    const res = await fetch(`/api/marketing/flows/${flow.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (data.ok) router.push('/email/flows');
  }

  const inputCls =
    'px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none transition-colors duration-500 ease-in-out w-full';

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink p-4">
      <div className="mb-3">
        <Link href="/email/flows" className="inline-flex items-center gap-1 text-xs text-evari-dim hover:text-evari-text">
          <ChevronLeft className="h-3.5 w-3.5" />
          All flows
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-evari-text">Setup</h2>

          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Flow name</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Trigger event type</span>
            <input
              className={cn(inputCls, 'font-mono text-[12px]')}
              placeholder="e.g. signup_completed"
              value={triggerValue}
              onChange={(e) => setTriggerValue(e.target.value)}
            />
            <span className="block text-[10px] text-evari-dimmer mt-1">
              When any contact fires this event, a run is created and the worker
              begins executing the steps.
            </span>
          </label>

          <label className="flex items-center gap-2 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded accent-evari-gold"
            />
            <span className="text-sm text-evari-text">Active</span>
            <span className="text-[10px] text-evari-dimmer">— paused flows ignore incoming triggers.</span>
          </label>
        </section>

        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 flex flex-col min-h-[420px]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-evari-text">Steps (JSON)</h2>
            <span className="text-[10px] text-evari-dimmer">
              array of {`{ "type": "delay", hours|days|minutes }`} or {`{ "type": "email", subject, html }`}
            </span>
          </div>
          <textarea
            value={stepsJson}
            onChange={(e) => setStepsJson(e.target.value)}
            className="flex-1 px-3 py-2 rounded-md bg-evari-ink text-evari-text font-mono text-[12px] leading-relaxed border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none resize-none min-h-[400px]"
            spellCheck={false}
          />
        </section>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {error ? <span className="text-xs text-evari-danger">{error}</span> : null}
        {info ? <span className="text-xs text-evari-success">{info}</span> : null}
        <div className="ml-auto flex items-center gap-2">
          {editing ? (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-evari-dim hover:text-evari-danger transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || !triggerValue.trim() || saving}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-40 hover:brightness-105 transition duration-500 ease-in-out"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? 'Saving…' : editing ? 'Save flow' : 'Create flow'}
          </button>
        </div>
      </div>
    </div>
  );
}
