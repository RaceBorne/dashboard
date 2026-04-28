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
import { findFrequencyCapBreaches } from './settings';
import { isMultiStep, queueSequenceSteps, type CampaignSequence } from './sequences';
import { renderEmailDesign } from './email-design';
import { getBrand } from './brand';

/**
 * Per-recipient merge substitution. Replaces standard placeholders
 * with the contact's actual fields so the recipient sees their own
 * name / company instead of literal {{firstName}}. Anything missing
 * falls back to a sensible default ('there' for firstName,
 * empty string elsewhere) so emails never ship with the raw token
 * leaking through.
 */
export function applyMerge(html: string, contact: { firstName?: string | null; lastName?: string | null; email?: string | null; company?: string | null }): string {
  const first = (contact.firstName ?? '').trim();
  const last  = (contact.lastName  ?? '').trim();
  const full  = [first, last].filter(Boolean).join(' ');
  return html
    .replace(/\{\{\s*firstName\s*\}\}/g, first || 'there')
    .replace(/\{\{\s*lastName\s*\}\}/g,  last  || '')
    .replace(/\{\{\s*name\s*\}\}/g,      full  || 'there')
    .replace(/\{\{\s*email\s*\}\}/g,     contact.email   ?? '')
    .replace(/\{\{\s*company\s*\}\}/g,   contact.company ?? '');
}
import type {
  Campaign,
  CampaignKind,
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
  kind: CampaignKind | null;
  segment_id: string | null;
  group_id: string | null;
  group_ids: string[] | null;
  subject_variants: string[] | null;
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
    groupIds: row.group_ids,
    subjectVariants: row.subject_variants,
    recipientEmails: row.recipient_emails,
    kind: (row.kind ?? 'newsletter') as CampaignKind,
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
  groupIds?: string[] | null;
  subjectVariants?: string[] | null;
  recipientEmails?: string[] | null;
    kind?: CampaignKind;
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
      group_ids: input.groupIds && input.groupIds.length > 0 ? input.groupIds : null,
      subject_variants: input.subjectVariants && input.subjectVariants.length > 0 ? input.subjectVariants : null,
      recipient_emails: input.recipientEmails && input.recipientEmails.length > 0 ? input.recipientEmails : null,
      kind: input.kind ?? 'newsletter',
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
    groupIds: string[] | null;
    subjectVariants: string[] | null;
    recipientEmails: string[] | null;
    status: CampaignStatus;
    scheduledFor: string | null;
  }>,
): Promise<Campaign | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const dbPatch: Record<string, unknown> = {};
  if ('recipientEmails' in patch) dbPatch.recipient_emails = patch.recipientEmails && patch.recipientEmails.length > 0 ? patch.recipientEmails : null;
  if ('kind' in patch) dbPatch.kind = patch.kind;
  if ('name' in patch && patch.name) dbPatch.name = patch.name.trim();
  if ('subject' in patch && patch.subject !== undefined) dbPatch.subject = patch.subject;
  if ('content' in patch && patch.content !== undefined) dbPatch.content = patch.content;
  if ('segmentId' in patch) dbPatch.segment_id = patch.segmentId;
  if ('groupId' in patch) dbPatch.group_id = patch.groupId;
  if ('groupIds' in patch) dbPatch.group_ids = patch.groupIds && patch.groupIds.length > 0 ? patch.groupIds : null;
  if ('subjectVariants' in patch) dbPatch.subject_variants = patch.subjectVariants && patch.subjectVariants.length > 0 ? patch.subjectVariants : null;
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
  firstName: string | null;
  lastName: string | null;
  company: string | null;
}

