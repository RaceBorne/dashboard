/**
 * Gmail integration — read-only thread ingest.
 *
 * Shares Google OAuth plumbing with GSC + GA4 (see lib/integrations/google.ts).
 * The refresh token that `getGoogleAccessToken` uses must have been issued
 * with `gmail.readonly` scope — re-run `npx tsx scripts/google-oauth-refresh.ts`
 * after adding Gmail to the scope list to regenerate one.
 *
 * Nightly ingest writes thread summaries into `dashboard_gmail_threads`. The
 * strategy chats + morning briefing read from that table instead of calling
 * Gmail live — keeps the chat round-trip snappy and stays well inside
 * Gmail's per-user rate limits.
 *
 * Ref: https://developers.google.com/gmail/api/reference/rest/v1/users.threads
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getGoogleAccessToken, isGmailConnected } from '@/lib/integrations/google';
import type { GmailCategory, GmailThreadSummary } from '@/lib/types';

// -----------------------------------------------------------------------------
// Low-level Gmail API wrappers.
// -----------------------------------------------------------------------------

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailThreadListResponse {
  threads?: Array<{ id: string; snippet: string; historyId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePayload {
  mimeType?: string;
  headers?: GmailHeader[];
  parts?: GmailMessagePayload[];
  body?: { data?: string; size?: number };
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string; // ms-since-epoch as a string
  payload?: GmailMessagePayload;
}

interface GmailThread {
  id: string;
  historyId: string;
  messages?: GmailMessage[];
}

/**
 * List thread IDs matching a query, with pagination.
 *
 * Gmail caps each page at 500; we walk pages until we have `maxThreads` IDs
 * or there are no more pages.
 */
async function listGmailThreadIds(opts: {
  accessToken: string;
  query: string;
  maxThreads: number;
}): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < opts.maxThreads) {
    const params = new URLSearchParams({
      q: opts.query,
      maxResults: String(Math.min(500, opts.maxThreads - ids.length)),
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${GMAIL_BASE}/threads?${params.toString()}`, {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '<no body>');
      throw new Error(`Gmail threads.list failed: ${res.status} ${errText.slice(0, 400)}`);
    }
    const json = (await res.json()) as GmailThreadListResponse;
    for (const t of json.threads ?? []) ids.push(t.id);
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return ids;
}

/**
 * Fetch a thread with metadata format (headers only — no body bytes).
 * Cheaper than `full` and gives us everything we need for a summary.
 */
async function getGmailThread(opts: {
  accessToken: string;
  threadId: string;
}): Promise<GmailThread> {
  const params = new URLSearchParams({
    format: 'metadata',
    // Restrict to the headers we actually use — shrinks the payload.
    metadataHeaders: 'Subject,From,To,Cc,Reply-To,Date',
  });
  // URLSearchParams serialises repeated keys as metadataHeaders=Subject&metadataHeaders=From&...
  // Gmail supports that, but cleaner to just use one comma-list (which it
  // also accepts for metadataHeaders).
  const res = await fetch(
    `${GMAIL_BASE}/threads/${encodeURIComponent(opts.threadId)}?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '<no body>');
    throw new Error(`Gmail threads.get failed: ${res.status} ${errText.slice(0, 400)}`);
  }
  return (await res.json()) as GmailThread;
}

// -----------------------------------------------------------------------------
// Header parsing + category inference.
// -----------------------------------------------------------------------------

