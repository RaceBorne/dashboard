/**
 * Holding pen for campaign sends.
 *
 * The pre-flight review modal lets the operator either approve or hold
 * each recipient before send. Approved recipients fire immediately.
 * Held ones land in `dashboard_mkt_held_recipients`, where they can
 * be inspected, fixed, and either sent later (via send-held) or
 * discarded.
 *
 * Read path joins to `dashboard_mkt_contacts` so the report tab can
 * render name + email + reason + flagged_by without a second round
 * trip per row.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export type HeldSource = 'human' | 'ai' | 'both';

export interface HeldFlag {
  severity: 'info' | 'warn' | 'error';
  kind: string;
  message: string;
}

export interface HeldRecipient {
  id: string;
  campaignId: string;
  contactId: string;
  reason: string | null;
  source: HeldSource;
  aiFlags: HeldFlag[] | null;
  heldAt: string;
  /** Joined from contact, present when listed via listHeldForCampaign. */
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
}

export interface HoldInput {
  contactId: string;
  reason?: string | null;
  source?: HeldSource;
  aiFlags?: HeldFlag[] | null;
}

interface HeldRow {
  id: string;
  campaign_id: string;
  contact_id: string;
  reason: string | null;
  source: HeldSource;
  ai_flags: HeldFlag[] | null;
  held_at: string;
}

interface JoinedContact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

interface JoinedHeldRow extends HeldRow {
  // Supabase returns the joined relation as an array; we only ever expect one.
  contact?: JoinedContact | JoinedContact[] | null;
}

function rowToHeld(row: HeldRow): HeldRecipient {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    contactId: row.contact_id,
    reason: row.reason,
    source: row.source,
    aiFlags: row.ai_flags,
    heldAt: row.held_at,
  };
}

export async function listHeldForCampaign(campaignId: string): Promise<HeldRecipient[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_mkt_held_recipients')
    .select('id, campaign_id, contact_id, reason, source, ai_flags, held_at, contact:dashboard_mkt_contacts!inner(id, email, first_name, last_name, company)')
    .eq('campaign_id', campaignId)
    .order('held_at', { ascending: false });
  if (error) {
    console.error('[mkt.held.list]', error);
    return [];
  }
  return ((data ?? []) as unknown as JoinedHeldRow[]).map((r) => {
    const c = Array.isArray(r.contact) ? r.contact[0] : r.contact;
    return {
      ...rowToHeld(r),
      email: c?.email,
      firstName: c?.first_name ?? null,
      lastName: c?.last_name ?? null,
      company: c?.company ?? null,
    };
  });
}

export async function holdRecipients(campaignId: string, items: HoldInput[]): Promise<HeldRecipient[]> {
  if (!items.length) return [];
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const rows = items.map((it) => ({
    campaign_id: campaignId,
    contact_id: it.contactId,
    reason: it.reason ?? null,
    source: it.source ?? 'human',
    ai_flags: it.aiFlags ?? null,
  }));
  const { data, error } = await sb
    .from('dashboard_mkt_held_recipients')
    .upsert(rows, { onConflict: 'campaign_id,contact_id' })
    .select('id, campaign_id, contact_id, reason, source, ai_flags, held_at');
  if (error) {
    console.error('[mkt.held.upsert]', error);
    return [];
  }
  return ((data ?? []) as HeldRow[]).map(rowToHeld);
}

export async function removeHeld(campaignId: string, contactIds: string[]): Promise<number> {
  if (!contactIds.length) return 0;
  const sb = createSupabaseAdmin();
  if (!sb) return 0;
  const { error, count } = await sb
    .from('dashboard_mkt_held_recipients')
    .delete({ count: 'exact' })
    .eq('campaign_id', campaignId)
    .in('contact_id', contactIds);
  if (error) {
    console.error('[mkt.held.remove]', error);
    return 0;
  }
  return count ?? 0;
}

export async function clearHeld(campaignId: string): Promise<number> {
  const sb = createSupabaseAdmin();
  if (!sb) return 0;
  const { error, count } = await sb
    .from('dashboard_mkt_held_recipients')
    .delete({ count: 'exact' })
    .eq('campaign_id', campaignId);
  if (error) {
    console.error('[mkt.held.clear]', error);
    return 0;
  }
  return count ?? 0;
}

export async function countHeldForCampaign(campaignId: string): Promise<number> {
  const sb = createSupabaseAdmin();
  if (!sb) return 0;
  const { count, error } = await sb
    .from('dashboard_mkt_held_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId);
  if (error) return 0;
  return count ?? 0;
}
