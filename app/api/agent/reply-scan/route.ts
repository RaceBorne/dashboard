import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  addSuppression,
  listDraftsByStatus,
  upsertDraft,
  upsertLead,
} from '@/lib/dashboard/repository';
import { getGoogleAccessToken, isGmailConnected } from '@/lib/integrations/google';
import type {
  DraftMessage,
  Lead,
  ProspectOutreach,
  ProspectStatus,
  SuppressionEntry,
} from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReplyClassification =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'unsubscribe'
  | 'auto_reply'
  | 'unknown';

/**
 * POST /api/agent/reply-scan
 *
 * For every sent draft with a gmailThreadId, pull the full thread from Gmail
 * and check for inbound replies newer than the send. For each reply:
 *   - classify intent via AI (positive / neutral / negative / unsubscribe /
 *     auto_reply)
 *   - update the matching Prospect: status + outreach entry + signals
 *   - if 'unsubscribe', add the sender to dashboard_suppressions and archive
 *     the prospect
 *
 * This endpoint is the glue that turns a one-shot outbound send into a
 * two-way conversation the dashboard can reason about. Phase 5 wraps it in a
 * Vercel cron.
 *
 * Request body (optional): { limit?: number } — cap the number of threads
 * scanned this run (default 100).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const limit = Math.min(Math.max(body.limit ?? 100, 1), 500);

  if (!isGmailConnected()) {
    return NextResponse.json(
      { ok: false, error: 'Gmail is not connected (GMAIL_USER_EMAIL missing)' },
      { status: 400 },
    );
  }
  const evariEmail = process.env.GMAIL_USER_EMAIL!.trim().toLowerCase();

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  // Candidate threads = drafts that were sent and haven't had a reply
  // classified as positive/negative/unsubscribe yet. We re-scan 'sent' drafts
  // on every run; cheap idempotency is handled by the `replyHandledAt` marker
  // on the draft payload.
  const sent = await listDraftsByStatus(supabase, 'sent');
  const queue = sent
    .filter((d) => d.gmailThreadId)
    .sort((a, b) => new Date(b.sentAt ?? 0).getTime() - new Date(a.sentAt ?? 0).getTime())
    .slice(0, limit);

  const accessToken = await getGoogleAccessToken();

  const results: Array<{
    draftId: string;
    threadId: string;
    action: 'no_reply' | 'classified' | 'error';
    classification?: ReplyClassification;
    error?: string;
  }> = [];

  for (const draft of queue) {
    try {
      const thread = await fetchGmailThreadFull({
        accessToken,
        threadId: draft.gmailThreadId!,
      });
      const latestInbound = pickLatestInbound(thread, evariEmail, draft.sentAt);
      if (!latestInbound) {
        results.push({
          draftId: draft.id,
          threadId: draft.gmailThreadId!,
          action: 'no_reply',
        });
        continue;
      }

      // Skip if we've already processed this reply (same Message-Id).
      const replyId = latestInbound.messageIdHeader || latestInbound.id;
      if (
        (draft as DraftMessageWithReply).lastReplyMessageId === replyId
      ) {
        results.push({
          draftId: draft.id,
          threadId: draft.gmailThreadId!,
          action: 'no_reply',
        });
        continue;
      }

      const classification = hasAIGatewayCredentials()
        ? await classifyReply(latestInbound.bodyText)
        : fallbackClassify(latestInbound.bodyText);

      await recordClassifiedReply({
        supabase,
        draft,
        reply: latestInbound,
        classification,
      });

      results.push({
        draftId: draft.id,
        threadId: draft.gmailThreadId!,
        action: 'classified',
        classification,
      });
    } catch (err) {
      results.push({
        draftId: draft.id,
        threadId: draft.gmailThreadId ?? '',
        action: 'error',
        error: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: queue.length,
    results,
  });
}

// ---------------------------------------------------------------------------
// Gmail thread fetch with bodies. Scoped to this route to avoid changing the
// metadata-only ingest helper used by the briefing.
// ---------------------------------------------------------------------------

interface FullGmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  snippet: string;
  bodyText: string;
  messageIdHeader: string;
  inReplyTo: string;
  references: string;
  labelIds: string[];
}

interface FullGmailThread {
  id: string;
  messages: FullGmailMessage[];
}

async function fetchGmailThreadFull(opts: {
  accessToken: string;
  threadId: string;
}): Promise<FullGmailThread> {
  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/threads/' +
      encodeURIComponent(opts.threadId) +
      '?format=full',
    {
      headers: { Authorization: 'Bearer ' + opts.accessToken },
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => '<no body>');
    throw new Error('Gmail thread fetch failed: ' + res.status + ' ' + txt.slice(0, 300));
  }
  const raw = (await res.json()) as {
    id: string;
    messages?: Array<{
      id: string;
      threadId: string;
      internalDate?: string;
      labelIds?: string[];
      snippet?: string;
      payload?: GmailPayload;
    }>;
  };

  const messages: FullGmailMessage[] = (raw.messages ?? []).map((m) => {
    const headers = m.payload?.headers ?? [];
    const h = (n: string) =>
      headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? '';
    return {
      id: m.id,
      threadId: m.threadId,
      internalDate: m.internalDate ?? '0',
      from: h('From'),
      to: h('To'),
      date: h('Date'),
      subject: h('Subject'),
      snippet: m.snippet ?? '',
      bodyText: extractPlainText(m.payload),
      messageIdHeader: h('Message-ID') || h('Message-Id'),
      inReplyTo: h('In-Reply-To'),
      references: h('References'),
      labelIds: m.labelIds ?? [],
    };
  });

  return { id: raw.id, messages };
}

interface GmailPayload {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  parts?: GmailPayload[];
  body?: { data?: string; size?: number };
}

/**
 * Walk the Gmail payload tree to find the best plain-text representation of
 * the message. Prefers text/plain; falls back to stripping text/html. Gmail
 * encodes bodies as URL-safe base64.
 */
