/**
 * Campaigns repository + send orchestration.
 *
 * A campaign is a one-off broadcast email. It targets either a
 * Segment (rule-based, evaluated at send time) OR a Group (static
 * list). The send-now flow:
 *
 *   1. Resolve recipient contact_ids from segment / group.
 *   2. Insert one queued row per recipient into
 *      dashboard_mkt_campaign_recipients (idempotent on
 *      (campaign_id, contact_id) — re-sending a campaign skips
 *      contacts already attempted unless explicitly retried).
 *   3. Mark campaign status = 'sending'.
 *   4. Loop: fetch contact email, check suppression, call
 *      sendOne(), stamp the recipient row + create a 'campaign_sent'
 *      event for the contact (so flows / segments can react).
 *   5. Mark campaign status = 'sent' (or 'failed' if every send
 *      returned ok:false).
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { evaluateSegment } from './segments';
import { sendOne } from './sender';
import { isSuppressed, unsubscribeUrlFor } from './suppressions';
import { trackEvent } from './events';
import { appendLeadActivity } from './leads-as-contacts';
import { renderEmailDesign } from './email-design';
import { getBrand } from './brand';
import type {
  Campaign,
  CampaignStatus,
  RecipientStatus,
  SendResult,
} from './types';

interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  content: string;
  status: CampaignStatus;
  segment_id: string | null;
  group_id: string | null;
  recipient_emails: string[] | null;
  email_design: import('./types').EmailDesign | null;
  scheduled_for: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    content: row.content,
    status: row.status,
    segmentId: row.segment_id,
    groupId: row.group_id,
    recipientEmails: row.recipient_emails,
    emailDesign: row.email_design,
    scheduledFor: row.scheduled_for,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────

export async function listCampaigns(): Promise<Campaign[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_mkt_campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[marketing.listCampaigns]', error);
    return [];
  }
  return (data ?? []).map(rowToCampaign);
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[marketing.getCampaign]', error);
    return null;
  }
  return data ? rowToCampaign(data) : null;
}

export async function createCampaign(input: {
  name: string;
  subject: string;
  content: string;
  segmentId?: string | null;
  groupId?: string | null;
  recipientEmails?: string[] | null;
  emailDesign?: import('./types').EmailDesign | null;
}): Promise<Campaign | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_campaigns')
    .insert({
      name: input.name.trim(),
      subject: input.subject.trim(),
      content: input.content,
      segment_id: input.segmentId ?? null,
      group_id: input.groupId ?? null,
      recipient_emails: input.recipientEmails && input.recipientEmails.length > 0 ? input.recipientEmails : null,
      email_design: input.emailDesign ?? null,
    })
    .select('*')
    .single();
  if (error) {
    console.error('[marketing.createCampaign]', error);
    return null;
  }
  return rowToCampaign(data);
}

export async function updateCampaign(
  id: string,
  patch: Partial<{
    name: string;
    subject: string;
    content: string;
    segmentId: string | null;
    groupId: string | null;
    recipientEmails: string[] | null;
    status: CampaignStatus;
    scheduledFor: string | null;
  }>,
): Promise<Campaign | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const dbPatch: Record<string, unknown> = {};
  if ('recipientEmails' in patch) dbPatch.recipient_emails = patch.recipientEmails && patch.recipientEmails.length > 0 ? patch.recipientEmails : null;
  if ('name' in patch && patch.name) dbPatch.name = patch.name.trim();
  if ('subject' in patch && patch.subject !== undefined) dbPatch.subject = patch.subject;
  if ('content' in patch && patch.content !== undefined) dbPatch.content = patch.content;
  if ('segmentId' in patch) dbPatch.segment_id = patch.segmentId;
  if ('groupId' in patch) dbPatch.group_id = patch.groupId;
  if ('status' in patch && patch.status) dbPatch.status = patch.status;
  if ('scheduledFor' in patch) dbPatch.scheduled_for = patch.scheduledFor;
  if (Object.keys(dbPatch).length === 0) return getCampaign(id);
  const { data, error } = await sb
    .from('dashboard_mkt_campaigns')
    .update(dbPatch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[marketing.updateCampaign]', error);
    return null;
  }
  return rowToCampaign(data);
}

export async function deleteCampaign(id: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  if (!sb) return false;
  const { error } = await sb
    .from('dashboard_mkt_campaigns')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('[marketing.deleteCampaign]', error);
    return false;
  }
  return true;
}

// ─── Recipient stats (for list page badges) ──────────────────────

export interface CampaignStats {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
}

export async function getCampaignStats(campaignId: string): Promise<CampaignStats> {
  const sb = createSupabaseAdmin();
  const empty: CampaignStats = { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 };
  if (!sb) return empty;
  const { data, error } = await sb
    .from('dashboard_mkt_campaign_recipients')
    .select('status')
    .eq('campaign_id', campaignId);
  if (error) {
    console.error('[marketing.getCampaignStats]', error);
    return empty;
  }
  const stats = { ...empty };
  for (const row of (data ?? []) as Array<{ status: RecipientStatus }>) {
    stats.total += 1;
    if (['sent', 'delivered', 'opened', 'clicked'].includes(row.status)) stats.sent += 1;
    if (['delivered', 'opened', 'clicked'].includes(row.status)) stats.delivered += 1;
    if (['opened', 'clicked'].includes(row.status)) stats.opened += 1;
    if (row.status === 'clicked') stats.clicked += 1;
    if (row.status === 'bounced') stats.bounced += 1;
    if (row.status === 'failed') stats.failed += 1;
  }
  return stats;
}

// ─── Send orchestration ──────────────────────────────────────────

interface ContactForSend {
  id: string;
  email: string;
  status: string;
}

async function resolveRecipientIds(campaign: Campaign): Promise<string[]> {
  if (campaign.segmentId) {
    const ev = await evaluateSegment(campaign.segmentId);
    return ev?.contactIds ?? [];
  }
  if (campaign.groupId) {
    const sb = createSupabaseAdmin();
    if (!sb) return [];
    const { data, error } = await sb
      .from('dashboard_mkt_contact_groups')
      .select('contact_id')
      .eq('group_id', campaign.groupId);
    if (error) {
      console.error('[marketing.resolveRecipientIds group]', error);
      return [];
    }
    return (data ?? []).map((r) => (r as { contact_id: string }).contact_id);
  }
  // Custom recipient list — emails passed in directly (typically from the
  // contacts bulk-action 'Send campaign' flow). Resolve to contact ids by
  // looking up dashboard_mkt_contacts on lower(email).
  if (campaign.recipientEmails && campaign.recipientEmails.length > 0) {
    const sb = createSupabaseAdmin();
    if (!sb) return [];
    const lowered = campaign.recipientEmails.map((e) => e.toLowerCase());
    const { data, error } = await sb
      .from('dashboard_mkt_contacts')
      .select('id, email')
      .in('email', lowered);
    if (error) {
      console.error('[marketing.resolveRecipientIds custom]', error);
      return [];
    }
    return (data ?? []).map((r) => (r as { id: string }).id);
  }
  return [];
}

async function loadContactsByIds(ids: string[]): Promise<ContactForSend[]> {
  if (ids.length === 0) return [];
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_mkt_contacts')
    .select('id, email, status')
    .in('id', ids);
  if (error) {
    console.error('[marketing.loadContactsByIds]', error);
    return [];
  }
  return (data ?? []) as ContactForSend[];
}

// Suppression check delegates to lib/marketing/suppressions.ts so
// every send path (campaigns + flows + ad-hoc) uses identical logic.

/**
 * Run the send pipeline for a campaign. Idempotent: if some
 * recipients already have a row in dashboard_mkt_campaign_recipients
 * (e.g. a previous partial run), they're skipped.
 */