interface ContactRowForSend {
  id: string;
  email: string;
  status: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

async function resolveRecipientIds(campaign: Campaign): Promise<string[]> {
  if (campaign.segmentId) {
    const ev = await evaluateSegment(campaign.segmentId);
    return ev?.contactIds ?? [];
  }
  // Prefer groupIds (multi-list union) over the legacy single groupId.
  const audienceGroups: string[] = [];
  if (campaign.groupIds && campaign.groupIds.length > 0) audienceGroups.push(...campaign.groupIds);
  else if (campaign.groupId) audienceGroups.push(campaign.groupId);
  if (audienceGroups.length > 0) {
    const sb = createSupabaseAdmin();
    if (!sb) return [];
    const { data, error } = await sb
      .from('dashboard_mkt_contact_groups')
      .select('contact_id')
      .in('group_id', audienceGroups);
    if (error) {
      console.error('[marketing.resolveRecipientIds group]', error);
      return [];
    }
    // Dedupe — a contact in two selected lists shouldn't get the email twice.
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const r of (data ?? []) as Array<{ contact_id: string }>) {
      if (!seen.has(r.contact_id)) { seen.add(r.contact_id); ids.push(r.contact_id); }
    }
    return ids;
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
    .select('id, email, status, first_name, last_name, company')
    .in('id', ids);
  if (error) {
    console.error('[marketing.loadContactsByIds]', error);
    return [];
  }
  return ((data ?? []) as ContactRowForSend[]).map((r) => ({
    id: r.id,
    email: r.email,
    status: r.status,
    firstName: r.first_name,
    lastName: r.last_name,
    company: r.company,
  }));
}

// Suppression check delegates to lib/marketing/suppressions.ts so
// every send path (campaigns + flows + ad-hoc) uses identical logic.

/**
 * Run the send pipeline for a campaign. Idempotent: if some
 * recipients already have a row in dashboard_mkt_campaign_recipients
 * (e.g. a previous partial run), they're skipped.
 */
export async function sendCampaign(id: string, opts: { excludeContactIds?: string[] } = {}): Promise<SendResult> {
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
    Boolean(campaign.groupIds && campaign.groupIds.length > 0) ||
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
  // Honour the excludeContactIds list — held-by-reviewer contacts
  // are filtered out at this stage so they never get a campaign
  // recipient row, never get sent to, never count against stats.
  const excludeSet = new Set(opts.excludeContactIds ?? []);

  // Filter out non-active contacts up front — we never send to
  // unsubscribed/suppressed users regardless of segment results.
  const sendable = contacts.filter((c) => c.status === 'active');

  // Frequency cap — drop any contact who'd cross the per-window cap with
  // this send. Tracked separately from suppressed/failed so the report
  // tells the truth about why someone wasn't reached.
  const breaches = await findFrequencyCapBreaches(sendable.map((c) => c.id));
  const breachSet = new Set(breaches.map((b) => b.contactId));

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

    if (excludeSet.has(contact.id)) {
      // Held by reviewer — skip entirely. No recipient row created,
      // no count against attempted/suppressed/failed.
      continue;
    }
    if (breachSet.has(contact.id)) {
      // Frequency cap — count against suppressed so the operator sees
      // someone got dropped, but don't actually send.
      suppressedCount += 1;
      await sb
        .from('dashboard_mkt_campaign_recipients')
        .update({ status: 'suppressed', error: 'Frequency cap exceeded' })
        .eq('id', recipientId);
      continue;
    }
    // Hand off to the sender abstraction. Direct-message campaigns
    // already include the signature in the body (composed in the
    // wizard), and the signature carries the legal/confidentiality
    // notice — so we suppress the auto-appended brand footer to
    // avoid the legal block doubling up. Newsletters keep the
    // auto-footer since their visual designer doesn't include one
    // by default.
    const skipBrandFooter = campaign.kind === 'direct';
    // Substitute {{firstName}} / {{lastName}} / {{name}} / {{company}}
    // in BOTH the body and the subject before each send so each
    // recipient gets their own personalised version.
    const mergedHtml    = applyMerge(renderedHtml, contact as { firstName?: string | null; lastName?: string | null; email?: string | null; company?: string | null });
    // Subject A/B: when variants exist, deterministically pick one per contact id.
    const variants = campaign.subjectVariants && campaign.subjectVariants.length > 0 ? campaign.subjectVariants : null;
    let variantIdx: number | null = null;
    let variantSubject = campaign.subject;
    if (variants) {
      let h = 0;
      for (let i = 0; i < contact.id.length; i++) h = ((h << 5) - h) + contact.id.charCodeAt(i);
      variantIdx = Math.abs(h) % variants.length;
      variantSubject = variants[variantIdx] ?? campaign.subject;
    }
    const mergedSubject = applyMerge(variantSubject, contact as { firstName?: string | null; lastName?: string | null; email?: string | null; company?: string | null });
    const res = await sendOne({
      to: contact.email,
      subject: mergedSubject,
      html: mergedHtml,
      context: campaign.name,
      unsubscribeUrl: unsubscribeUrlFor(contact.email),
      skipBrandFooter,
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
          assigned_variant: variantIdx,
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

  // Queue subsequent sequence steps (waitDays from now). Step 0 has
  // already shipped above; this only schedules 1..N.
  const rawSeq = (campaign as { sequence?: CampaignSequence | null }).sequence;
  if (rawSeq && isMultiStep(rawSeq)) {
    await queueSequenceSteps(id, rawSeq, new Date());
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
