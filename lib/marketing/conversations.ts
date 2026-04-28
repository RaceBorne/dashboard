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
export type ConversationDirection = 'inbound' | 'outbound';

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
  /** 'inbound' = arrived via Postmark webhook. 'outbound' = we sent
   *  it (a reply to an inbound, persisted so the thread shows the
   *  full back-and-forth). Defaults inbound for legacy rows. */
  direction: ConversationDirection;
  /** Stable grouping key — lower(counterpartyEmail) + '|' +
   *  normalisedSubject (re/fwd stripped). Computed on read if the
   *  underlying row's column is null, so the UI never has to think
   *  about backfill state. */
  threadKey: string;
}

/** A back-and-forth thread of messages, both directions, sorted
 *  oldest-first. Computed by groupThreads() from a flat list. */
export interface ConversationThread {
  threadKey: string;
  /** The other party — the one Evari is talking TO. Pulled from the
   *  most-recent message that has it (inbound: from; outbound: to). */
  counterpartyEmail: string;
  counterpartyName: string | null;
  subject: string | null;
  /** Status of the most-recent inbound message in the thread (the one
   *  the operator is acting on). */
  status: ConversationStatus;
  /** True if any inbound message in the thread is still unread. */
  unread: boolean;
  /** Timestamp of the most-recent message in either direction. */
  lastMessageAt: string;
  /** Snippet of the most-recent message body. */
  preview: string;
  /** Every message in the thread, oldest -> newest. */
  messages: Conversation[];
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
  direction: ConversationDirection | null;
  thread_key: string | null;
}

/**
 * Compute the thread key for a message. Thread key is
 *   lower(counterpartyEmail) + '|' + normalisedSubject
 * where normalisedSubject strips leading 'Re:' / 'Fwd:' so reply
 * chains group with their original. Used on both read (fallback if
 * the column is null on legacy rows) and write (every new row gets
 * one stamped at insert time).
 */
export function computeThreadKey(counterpartyEmail: string | null | undefined, subject: string | null | undefined): string {
  const email = (counterpartyEmail ?? '').trim().toLowerCase();
  const subj  = (subject ?? '').trim().toLowerCase().replace(/^(re|fwd?):\s*/i, '');
  return `${email}|${subj}`;
}

function rowToConversation(r: Row): Conversation {
  const direction: ConversationDirection = r.direction ?? 'inbound';
  // Counterparty = the OTHER side of the conversation. For inbound
  // messages that's from_email; for outbound that's to_email.
  const counterparty = direction === 'outbound' ? r.to_email : r.from_email;
  const threadKey = r.thread_key ?? computeThreadKey(counterparty, r.subject);
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
    direction,
    threadKey,
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
    direction:      'inbound',
    thread_key:     computeThreadKey(fromEmail, payload.Subject ?? null),
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

/**
 * Group a flat list of Conversation rows into ConversationThread
 * structures. Threads are sorted most-recent first (so the inbox
 * surfaces active threads at the top); messages within each thread
 * are sorted oldest-first (so the detail panel reads naturally
 * top-to-bottom).
 */
export function groupThreads(rows: Conversation[]): ConversationThread[] {
  const map = new Map<string, Conversation[]>();
  for (const r of rows) {
    const arr = map.get(r.threadKey) ?? [];
    arr.push(r);
    map.set(r.threadKey, arr);
  }
  const out: ConversationThread[] = [];
  for (const [key, arr] of map.entries()) {
    const sorted = [...arr].sort((a, b) => +new Date(a.receivedAt) - +new Date(b.receivedAt));
    const last = sorted[sorted.length - 1]!;
    // Most-recent inbound carries the status the operator acts on.
    const lastInbound = [...sorted].reverse().find((m) => m.direction === 'inbound');
    const status = lastInbound?.status ?? last.status;
    const unread = sorted.some((m) => m.direction === 'inbound' && m.status === 'unread');
    // Counterparty: pick from any message that has it. Prefer the
    // most-recent inbound (their email + display name).
    const cp = lastInbound ?? sorted.find((m) => m.direction === 'inbound') ?? last;
    const counterpartyEmail = cp.direction === 'outbound' ? (cp.toEmail ?? '') : cp.fromEmail;
    const counterpartyName  = cp.direction === 'outbound' ? null : cp.fromName;
    const previewSrc = last.strippedText || last.textBody || (last.htmlBody ? last.htmlBody.replace(/<[^>]+>/g, ' ') : '') || '';
    out.push({
      threadKey: key,
      counterpartyEmail,
      counterpartyName,
      subject: cp.subject,
      status,
      unread,
      lastMessageAt: last.receivedAt,
      preview: previewSrc.replace(/\s+/g, ' ').slice(0, 160),
      messages: sorted,
    });
  }
  out.sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));
  return out;
}

/**
 * Persist an outbound reply that we just sent via the email provider.
 * Inserts a sibling row with the same thread_key as the inbound
 * we're replying to, so groupThreads() will surface it inline.
 */
export async function recordOutboundReply(input: {
  inReplyTo: Conversation;
  toEmail: string;
  fromEmail: string;
  fromName?: string | null;
  subject: string;
  htmlBody: string;
  textBody?: string | null;
  messageId?: string | null;
}): Promise<Conversation | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const now = new Date().toISOString();
  const insertRow: Record<string, unknown> = {
    campaign_id:    input.inReplyTo.campaignId,
    contact_id:     input.inReplyTo.contactId,
    recipient_id:   input.inReplyTo.recipientId,
    message_id:     input.messageId ?? null,
    in_reply_to:    input.inReplyTo.messageId,
    from_email:     input.fromEmail.toLowerCase(),
    from_name:      input.fromName ?? null,
    to_email:       input.toEmail.toLowerCase(),
    subject:        input.subject,
    text_body:      input.textBody ?? null,
    html_body:      input.htmlBody,
    stripped_text:  input.textBody ?? null,
    received_at:    now,
    status:         'replied',
    direction:      'outbound',
    thread_key:     input.inReplyTo.threadKey,
  };
  const { data, error } = await sb
    .from('dashboard_mkt_conversations')
    .insert(insertRow)
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.conversations.recordOutbound]', error);
    return null;
  }
  return rowToConversation(data as Row);
}
