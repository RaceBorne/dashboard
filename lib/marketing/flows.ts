/**
 * Flows: low-fi Klaviyo-style automation.
 *
 *   trigger: { type: 'event', value: '<event_type>' }
 *   steps  : ordered list of { delay | email | condition }
 *
 * Per-contact execution state lives on dashboard_mkt_flow_runs. The
 * worker (/api/cron/marketing-flows) ticks every few minutes:
 *   - select runs with status in ('pending','waiting') and
 *     wake_at <= now()
 *   - for each: load the corresponding step at current_step_order;
 *     execute (delay → set wake_at, email → sendOne); advance the
 *     step pointer; when past last step → mark completed
 *
 * The trigger detector hooks into trackEvent() in lib/marketing/events.ts:
 * any event whose type matches an active flow's trigger_value creates
 * a pending run (idempotent on the partial unique index — duplicate
 * triggers while a run is active are no-ops).
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { sendOne } from './sender';
import { unsubscribeUrlFor } from './suppressions';
import { trackEvent } from './events';
import type {
  Flow,
  FlowRun,
  FlowRunStatus,
  FlowStep,
  FlowStepConfig,
  FlowTriggerType,
} from './types';

interface FlowRow {
  id: string;
  name: string;
  trigger_type: FlowTriggerType;
  trigger_value: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface FlowStepRow {
  id: string;
  flow_id: string;
  step_type: 'delay' | 'email' | 'condition';
  config: FlowStepConfig | null;
  order: number;
  created_at: string;
}

interface FlowRunRow {
  id: string;
  flow_id: string;
  contact_id: string;
  current_step_order: number;
  status: FlowRunStatus;
  wake_at: string | null;
  trigger_event_id: string | null;
  trigger_event_type: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function rowToFlow(r: FlowRow): Flow {
  return {
    id: r.id,
    name: r.name,
    triggerType: r.trigger_type,
    triggerValue: r.trigger_value,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToStep(r: FlowStepRow): FlowStep {
  return {
    id: r.id,
    flowId: r.flow_id,
    stepType: r.step_type,
    config: (r.config ?? { type: r.step_type }) as FlowStepConfig,
    order: r.order,
    createdAt: r.created_at,
  };
}

function rowToRun(r: FlowRunRow): FlowRun {
  return {
    id: r.id,
    flowId: r.flow_id,
    contactId: r.contact_id,
    currentStepOrder: r.current_step_order,
    status: r.status,
    wakeAt: r.wake_at,
    triggerEventId: r.trigger_event_id,
    triggerEventType: r.trigger_event_type,
    lastError: r.last_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
  };
}

// ─── Flows CRUD ───────────────────────────────────────────────────

export async function listFlows(): Promise<Flow[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_mkt_flows')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('[mkt.flows.list]', error);
    return [];
  }
  return (data ?? []).map(rowToFlow);
}

export async function getFlow(id: string): Promise<Flow | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_flows')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[mkt.flows.get]', error);
    return null;
  }
  return data ? rowToFlow(data) : null;
}

export async function createFlow(input: {
  name: string;
  triggerType: FlowTriggerType;
  triggerValue: string;
  isActive?: boolean;
}): Promise<Flow | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_flows')
    .insert({
      name: input.name.trim(),
      trigger_type: input.triggerType,
      trigger_value: input.triggerValue.trim(),
      is_active: input.isActive ?? false,
    })
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.flows.create]', error);
    return null;
  }
  return rowToFlow(data);
}

export async function updateFlow(
  id: string,
  patch: Partial<{
    name: string;
    triggerType: FlowTriggerType;
    triggerValue: string;
    isActive: boolean;
  }>,
): Promise<Flow | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const dbPatch: Record<string, unknown> = {};
  if ('name' in patch && patch.name) dbPatch.name = patch.name.trim();
  if ('triggerType' in patch && patch.triggerType) dbPatch.trigger_type = patch.triggerType;
  if ('triggerValue' in patch && patch.triggerValue) dbPatch.trigger_value = patch.triggerValue.trim();
  if ('isActive' in patch) dbPatch.is_active = patch.isActive;
  if (Object.keys(dbPatch).length === 0) return getFlow(id);
  const { data, error } = await sb
    .from('dashboard_mkt_flows')
    .update(dbPatch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.flows.update]', error);
    return null;
  }
  return rowToFlow(data);
}

export async function deleteFlow(id: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  if (!sb) return false;
  const { error } = await sb.from('dashboard_mkt_flows').delete().eq('id', id);
  if (error) {
    console.error('[mkt.flows.delete]', error);
    return false;
  }
  return true;
}

// ─── Steps ───────────────────────────────────────────────────────

export async function listSteps(flowId: string): Promise<FlowStep[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_mkt_flow_steps')
    .select('*')
    .eq('flow_id', flowId)
    .order('order', { ascending: true });
  if (error) {
    console.error('[mkt.flows.listSteps]', error);
    return [];
  }
  return (data ?? []).map(rowToStep);
}

export async function createStep(input: {
  flowId: string;
  stepType: 'delay' | 'email' | 'condition';
  config: FlowStepConfig;
  order: number;
}): Promise<FlowStep | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_flow_steps')
    .insert({
      flow_id: input.flowId,
      step_type: input.stepType,
      config: input.config,
      order: input.order,
    })
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.flows.createStep]', error);
    return null;
  }
  return rowToStep(data);
}

export async function updateStep(
  id: string,
  patch: Partial<{ config: FlowStepConfig; order: number; stepType: 'delay' | 'email' | 'condition' }>,
): Promise<FlowStep | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const dbPatch: Record<string, unknown> = {};
  if ('config' in patch && patch.config) dbPatch.config = patch.config;
  if ('order' in patch && typeof patch.order === 'number') dbPatch.order = patch.order;
  if ('stepType' in patch && patch.stepType) dbPatch.step_type = patch.stepType;
  if (Object.keys(dbPatch).length === 0) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_flow_steps')
    .update(dbPatch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.flows.updateStep]', error);
    return null;
  }
  return rowToStep(data);
}

export async function deleteStep(id: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  if (!sb) return false;
  const { error } = await sb.from('dashboard_mkt_flow_steps').delete().eq('id', id);
  if (error) {
    console.error('[mkt.flows.deleteStep]', error);
    return false;
  }
  return true;
}

// ─── Runs / trigger ──────────────────────────────────────────────

/**
 * Called from trackEvent. For any active flow whose trigger matches
 * the event type, create a pending flow_run for that contact. The
 * partial unique index on (flow_id, contact_id) where status in
 * (pending|waiting|running) makes this idempotent — duplicate triggers
 * during an active run are silently no-ops.
 */
