/**
 * Sequence helpers for multi-email campaigns.
 *
 * A sequence is a small array of step objects on the campaign:
 *   { steps: [{ kind, subject, html, design, waitDays }] }
 *
 * Step 0 is the primary email (uses the campaign's subject + body if
 * its own fields are blank). Subsequent steps each have a waitDays
 * offset relative to the previous step's send time. The send pipeline
 * fires step 0 immediately and queues 1..N in dashboard_mkt_scheduled_steps.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { EmailDesign } from './types';

export interface SequenceStep {
  kind: 'email';
  subject: string | null;
  html: string | null;
  design: EmailDesign | null;
  waitDays: number;
}

export interface CampaignSequence {
  steps: SequenceStep[];
}

export function isMultiStep(seq: CampaignSequence | null | undefined): boolean {
  return !!seq && Array.isArray(seq.steps) && seq.steps.length > 1;
}

export async function setSequence(campaignId: string, seq: CampaignSequence | null): Promise<void> {
  const sb = createSupabaseAdmin();
  if (!sb) return;
  await sb.from('dashboard_mkt_campaigns').update({ sequence: seq }).eq('id', campaignId);
}

export async function getSequence(campaignId: string): Promise<CampaignSequence | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data } = await sb
    .from('dashboard_mkt_campaigns')
    .select('sequence')
    .eq('id', campaignId)
    .maybeSingle();
  return ((data as { sequence: CampaignSequence | null } | null)?.sequence) ?? null;
}

/**
 * Schedule sequence steps 1..N (step 0 fires immediately and isn't
 * queued). offsetFrom is the timestamp from which waitDays accumulate.
 */
export async function queueSequenceSteps(campaignId: string, seq: CampaignSequence, offsetFrom = new Date()): Promise<void> {
  if (!isMultiStep(seq)) return;
  const sb = createSupabaseAdmin();
  if (!sb) return;
  let cursor = offsetFrom.getTime();
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < seq.steps.length; i++) {
    cursor += Math.max(0, seq.steps[i].waitDays) * 86400_000;
    rows.push({
      campaign_id: campaignId,
      step_index: i,
      run_after: new Date(cursor).toISOString(),
      payload: seq.steps[i] as unknown as Record<string, unknown>,
    });
  }
  if (rows.length === 0) return;
  await sb.from('dashboard_mkt_scheduled_steps').insert(rows);
}

export interface DueStep {
  id: string;
  campaignId: string;
  stepIndex: number;
  payload: SequenceStep;
}

export async function getDueSteps(now = new Date(), limit = 25): Promise<DueStep[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_mkt_scheduled_steps')
    .select('id, campaign_id, step_index, payload')
    .eq('status', 'pending')
    .lte('run_after', now.toISOString())
    .order('run_after', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[sequences.getDueSteps]', error);
    return [];
  }
  return ((data ?? []) as Array<{ id: string; campaign_id: string; step_index: number; payload: SequenceStep }>).map((r) => ({
    id: r.id, campaignId: r.campaign_id, stepIndex: r.step_index, payload: r.payload,
  }));
}

export async function markStepStatus(id: string, status: 'running' | 'sent' | 'skipped' | 'failed'): Promise<void> {
  const sb = createSupabaseAdmin();
  if (!sb) return;
  await sb.from('dashboard_mkt_scheduled_steps').update({
    status,
    ran_at: status === 'sent' || status === 'failed' ? new Date().toISOString() : null,
  }).eq('id', id);
}
