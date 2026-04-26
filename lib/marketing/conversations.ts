/**
 * Conversations repository — replies that came back to a marketing
 * send. Postmark inbound webhook drops a row per inbound email; the
 * UI on /email/conversations renders the unread/read/archived inbox
 * and lets the operator mark threads + jump to the originating
 * contact / campaign.
 *
 * Linkage strategy at ingest time:
 *   1. If the In-Reply-To header matches a Postmark MessageID we
 *      stamped on a campaign_recipient row, we link both
 *      campaign_id + contact_id directly.
 *   2. Otherwise we look up the contact by from_email — every
 *      manual contact + prospect is mirrored into mkt_contacts so
 *      this works for nearly every reply.
 *   3. Unattributed replies still land — campaign_id + contact_id
 *      stay null and the inbox shows them in an "Unmatched" bucket.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export type ConversationStatus = 'unread' | 'read' | 'replied' | 'archived' | 'spam';

export interface Conversation {
  id: string;
  campaignId: string | null;
  contactId: string | null;
  recipientId: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmail: string | null;
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  strippedText: string | null;
  receivedAt: string;
  status: ConversationStatus;
  readAt: string | null;
  repliedAt: string | null;
  archivedAt: string | null;
}

interface Row {
  id: string;
  campaign_id: string | null;
  contact_id: string | null;
  recipient_id: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  from_email: string;
  from_name: string | null;
  to_email: string | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  stripped_text: string | null;
  received_at: string;
  status: ConversationStatus;
  read_at: string | null;
  replied_at: string | null;
  archived_at: string | null;
}

function rowToConversation(r: Row): Conversation {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    contactId: r.contact_id,
    recipientId: r.recipient_id,
    messageId: r.message_id,
    inReplyTo: r.in_reply_to,
    fromEmail: r.from_email,
    fromName: r.from_name,
    toEmail: r.to_email,
    subject: r.subject,
    textBody: r.text_body,
    htmlBody: r.html_body,
    strippedText: r.stripped_text,
    receivedAt: r.received_at,
    status: r.status,
    readAt: r.read_at,
    repliedAt: r.replied_at,
    archivedAt: r.archived_at,
  };
}

export interface ConversationListFilter {
  status?: ConversationStatus;
  campaignId?: string;
  contactId?: string;
  search?: string;
  limit?: number;
}

export async function listConversations(
  filter: ConversationListFilter = {},
): Promise<Conversation[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  let q = sb
    .from('dashboard_mkt_conversations')
    .select('*')
    .order('received_at', { ascending: false })
    .limit(Math.min(filter.limit ?? 200, 500));
  if (filter.status)     q = q.eq('status', filter.status);
  if (filter.campaignId) q = q.eq('campaign_id', filter.campaignId);
  if (filter.contactId)  q = q.eq('contact_id', filter.contactId);
  if (filter.search) {
    const s = filter.search.trim();
    if (s) q = q.or(`from_email.ilike.%${s}%,subject.ilike.%${s}%,from_name.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) {
    console.error('[mkt.conversations.list]', error);
    return [];
  }
  return (data as Row[]).map(rowToConversation);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_conversations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToConversation(data as Row);
}

export async function setConversationStatus(
  id: string,
  status: ConversationStatus,
): Promise<Conversation | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === 'read'     && true) patch.read_at = now;
  if (status === 'replied'  && true) patch.replied_at = now;
  if (status === 'archived' && true) patch.archived_at = now;
  const { data, error } = await sb
    .from('dashboard_mkt_conversations')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.conversations.setStatus]', error);
    return null;
  }
  return rowToConversation(data as Row);
}

/**
 * Ingest a Postmark inbound webhook payload. Idempotent on
 * (message_id) — Postmark can re-fire the same inbound during a
 * retry window.
 */
export async function ingestInbound(payload: {
  MessageID?: string;
  Headers?: Array<{ Name: string; Value: string }>;
  From?: string;
  FromName?: string;
  FromFull?: { Email?: string; Name?: string };
  To?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  Date?: string;
}): Promise<Conversation | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const messageId = payload.MessageID ?? null;
  // Pull In-Reply-To from the headers array Postmark gives us.
  const inReplyTo = payload.Headers?.find(
    (h) => h.Name?.toLowerCase() === 'in-reply-to',
  )?.Value ?? null;
  const fromEmail = (payload.FromFull?.Email ?? payload.From ?? '').trim().toLowerCase();
  const fromName  = payload.FromFull?.Name ?? payload.FromName ?? null;
  if (!fromEmail) return null;
  // Idempotency.
  if (messageId) {
    const { data: existing } = await sb
      .from('dashboard_mkt_conversations')
      .select('*')
      .eq('message_id', messageId)
      .maybeSingle();
    if (existing) return rowToConversation(existing as Row);
  }
  // Try to attribute via In-Reply-To matching a recipient row.
  let campaignId: string | null = null;
  let contactId: string | null = null;
  let recipientId: string | null = null;
  if (inReplyTo) {
    const { data: rec } = await sb
      .from('dashboard_mkt_campaign_recipients')
      .select('id, campaign_id, contact_id')
      .eq('message_id', inReplyTo)
      .maybeSingle();
    if (rec) {
      const r = rec as { id: string; campaign_id: string; contact_id: string };
      recipientId = r.id;
      campaignId  = r.campaign_id;
      contactId   = r.contact_id;
    }
  }
  // Fallback: lookup contact by from_email.
  if (!contactId) {
    const { data: c } = await sb
      .from('dashboard_mkt_contacts')
      .select('id')
      .ilike('email', fromEmail)
      .maybeSingle();
    if (c) contactId = (c as { id: string }).id;
  }
  const insertRow: Record<string, unknown> = {
    campaign_id:    campaignId,
    contact_id:     contactId,
    recipient_id:   recipientId,
    message_id:     messageId,
    in_reply_to:    inReplyTo,
    from_email:     fromEmail,
    from_name:      fromName,
    to_email:       payload.To ?? null,
    subject:        payload.Subject ?? null,
    text_body:      payload.TextBody ?? null,
    html_body:      payload.HtmlBody ?? null,
    stripped_text:  payload.StrippedTextReply ?? null,
    received_at:    payload.Date ? new Date(payload.Date).toISOString() : new Date().toISOString(),
    status:         'unread',
  };
  const { data, error } = await sb
    .from('dashboard_mkt_conversations')
    .insert(insertRow)
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.conversations.ingest]', error);
    return null;
  }
  // Mirror the reply onto the lead activity timeline so the contacts
  // explorer right pane shows it inline with sends / opens / clicks.
  if (contactId) {
    const { appendLeadActivity } = await import('./leads-as-contacts');
    await appendLeadActivity(contactId, {
      type: 'campaign_replied',
      summary: `Replied: ${(payload.Subject ?? '(no subject)').slice(0, 80)}`,
      meta: { messageId, fromEmail, campaignId },
    });
  }
  return rowToConversation(data as Row);
}

/** Inbox counts for the page header / sidebar badges. */
export async function getInboxCounts(): Promise<Record<ConversationStatus | 'total', number>> {
  const sb = createSupabaseAdmin();
  const empty = { unread: 0, read: 0, replied: 0, archived: 0, spam: 0, total: 0 } as Record<ConversationStatus | 'total', number>;
  if (!sb) return empty;
  const { data, error } = await sb
    .from('dashboard_mkt_conversations')
    .select('status');
  if (error || !data) return empty;
  const out = { ...empty };
  for (const r of data as { status: ConversationStatus }[]) {
    out[r.status] = (out[r.status] ?? 0) + 1;
    out.total += 1;
  }
  return out;
}