export async function sendCampaign(id: string): Promise<SendResult> {
  const sb = createSupabaseAdmin();
  if (!sb) return { ok: false, attempted: 0, sent: 0, suppressed: 0, failed: 0, error: 'Supabase unavailable' };
  const campaign = await getCampaign(id);
  if (!campaign) return { ok: false, attempted: 0, sent: 0, suppressed: 0, failed: 0, error: 'Campaign not found' };
  if (campaign.status === 'sent') {
    return { ok: false, attempted: 0, sent: 0, suppressed: 0, failed: 0, error: 'Already sent' };
  }
  const hasAudience =
    Boolean(campaign.segmentId) ||
    Boolean(campaign.groupId) ||
    Boolean(campaign.recipientEmails && campaign.recipientEmails.length > 0);
  if (!hasAudience) {
    return { ok: false, attempted: 0, sent: 0, suppressed: 0, failed: 0, error: 'No segment, group or recipient list selected' };
  }

  await updateCampaign(id, { status: 'sending' });

  // Resolve the body once. Phase 14: when the campaign has an
  // emailDesign, render it through the visual builder and use the
  // result; legacy `content` is the fallback.
  // Sender appends the brand footer on its own; tell renderEmailDesign
  // to skip the inline footer so it isn't included twice.
  const renderedHtml = campaign.emailDesign
    ? renderEmailDesign(campaign.emailDesign, await getBrand(), { includeFooter: false })
    : campaign.content;

  const recipientIds = await resolveRecipientIds(campaign);
  const contacts = await loadContactsByIds(recipientIds);

  // Filter out non-active contacts up front — we never send to
  // unsubscribed/suppressed users regardless of segment results.
  const sendable = contacts.filter((c) => c.status === 'active');

  let attempted = 0;
  let sent = 0;
  let suppressedCount = 0;
  let failed = 0;

  for (const contact of sendable) {
    attempted += 1;

    // Already-attempted check (idempotency on retries)
    const { data: existing } = await sb
      .from('dashboard_mkt_campaign_recipients')
      .select('id, status')
      .eq('campaign_id', id)
      .eq('contact_id', contact.id)
      .maybeSingle();

    let recipientId: string;

    if (existing) {
      // Skip rows that are already in a terminal state. Re-attempt
      // 'queued' or 'failed' rows.
      if (['sent', 'delivered', 'opened', 'clicked'].includes((existing as { status: string }).status)) {
        sent += 1;
        continue;
      }
      recipientId = (existing as { id: string }).id;
    } else {
      const { data: inserted, error: insertErr } = await sb
        .from('dashboard_mkt_campaign_recipients')
        .insert({ campaign_id: id, contact_id: contact.id, status: 'queued' as RecipientStatus })
        .select('id')
        .single();
      if (insertErr || !inserted) {
        console.error('[marketing.sendCampaign insert]', insertErr);
        failed += 1;
        continue;
      }
      recipientId = (inserted as { id: string }).id;
    }

    // Suppression gate
    if (await isSuppressed(contact.email)) {
      suppressedCount += 1;
      await sb
        .from('dashboard_mkt_campaign_recipients')
        .update({ status: 'suppressed' as RecipientStatus, error: 'In suppression list' })
        .eq('id', recipientId);
      continue;
    }

    // Hand off to the sender abstraction
    const res = await sendOne({
      to: contact.email,
      subject: campaign.subject,
      html: renderedHtml,
      context: campaign.name,
      unsubscribeUrl: unsubscribeUrlFor(contact.email),
    });

    const nowIso = new Date().toISOString();
    if (res.ok) {
      sent += 1;
      await sb
        .from('dashboard_mkt_campaign_recipients')
        .update({
          status: 'sent' as RecipientStatus,
          message_id: res.messageId ?? null,
          sent_at: nowIso,
          error: null,
        })
        .eq('id', recipientId);
      // Log a campaign_sent event so flows / segments can react
      await trackEvent({
        contactId: contact.id,
        type: 'campaign_sent',
        metadata: {
          campaignId: id,
          campaignName: campaign.name,
          messageId: res.messageId,
        },
      });
      // Mirror to the lead activity timeline so the contacts explorer
      // right pane shows campaign sends inline with prospecting events.
      await appendLeadActivity(contact.id, {
        type: 'campaign_sent',
        summary: `Sent campaign · ${campaign.name || 'Untitled'}`,
        meta: { campaignId: id, messageId: res.messageId },
      });
    } else {
      failed += 1;
      await sb
        .from('dashboard_mkt_campaign_recipients')
        .update({
          status: 'failed' as RecipientStatus,
          error: res.error ?? 'send failed',
        })
        .eq('id', recipientId);
    }
  }

  // Final campaign status
  const finalStatus: CampaignStatus = sent === 0 && (failed > 0 || suppressedCount > 0)
    ? 'failed'
    : 'sent';
  await sb
    .from('dashboard_mkt_campaigns')
    .update({ status: finalStatus, sent_at: new Date().toISOString() })
    .eq('id', id);

  return {
    ok: sent > 0,
    attempted,
    sent,
    suppressed: suppressedCount,
    failed,
  };
}