export async function fanOutEventToFlows(input: {
  eventId: string;
  contactId: string;
  eventType: string;
}): Promise<void> {
  const sb = createSupabaseAdmin();
  if (!sb) return;
  const { data: matches, error } = await sb
    .from('dashboard_mkt_flows')
    .select('id')
    .eq('is_active', true)
    .eq('trigger_type', 'event')
    .eq('trigger_value', input.eventType);
  if (error) {
    console.error('[mkt.flows.fanOut]', error);
    return;
  }
  for (const m of (matches ?? []) as Array<{ id: string }>) {
    const { error: insertErr } = await sb
      .from('dashboard_mkt_flow_runs')
      .insert({
        flow_id: m.id,
        contact_id: input.contactId,
        current_step_order: 0,
        status: 'pending' as FlowRunStatus,
        wake_at: null,
        trigger_event_id: input.eventId,
        trigger_event_type: input.eventType,
      });
    // Ignore the unique-violation case — that's the dedupe working.
    if (insertErr && insertErr.code !== '23505') {
      console.error('[mkt.flows.fanOut insert]', insertErr);
    }
  }
}

interface DueRun extends FlowRun {}

export async function listDueRuns(opts: { limit?: number } = {}): Promise<DueRun[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const nowIso = new Date().toISOString();
  // status pending  → run immediately; status waiting → only when wake_at passed.
  const { data, error } = await sb
    .from('dashboard_mkt_flow_runs')
    .select('*')
    .in('status', ['pending', 'waiting'])
    .or(`wake_at.is.null,wake_at.lte.${nowIso}`)
    .order('wake_at', { ascending: true, nullsFirst: true })
    .limit(opts.limit ?? 50);
  if (error) {
    console.error('[mkt.flows.listDueRuns]', error);
    return [];
  }
  return (data ?? []).map(rowToRun);
}

interface ContactForFlow {
  id: string;
  email: string;
  status: string;
}

async function loadContactForRun(contactId: string): Promise<ContactForFlow | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data } = await sb
    .from('dashboard_mkt_contacts')
    .select('id, email, status')
    .eq('id', contactId)
    .maybeSingle();
  return (data as ContactForFlow | null) ?? null;
}

function delayMs(cfg: Extract<FlowStepConfig, { type: 'delay' }>): number {
  const m = cfg.minutes ?? 0;
  const h = cfg.hours ?? 0;
  const d = cfg.days ?? 0;
  return ((d * 24 + h) * 60 + m) * 60 * 1000;
}

/**
 * Advance a single run by one step. Returns true if anything was
 * done (so the caller's progress counter ticks).
 */