function extractPlainText(payload: GmailPayload | undefined): string {
  if (!payload) return '';

  const plain = findPart(payload, 'text/plain');
  if (plain?.body?.data) return decodeUrlBase64(plain.body.data);

  const html = findPart(payload, 'text/html');
  if (html?.body?.data) {
    return stripHtml(decodeUrlBase64(html.body.data));
  }

  if (payload.body?.data) return decodeUrlBase64(payload.body.data);
  return '';
}

function findPart(payload: GmailPayload, mime: string): GmailPayload | undefined {
  if (payload.mimeType === mime && payload.body?.data) return payload;
  for (const part of payload.parts ?? []) {
    const hit = findPart(part, mime);
    if (hit) return hit;
  }
  return undefined;
}

function decodeUrlBase64(s: string): string {
  // Gmail uses URL-safe base64 — convert to standard then decode.
  const normal = s.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(normal, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Return the newest inbound message in the thread posted after the draft was
 * sent. "Inbound" = not labelled SENT and From header doesn't contain Craig's
 * own address. Returns undefined if no reply yet.
 */
function pickLatestInbound(
  thread: FullGmailThread,
  evariEmail: string,
  sentAt?: string,
): FullGmailMessage | undefined {
  const sentMs = sentAt ? new Date(sentAt).getTime() : 0;
  const ev = evariEmail.toLowerCase();
  const inbound = thread.messages
    .filter((m) => {
      if ((m.labelIds ?? []).includes('SENT')) return false;
      const from = m.from.toLowerCase();
      if (from.includes(ev)) return false;
      const ms = Number(m.internalDate);
      return ms > sentMs;
    })
    .sort((a, b) => Number(b.internalDate) - Number(a.internalDate));
  return inbound[0];
}

// ---------------------------------------------------------------------------
// Classification. When the AI Gateway is wired we ask a model for one word;
// without it we fall back to a simple keyword heuristic. The fallback is
// intentionally conservative — we'd rather park a reply in 'unknown' than
// mis-label it as positive.
// ---------------------------------------------------------------------------

async function classifyReply(bodyText: string): Promise<ReplyClassification> {
  const trimmed = bodyText.trim().slice(0, 1500);
  if (!trimmed) return 'unknown';
  const task =
    'Classify an inbound email reply to a cold outreach message. Return exactly one lowercase token from this set: positive | neutral | negative | unsubscribe | auto_reply. positive = open to a meeting or further discussion. negative = not interested right now but polite. unsubscribe = wants off the list / stop / remove. auto_reply = out-of-office / ticket-created bot. neutral = asks a clarifying question without committing. Return ONLY the token — no punctuation, no explanation.';
  const prompt = 'Reply text:\n---\n' + trimmed + '\n---\n\nToken:';
  try {
    const text = (await generateBriefing({ voice: 'analyst', task, prompt })).trim().toLowerCase();
    const token = text.split(/[\s.,!?]/)[0] ?? '';
    if (
      token === 'positive' ||
      token === 'neutral' ||
      token === 'negative' ||
      token === 'unsubscribe' ||
      token === 'auto_reply'
    ) {
      return token;
    }
    return 'unknown';
  } catch {
    return fallbackClassify(trimmed);
  }
}

function fallbackClassify(bodyText: string): ReplyClassification {
  const t = bodyText.toLowerCase();
  if (/\bunsubscribe\b|\bremove me\b|\btake me off\b|\bstop emailing\b|\bdo not contact\b/.test(t)) {
    return 'unsubscribe';
  }
  if (/\bout of office\b|\bautomatic reply\b|\bauto[-\s]?reply\b|\bdelivery status\b/.test(t)) {
    return 'auto_reply';
  }
  if (/\bhappy to chat\b|\binterested\b|\blet\u2019s talk\b|\bsounds good\b|\blook forward\b/.test(t)) {
    return 'positive';
  }
  if (/\bnot interested\b|\bno thanks\b|\bno thank you\b/.test(t)) {
    return 'negative';
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Persistence: update the draft with reply metadata, update/create the
// Prospect, and fire compliance actions for unsubscribe intent.
// ---------------------------------------------------------------------------

interface DraftMessageWithReply extends DraftMessage {
  lastReplyMessageId?: string;
  lastReplyAt?: string;
  lastReplyClassification?: ReplyClassification;
}

async function recordClassifiedReply(args: {
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>;
  draft: DraftMessage;
  reply: FullGmailMessage;
  classification: ReplyClassification;
}): Promise<void> {
  const { supabase, draft, reply, classification } = args;

  const replyAt = new Date(Number(reply.internalDate || Date.now())).toISOString();
  const excerpt = reply.bodyText.replace(/\s+/g, ' ').trim().slice(0, 600);

  // 1) Update the draft with reply signals (we store them as extra keys on
  //    the jsonb payload — no schema migration needed).
  const updatedDraft: DraftMessageWithReply = {
    ...draft,
    updatedAt: new Date().toISOString(),
    lastReplyMessageId: reply.messageIdHeader || reply.id,
    lastReplyAt: replyAt,
    lastReplyClassification: classification,
  };
  await upsertDraft(supabase, updatedDraft);

  // 2) Find and update the Lead row (tier='prospect', created at send time
  //    with id `prospect-<threadId>`). If it's gone we skip — reply is still
  //    recorded on the draft above.
  const prospectId = 'prospect-' + draft.gmailThreadId;
  const { data: prospectRow } = await supabase
    .from('dashboard_leads')
    .select('id, payload')
    .eq('id', prospectId)
    .maybeSingle();
  const existing = (prospectRow as { id: string; payload: Lead } | null)?.payload;

  const outreach: ProspectOutreach = {
    id: 'po-reply-' + reply.id,
    at: replyAt,
    channel: 'email',
    status: 'replied',
    replyExcerpt: excerpt,
    subject: reply.subject,
  };

  const nextStatus = statusFor(classification);

  if (existing) {
    const nextLead: Lead = {
      ...existing,
      prospectStatus: nextStatus ?? existing.prospectStatus,
      lastTouchAt: replyAt,
      outreach: [...(existing.outreach ?? []), outreach],
      prospectSignals: {
        ...(existing.prospectSignals ?? {}),
        replied: true,
        sentiment:
          classification === 'positive'
            ? 'positive'
            : classification === 'negative'
              ? 'negative'
              : 'neutral',
      },
    };
    await upsertLead(supabase, nextLead);
  }

  // 3) Compliance: unsubscribe intent auto-adds to the suppression list.
  if (classification === 'unsubscribe') {
    const entry: SuppressionEntry = {
      id: 'supp-auto-' + draft.toEmail.toLowerCase(),
      email: draft.toEmail.toLowerCase(),
      reason: 'unsubscribed',
      at: replyAt,
      notes: 'Auto-detected from reply: ' + excerpt.slice(0, 200),
    };
    await addSuppression(supabase, entry);

    if (existing) {
      await upsertLead(supabase, {
        ...existing,
        prospectStatus: 'archived',
        lastTouchAt: replyAt,
      });
    }
  }
}

function statusFor(c: ReplyClassification): ProspectStatus | undefined {
  switch (c) {
    case 'positive':
      return 'replied_positive';
    case 'neutral':
      return 'replied_neutral';
    case 'negative':
      return 'replied_negative';
    case 'unsubscribe':
      return 'archived';
    case 'auto_reply':
      return 'sent'; // ignore auto-responders — treat like no real reply
    default:
      return undefined;
  }
}
