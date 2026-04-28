/**
 * Per-idea strategy brief.
 *
 * One row per play in dashboard_strategy_briefs. The Strategy page
 * walks the operator down a vertical step list (Brief → Target profile
 * → Ideal customer → Channels → Messaging → Success metrics → Handoff)
 * and writes back here on every change. Hand off to Discovery copies
 * the relevant axes into the Discovery search criteria.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export interface StrategyBrief {
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
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  play_id: string;
  campaign_name: string | null;
  objective: string | null;
  target_audience: string[] | null;
  geography: string | null;
  industries: string[] | null;
  company_size_min: number | null;
  company_size_max: number | null;
  revenue_min: string | null;
  revenue_max: string | null;
  channels: string[] | null;
  messaging: { angle: string; line?: string }[] | null;
  success_metrics: { name: string; target?: string }[] | null;
  ideal_customer: string | null;
  handoff_status: 'draft' | 'ready' | 'handed_off';
  created_at: string;
  updated_at: string;
}

function rowToBrief(r: Row): StrategyBrief {
  return {
    id: r.id,
    playId: r.play_id,
    campaignName: r.campaign_name,
    objective: r.objective,
    targetAudience: r.target_audience ?? [],
    geography: r.geography,
    industries: r.industries ?? [],
    companySizeMin: r.company_size_min,
    companySizeMax: r.company_size_max,
    revenueMin: r.revenue_min,
    revenueMax: r.revenue_max,
    channels: r.channels ?? [],
    messaging: r.messaging,
    successMetrics: r.success_metrics,
    idealCustomer: r.ideal_customer,
    handoffStatus: r.handoff_status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getOrCreateBrief(playId: string): Promise<StrategyBrief | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data: existing } = await sb
    .from('dashboard_strategy_briefs')
    .select('*')
    .eq('play_id', playId)
    .maybeSingle();
  if (existing) return rowToBrief(existing as Row);
  const { data, error } = await sb
    .from('dashboard_strategy_briefs')
    .insert({ play_id: playId })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[strategy.getOrCreate]', error);
    return null;
  }
  return rowToBrief(data as Row);
}

export async function updateBrief(playId: string, patch: Partial<StrategyBrief>): Promise<StrategyBrief | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('campaignName' in patch) dbPatch.campaign_name = patch.campaignName;
  if ('objective' in patch) dbPatch.objective = patch.objective;
  if ('targetAudience' in patch) dbPatch.target_audience = patch.targetAudience;
  if ('geography' in patch) dbPatch.geography = patch.geography;
  if ('industries' in patch) dbPatch.industries = patch.industries;
  if ('companySizeMin' in patch) dbPatch.company_size_min = patch.companySizeMin;
  if ('companySizeMax' in patch) dbPatch.company_size_max = patch.companySizeMax;
  if ('revenueMin' in patch) dbPatch.revenue_min = patch.revenueMin;
  if ('revenueMax' in patch) dbPatch.revenue_max = patch.revenueMax;
  if ('channels' in patch) dbPatch.channels = patch.channels;
  if ('messaging' in patch) dbPatch.messaging = patch.messaging;
  if ('successMetrics' in patch) dbPatch.success_metrics = patch.successMetrics;
  if ('idealCustomer' in patch) dbPatch.ideal_customer = patch.idealCustomer;
  if ('handoffStatus' in patch) dbPatch.handoff_status = patch.handoffStatus;
  const { data, error } = await sb
    .from('dashboard_strategy_briefs')
    .upsert({ play_id: playId, ...dbPatch }, { onConflict: 'play_id' })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[strategy.update]', error);
    return null;
  }
  return rowToBrief(data as Row);
}