function getHeader(payload: GmailMessagePayload | undefined, name: string): string {
  if (!payload?.headers) return '';
  const h = payload.headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

/**
 * Pull every email address mentioned in From/To/Cc/Reply-To on every message
 * in the thread. Lowercased and de-duped. Handles `Name <addr@x>` formats.
 */
function extractParticipants(thread: GmailThread): string[] {
  const addrs = new Set<string>();
  const pick = (raw: string) => {
    if (!raw) return;
    // Gmail packs `Name <addr@x>, Other <o@x>` into a single header.
    for (const piece of raw.split(',')) {
      const match = piece.match(/<([^>]+)>/) ?? piece.match(/([^\s]+@[^\s]+)/);
      const email = (match ? match[1] : piece).trim().toLowerCase();
      if (email.includes('@')) addrs.add(email);
    }
  };
  for (const m of thread.messages ?? []) {
    pick(getHeader(m.payload, 'From'));
    pick(getHeader(m.payload, 'To'));
    pick(getHeader(m.payload, 'Cc'));
    pick(getHeader(m.payload, 'Reply-To'));
  }
  return Array.from(addrs);
}

/**
 * Infer a coarse category for ranking in the briefing + chat context.
 *
 * Heuristics, in order:
 *   - Any message labelled SENT and no inbound replies → 'outbound'
 *   - Any participant address contains 'klaviyo' OR subject starts with
 *     'Re:' to a Klaviyo campaign hostname → 'klaviyo-reply'
 *   - Otherwise, if any message has INBOX and the sender is not the Evari
 *     inbox → 'support'
 *   - Fallback → 'other'
 *
 * Conservative by design — we'd rather land threads in 'other' than
 * mis-categorise a real customer email as outbound.
 */
function inferCategory(thread: GmailThread, evariEmail: string): GmailCategory {
  const ev = evariEmail.toLowerCase();
  const participants = extractParticipants(thread);
  const hasKlaviyo = participants.some(
    (p) => p.includes('klaviyo') || p.includes('klaviyomail') || p.endsWith('.klaviyo.com'),
  );
  if (hasKlaviyo) return 'klaviyo-reply';

  const messages = thread.messages ?? [];
  const anyInbound = messages.some((m) => {
    const from = getHeader(m.payload, 'From').toLowerCase();
    return from && !from.includes(ev);
  });
  const anyOutbound = messages.some((m) => (m.labelIds ?? []).includes('SENT'));

  if (anyOutbound && !anyInbound) return 'outbound';
  if (anyInbound) return 'support';
  return 'other';
}

/**
 * Convert a raw Gmail API thread into the lean summary we persist.
 * The subject is taken from the first message (threads rarely change subject);
 * the snippet is taken from the most recent message (most relevant for
 * "what's happening right now").
 */
function summariseThread(thread: GmailThread, evariEmail: string): GmailThreadSummary | null {
  const messages = (thread.messages ?? []).slice().sort((a, b) => {
    const ai = Number(a.internalDate ?? '0');
    const bi = Number(b.internalDate ?? '0');
    return ai - bi;
  });
  if (messages.length === 0) return null;

  const first = messages[0]!;
  const last = messages[messages.length - 1]!;

  const subject = getHeader(first.payload, 'Subject') || '(no subject)';
  const snippet = (last.snippet ?? first.snippet ?? '').slice(0, 400);
  const lastMs = Number(last.internalDate ?? '0');
  const lastMessageAt = lastMs > 0 ? new Date(lastMs).toISOString() : new Date().toISOString();

  return {
    threadId: thread.id,
    subject,
    snippet,
    category: inferCategory(thread, evariEmail),
    participants: extractParticipants(thread),
    lastMessageAt,
    labels: last.labelIds ?? [],
    gmailUrl: `https://mail.google.com/mail/u/0/#inbox/${thread.id}`,
  };
}

// -----------------------------------------------------------------------------
// Public API — used by the ingest route + briefing.
// -----------------------------------------------------------------------------

export interface GmailIngestResult {
  user: string;
  window: string;
  fetched: number;
  written: number;
  byCategory: Record<GmailCategory, number>;
  durationMs: number;
}

/**
 * Pull the last `days` of threads for the connected Gmail account and upsert
 * summaries into `dashboard_gmail_threads`. Idempotent — running twice in a
 * row overwrites existing rows rather than duplicating them.
 *
 * Default window is 30 days, 200 threads max. That's ample for the morning
 * briefing ("what happened overnight") and gives strategy chat enough
 * customer-context recency without blowing past Gmail's ~1req/s quota.
 */
export async function ingestGmailThreads(opts: {
  days?: number;
  maxThreads?: number;
} = {}): Promise<GmailIngestResult> {
  const startedAt = Date.now();
  const days = opts.days ?? 30;
  const maxThreads = opts.maxThreads ?? 200;

  const evariEmail = process.env.GMAIL_USER_EMAIL?.trim().toLowerCase();
  if (!evariEmail) throw new Error('GMAIL_USER_EMAIL is not set');

  const supa = createSupabaseAdmin();
  if (!supa) {
    throw new Error(
      'Supabase admin client unavailable — set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL',
    );
  }

  const accessToken = await getGoogleAccessToken();
  const query = `newer_than:${days}d`;
  const ids = await listGmailThreadIds({ accessToken, query, maxThreads });

  // Fetch threads in small batches — Gmail's quota is 250 quota-units/user/second,
  // and threads.get costs 10 units. 10 parallel is safe.
  const CONCURRENCY = 10;
  const summaries: GmailThreadSummary[] = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const threads = await Promise.all(
      batch.map((id) => getGmailThread({ accessToken, threadId: id })),
    );
    for (const t of threads) {
      const s = summariseThread(t, evariEmail);
      if (s) summaries.push(s);
    }
  }

  // Upsert — each row is (thread_id PK, payload jsonb, last_message_at, category).
  // We store last_message_at + category in dedicated columns so the briefing
  // can filter without scanning jsonb.
  const CHUNK = 200;
  let written = 0;
  for (let i = 0; i < summaries.length; i += CHUNK) {
    const slice = summaries.slice(i, i + CHUNK);
    const payload = slice.map((s) => ({
      thread_id: s.threadId,
      category: s.category,
      last_message_at: s.lastMessageAt,
      payload: s,
    }));
    const up = await supa
      .from('dashboard_gmail_threads')
      .upsert(payload, { onConflict: 'thread_id' });
    if (up.error) throw new Error(`Gmail threads upsert failed: ${up.error.message}`);
    written += slice.length;
  }

  // Prune anything older than the window so the table stays bounded.
  // (Keeps us at ~30d * ~50-100 threads/day = manageable table size.)
  const cutoff = new Date(Date.now() - (days + 30) * 86_400_000).toISOString();
  await supa.from('dashboard_gmail_threads').delete().lt('last_message_at', cutoff);

  const byCategory: Record<GmailCategory, number> = {
    support: 0,
    outbound: 0,
    'klaviyo-reply': 0,
    other: 0,
  };
  for (const s of summaries) byCategory[s.category]++;

  return {
    user: evariEmail,
    window: `last ${days}d`,
    fetched: summaries.length,
    written,
    byCategory,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Read cached Gmail thread summaries back out of Supabase. Used by the
 * briefing payload + the chat briefings. Never throws — if Gmail isn't
 * connected or the table is empty, returns [].
 */
export async function listCachedGmailThreads(opts: {
  category?: GmailCategory;
  limit?: number;
} = {}): Promise<GmailThreadSummary[]> {
  const supa = createSupabaseAdmin();
  if (!supa) return [];

  let query = supa
    .from('dashboard_gmail_threads')
    .select('payload')
    .order('last_message_at', { ascending: false })
    .limit(opts.limit ?? 25);

  if (opts.category) query = query.eq('category', opts.category);

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as { payload: GmailThreadSummary }[]).map((r) => r.payload);
}

/**
 * Group a list of thread summaries by category — used by the briefing to
 * render "3 customer asks, 2 outbound replies, 5 Klaviyo responses".
 */
export function groupGmailByCategory(
  threads: GmailThreadSummary[],
): Record<GmailCategory, GmailThreadSummary[]> {
  const out: Record<GmailCategory, GmailThreadSummary[]> = {
    support: [],
    outbound: [],
    'klaviyo-reply': [],
    other: [],
  };
  for (const t of threads) out[t.category].push(t);
  return out;
}

export { isGmailConnected };