export async function advanceRun(run: FlowRun): Promise<boolean> {
  const sb = createSupabaseAdmin();
  if (!sb) return false;

  const steps = await listSteps(run.flowId);
  const step = steps[run.currentStepOrder];

  // Past the last step → completed
  if (!step) {
    await sb
      .from('dashboard_mkt_flow_runs')
      .update({
        status: 'completed' as FlowRunStatus,
        completed_at: new Date().toISOString(),
        wake_at: null,
        last_error: null,
      })
      .eq('id', run.id);
    return true;
  }

  // Contact must still exist + be active
  const contact = await loadContactForRun(run.contactId);
  if (!contact || contact.status !== 'active') {
    await sb
      .from('dashboard_mkt_flow_runs')
      .update({
        status: 'cancelled' as FlowRunStatus,
        last_error: contact ? `contact status=${contact.status}` : 'contact missing',
      })
      .eq('id', run.id);
    return true;
  }

  // Mark as running so concurrent workers don't double-execute.
  await sb
    .from('dashboard_mkt_flow_runs')
    .update({ status: 'running' as FlowRunStatus })
    .eq('id', run.id);

  try {
    if (step.stepType === 'delay' && step.config?.type === 'delay') {
      const ms = delayMs(step.config);
      const wakeAt = new Date(Date.now() + ms).toISOString();
      await sb
        .from('dashboard_mkt_flow_runs')
        .update({
          status: 'waiting' as FlowRunStatus,
          wake_at: wakeAt,
          current_step_order: run.currentStepOrder + 1,
          last_error: null,
        })
        .eq('id', run.id);
      return true;
    }

    if (step.stepType === 'email' && step.config?.type === 'email') {
      const flow = await getFlow(run.flowId);
      const res = await sendOne({
        to: contact.email,
        subject: step.config.subject,
        html: step.config.html,
        context: `flow:${flow?.name ?? run.flowId}`,
        unsubscribeUrl: unsubscribeUrlFor(contact.email),
      });
      if (!res.ok) {
        await sb
          .from('dashboard_mkt_flow_runs')
          .update({
            status: 'failed' as FlowRunStatus,
            last_error: res.error ?? 'send failed',
          })
          .eq('id', run.id);
        return true;
      }
      // Emit a tracking event for segmentation feedback
      await trackEvent({
        contactId: contact.id,
        type: 'flow_email_sent',
        metadata: {
          flowId: run.flowId,
          stepOrder: step.order,
          messageId: res.messageId,
        },
      });
      // Advance immediately — next worker tick picks the next step up.
      await sb
        .from('dashboard_mkt_flow_runs')
        .update({
          status: 'pending' as FlowRunStatus,
          wake_at: null,
          current_step_order: run.currentStepOrder + 1,
          last_error: null,
        })
        .eq('id', run.id);
      return true;
    }

    // Condition step is a Phase 7+ scaffold — treat as no-op for now.
    if (step.stepType === 'condition') {
      await sb
        .from('dashboard_mkt_flow_runs')
        .update({
          status: 'pending' as FlowRunStatus,
          current_step_order: run.currentStepOrder + 1,
        })
        .eq('id', run.id);
      return true;
    }

    // Unknown step type — bail safely so the run doesn't loop forever.
    await sb
      .from('dashboard_mkt_flow_runs')
      .update({
        status: 'failed' as FlowRunStatus,
        last_error: `unknown step type: ${step.stepType}`,
      })
      .eq('id', run.id);
    return true;
  } catch (err) {
    await sb
      .from('dashboard_mkt_flow_runs')
      .update({
        status: 'failed' as FlowRunStatus,
        last_error: err instanceof Error ? err.message : String(err),
      })
      .eq('id', run.id);
    return true;
  }
}

export async function processDueRuns(opts: { limit?: number } = {}): Promise<{
  processed: number;
  completed: number;
  failed: number;
}> {
  const due = await listDueRuns({ limit: opts.limit ?? 50 });
  let processed = 0;
  let completed = 0;
  let failed = 0;
  for (const run of due) {
    const did = await advanceRun(run);
    if (did) processed += 1;
  }
  // Quick stats by re-querying terminal states from the original set
  const sb = createSupabaseAdmin();
  if (sb && due.length > 0) {
    const ids = due.map((r) => r.id);
    const { data } = await sb
      .from('dashboard_mkt_flow_runs')
      .select('status')
      .in('id', ids);
    for (const row of (data ?? []) as Array<{ status: string }>) {
      if (row.status === 'completed') completed += 1;
      if (row.status === 'failed') failed += 1;
    }
  }
  return { processed, completed, failed };
}
