import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuditFinding,
  DraftMessage,
  DraftMessageStatus,
  KeywordRow,
  LandingPageRow,
  Lead,
  OutreachSender,
  PageRecord,
  Play,
  Prospect,
  SocialPost,
  SuppressionEntry,
  Thread,
  TrafficDay,
  TrafficSourceRow,
  User,
} from '@/lib/types';
import { ensureLeadTimestamps, leadToProspect } from '@/lib/dashboard/leadViews';

/** Default when env / DB has no preference (matches seeded user id). */
export const DEFAULT_CURRENT_USER_ID = 'user_craig';

function byLastTouchLead(a: Lead, b: Lead) {
  return new Date(b.lastTouchAt).getTime() - new Date(a.lastTouchAt).getTime();
}

function byUpdatedPlay(a: Play, b: Play) {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function byLastTouchProspect(a: Prospect, b: Prospect) {
  const tb = b.lastTouchAt ?? b.createdAt;
  const ta = a.lastTouchAt ?? a.createdAt;
  return new Date(tb).getTime() - new Date(ta).getTime();
}

/**
 * Only rows promoted to the Leads CRM (tier='lead') — prospects stay on
 * the /prospects surface. A missing tier filter here is what caused every
 * sourced prospect to appear on the Leads page as if auto-promoted.
 */
export async function listLeads(supabase: SupabaseClient | null): Promise<Lead[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('dashboard_leads')
    .select('payload')
    .eq('tier', 'lead');
  if (error || !data?.length) return [];
  return (data as { payload: Lead }[]).map((r) => r.payload).sort(byLastTouchLead);
}

export async function getLead(
  supabase: SupabaseClient | null,
  id: string,
): Promise<Lead | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from('dashboard_leads')
    .select('payload')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return undefined;
  return (data as { payload: Lead }).payload;
}

export async function listThreads(supabase: SupabaseClient | null): Promise<Thread[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('dashboard_threads').select('payload');
  if (error || !data?.length) return [];
  return (data as { payload: Thread }[])
    .map((r) => r.payload)
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
}

export async function getThread(
  supabase: SupabaseClient | null,
  id: string,
): Promise<Thread | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from('dashboard_threads')
    .select('payload')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return undefined;
  return (data as { payload: Thread }).payload;
}

export async function listPlays(supabase: SupabaseClient | null): Promise<Play[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('dashboard_plays').select('payload');
  if (error || !data?.length) return [];
  return (data as { payload: Play }[]).map((r) => r.payload).sort(byUpdatedPlay);
}

export async function getPlay(
  supabase: SupabaseClient | null,
  id: string,
): Promise<Play | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from('dashboard_plays')
    .select('payload')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return undefined;
  return (data as { payload: Play }).payload;
}

/**
 * Prospects now live in dashboard_leads with tier='prospect'. We read the Lead
 * rows and map to the Prospect view shape so the existing Prospects UI is
 * unchanged. Once the CRM surfaces share a single component this mapper goes.
 */
export async function listProspects(supabase: SupabaseClient | null): Promise<Prospect[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('dashboard_leads')
    .select('payload')
    .eq('tier', 'prospect');
  if (error || !data?.length) return [];
  return (data as { payload: Lead }[])
    .map((r) => leadToProspect(r.payload))
    .sort(byLastTouchProspect);
}

export async function listLeadsByTier(
  supabase: SupabaseClient | null,
  tier: 'prospect' | 'lead',
): Promise<Lead[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('dashboard_leads')
    .select('payload')
    .eq('tier', tier);
  if (error || !data?.length) return [];
  return (data as { payload: Lead }[]).map((r) => r.payload).sort(byLastTouchLead);
}

export async function listLeadsByCategory(
  supabase: SupabaseClient | null,
  category: string,
): Promise<Lead[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('dashboard_leads')
    .select('payload')
    .contains('payload', { category });
  if (error || !data?.length) return [];
  return (data as { payload: Lead }[]).map((r) => r.payload).sort(byLastTouchLead);
}

/**
 * Upsert a Lead row. Ensures tier + timestamps defaults.
 *
 * IMPORTANT: The default tier is 'prospect' — nothing gets auto-promoted
 * to the Leads CRM just because a row was re-saved. The only code that
 * should set tier='lead' is the explicit /api/leads/[id]/promote route
 * (or a manual Supabase edit). Force the payload and the DB column to
 * agree so reads filtered on `tier` and reads of `payload.tier` can never
 * disagree.
 */
export async function upsertLead(
  supabase: SupabaseClient | null,
  lead: Lead,
): Promise<Lead | undefined> {
  if (!supabase) return undefined;
  const normalised = ensureLeadTimestamps(lead);
  const tier: 'prospect' | 'lead' = normalised.tier ?? 'prospect';
  const payload: Lead = { ...normalised, tier };
  const { error } = await supabase
    .from('dashboard_leads')
    .upsert({ id: normalised.id, payload, tier });
  if (error) {
    console.warn('[repository] upsertLead failed', error);
    return undefined;
  }
  return payload;
}

export async function listTrafficDays(supabase: SupabaseClient | null): Promise<TrafficDay[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('dashboard_traffic_days')
    .select('day, sessions, users, bounce_rate, avg_duration_sec, conversions')
    .order('day', { ascending: true });
  if (error || !data?.length) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    date: String(row.day).slice(0, 10),
    sessions: row.sessions as number,
    users: row.users as number,
    bounceRate: row.bounce_rate as number,
    avgDurationSec: row.avg_duration_sec as number,
    conversions: row.conversions as number,
  }));
}

export async function listTrafficSources(
  supabase: SupabaseClient | null,
): Promise<TrafficSourceRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('dashboard_traffic_sources')
    .select('source, medium, sessions, conversions, conversion_rate')
    .order('sort_order', { ascending: true });
  if (error || !data?.length) return [];
  return (
    data as Array<{
      source: string;
      medium: string;
      sessions: number;
      conversions: number;
      conversion_rate: number;
    }>
  ).map((r) => ({
    source: r.source,
    medium: r.medium,
    sessions: r.sessions,
    conversions: r.conversions,
    conversionRate: r.conversion_rate,
  }));
}

export async function listLandingPages(
  supabase: SupabaseClient | null,
): Promise<LandingPageRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('dashboard_landing_pages').select('payload');
  if (error || !data?.length) return [];
  return (data as { payload: LandingPageRow }[]).map((r) => r.payload);
}

export async function listSeoKeywords(supabase: SupabaseClient | null): Promise<KeywordRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('dashboard_seo_keywords').select('payload');
  if (error || !data?.length) return [];
  return (data as { payload: KeywordRow }[]).map((r) => r.payload);
}

/**
 * Read real GSC rollup data (written nightly by the ingest endpoint) and shape
 * it into the `KeywordRow` form the Keywords page already consumes. Returns
 * an empty array if no rollup has been written yet, so callers can fall back
 * to the mock dataset or an empty-state view.
 */
export async function listGSCQueries28d(
  supabase: SupabaseClient | null,
  opts: { siteUrl?: string; limit?: number } = {},
): Promise<KeywordRow[]> {
  if (!supabase) return [];
  const limit = opts.limit ?? 500;
  let query = supabase
    .from('dashboard_gsc_queries_28d')
    .select('query,clicks,impressions,ctr,position,site_url')
    .order('impressions', { ascending: false })
    .limit(limit);
  if (opts.siteUrl) query = query.eq('site_url', opts.siteUrl);
  const { data, error } = await query;
  if (error || !data?.length) return [];

  return (data as Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    site_url: string;
  }>).map((r) => ({
    id: `gsc:${r.query}`,
    query: r.query,
    impressions: r.impressions,
    clicks: r.clicks,
    ctr: r.ctr,
    position: r.position,
    positionDelta7d: 0, // needs day-level history to compute; 0 for now
    intent: inferKeywordIntent(r.query),
    priority: inferKeywordPriority(r.impressions, r.position),
  }));
}

export function inferKeywordIntent(q: string): KeywordRow['intent'] {
  const s = q.toLowerCase();
  if (/\b(buy|price|cost|shop|order|discount|deal|cheap|sale|best\s+\w+\s+to\s+buy)\b/.test(s)) {
    return 'transactional';
  }
  if (/\b(review|compare|comparison|vs|versus|top|best)\b/.test(s)) return 'commercial';
  if (/\b(evari|raceborne)\b/.test(s)) return 'navigational';
  return 'informational';
}

export function inferKeywordPriority(
  impressions: number,
  position: number,
): KeywordRow['priority'] {
  // High: already decent rank (<15) AND >=100 impressions
  if (position <= 15 && impressions >= 100) return 'high';
  // Medium: anything with meaningful exposure
  if (impressions >= 25) return 'medium';
  return 'low';
}

export async function listSeoPages(supabase: SupabaseClient | null): Promise<PageRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('dashboard_seo_pages').select('payload');
  if (error || !data?.length) return [];
  return (data as { payload: PageRecord }[]).map((r) => r.payload);
}

export async function listAuditFindings(
  supabase: SupabaseClient | null,
): Promise<AuditFinding[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('dashboard_audit_findings').select('payload');
  if (error || !data?.length) return [];
  return (data as { payload: AuditFinding }[]).map((r) => r.payload);
}

export async function listSocialPosts(supabase: SupabaseClient | null): Promise<SocialPost[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('dashboard_social_posts').select('payload');
  if (error || !data?.length) return [];
  return (data as { payload: SocialPost }[]).map((r) => r.payload);
}

export async function listUsers(supabase: SupabaseClient | null): Promise<User[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('dashboard_users').select('payload');
  if (error || !data?.length) return [];
  return (data as { payload: User }[]).map((r) => r.payload);
}

export async function resolveCurrentUserId(
  supabase: SupabaseClient | null,
): Promise<string> {
  const env = process.env.NEXT_PUBLIC_DASHBOARD_USER_ID?.trim();
  if (env) return env;
  const users = await listUsers(supabase);
  const active = users.find((u) => u.status === 'active');
  return active?.id ?? users[0]?.id ?? DEFAULT_CURRENT_USER_ID;
}

/**
 * Per-play pipeline counts — prospects, leads, conversations — used by the
 * Ventures list rows (see components/plays/PlayRow). Does the aggregation in
 * two round-trips and tallies in memory:
 *
 *   - `dashboard_leads` rows carry both `tier` and `payload.playId`, so one
 *     select gives us prospect + lead counts per play.
 *   - `dashboard_threads` rows have only `payload.leadId`, so we build a
 *     leadId → playId lookup from the leads fetch above and tally threads by
 *     their lead's playId.
 *
 * Plays with no rows do not appear in the returned map — callers should
 * treat a missing entry as { prospects: 0, leads: 0, conversations: 0 }.
 */
export async function getCountsPerPlay(
  supabase: SupabaseClient | null,
): Promise<Map<string, { prospects: number; leads: number; conversations: number }>> {
  const counts = new Map<
    string,
    { prospects: number; leads: number; conversations: number }
  >();
  if (!supabase) return counts;

  function bump(
    playId: string | null | undefined,
    key: 'prospects' | 'leads' | 'conversations',
  ) {
    if (!playId) return;
    const cur = counts.get(playId) ?? { prospects: 0, leads: 0, conversations: 0 };
    cur[key] += 1;
    counts.set(playId, cur);
  }

  const { data: leadRows } = await supabase
    .from('dashboard_leads')
    .select('id, tier, payload');
  const leadIdToPlay = new Map<string, string>();
  if (leadRows?.length) {
    for (const row of leadRows as {
      id: string;
      tier: 'prospect' | 'lead' | null;
      payload: Lead;
    }[]) {
      const playId = row.payload?.playId ?? null;
      if (playId && row.id) leadIdToPlay.set(row.id, playId);
      // Column tier is authoritative; payload.tier is a fallback for legacy
      // rows written before the column was added.
      const tier = row.tier ?? row.payload?.tier ?? 'prospect';
      bump(playId, tier === 'lead' ? 'leads' : 'prospects');
    }
  }

  const { data: threadRows } = await supabase
    .from('dashboard_threads')
    .select('payload');
  if (threadRows?.length) {
    for (const row of threadRows as { payload: Thread }[]) {
      const leadId = row.payload?.leadId;
      if (!leadId) continue;
      const playId = leadIdToPlay.get(leadId);
      bump(playId, 'conversations');
    }
  }

  return counts;
}

/** Counts for sidebar / nav (pipeline + web). */
export async function getDashboardNavCounts(supabase: SupabaseClient | null): Promise<{
  plays: number;
  prospectsActive: number;
  leadsPipeline: number;
  conversationsUnread: number;
}> {
  const [plays, prospects, leads, threads] = await Promise.all([
    listPlays(supabase),
    listProspects(supabase),
    listLeads(supabase),
    listThreads(supabase),
  ]);
  return {
    plays: plays.filter((p) => p.stage !== 'retired' && p.stage !== 'idea').length,
    prospectsActive: prospects.filter((p) => p.status !== 'archived' && p.status !== 'qualified')
      .length,
    leadsPipeline: leads.filter((l) => !['won', 'lost', 'cold'].includes(l.stage)).length,
    conversationsUnread: threads.filter((t) => t.unread).length,
  };
}


// -- Outreach senders --------------------------------------------------------

export async function listSenders(
  supabase: SupabaseClient | null,
): Promise<OutreachSender[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('dashboard_outreach_senders')
    .select('payload');
  if (error || !data?.length) return [];
  return (data as { payload: OutreachSender }[])
    .map((r) => r.payload)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getSender(
  supabase: SupabaseClient | null,
  id: string,
): Promise<OutreachSender | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from('dashboard_outreach_senders')
    .select('payload')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return undefined;
  return (data as { payload: OutreachSender }).payload;
}

export async function upsertSender(
  supabase: SupabaseClient | null,
  sender: OutreachSender,
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('dashboard_outreach_senders')
    .upsert({ id: sender.id, payload: sender, updated_at: new Date().toISOString() });

  // Enforce single default: if this sender was just made default, clear
  // the flag on the previous default. One targeted fetch (at most one
  // other row with isDefault=true) and one update - replaces the old
  // "list every sender, update each one in parallel" pattern.
  if (sender.isDefault) {
    const { data: priorDefaults } = await supabase
      .from('dashboard_outreach_senders')
      .select('payload')
      .contains('payload', { isDefault: true });
    const others = (priorDefaults as { payload: OutreachSender }[] | null)
      ?.map((r) => r.payload)
      .filter((s) => s.id !== sender.id) ?? [];
    if (others.length > 0) {
      await Promise.all(
        others.map((s) =>
          supabase
            .from('dashboard_outreach_senders')
            .update({ payload: { ...s, isDefault: false, updatedAt: new Date().toISOString() } })
            .eq('id', s.id),
        ),
      );
    }
  }
}

export async function deleteSender(
  supabase: SupabaseClient | null,
  id: string,
): Promise<void> {
  if (!supabase) return;
  await supabase.from('dashboard_outreach_senders').delete().eq('id', id);
}

// -- Suppression list --------------------------------------------------------

export async function listSuppressions(
  supabase: SupabaseClient | null,
): Promise<SuppressionEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('dashboard_suppressions')
    .select('payload');
  if (error || !data?.length) return [];
  return (data as { payload: SuppressionEntry }[]).map((r) => r.payload);
}

export async function isSuppressed(
  supabase: SupabaseClient | null,
  email: string,
  playId?: string,
): Promise<boolean> {
  if (!supabase) return false;
  const lower = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from('dashboard_suppressions')
    .select('payload')
    .eq('email', lower);
  if (error || !data?.length) return false;
  return (data as { payload: SuppressionEntry }[]).some((r) => {
    const e = r.payload;
    return !e.playId || e.playId === playId;
  });
}

/**
 * Batch counterpart of `isSuppressed`. Takes a list of recipient emails and
 * returns the subset that's suppressed (either globally or for the given
 * play). Use this to avoid N+1 queries inside dry-run / follow-up loops.
 *
 * Empty input -> empty set, no query.
 */
export async function listSuppressedEmails(
  supabase: SupabaseClient | null,
  emails: string[],
  playId?: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!supabase || emails.length === 0) return out;
  const lowers = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  );
  if (lowers.length === 0) return out;
  const { data, error } = await supabase
    .from('dashboard_suppressions')
    .select('payload')
    .in('email', lowers);
  if (error || !data?.length) return out;
  for (const row of data as { payload: SuppressionEntry }[]) {
    const e = row.payload;
    if (!e.playId || e.playId === playId) {
      out.add(e.email.trim().toLowerCase());
    }
  }
  return out;
}

export async function addSuppression(
  supabase: SupabaseClient | null,
  entry: SuppressionEntry,
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('dashboard_suppressions')
    .upsert({ id: entry.id, payload: entry });
}

// -- Outreach drafts (Phase 2 dry-run queue) ---------------------------------
//
// Row shape: (id text PK, play_id text, status text, payload jsonb,
// created_at, updated_at). The full DraftMessage always lives in `payload`;
// the scalar columns are just there so the queue can filter without scanning
// jsonb.

function byUpdatedDraft(a: DraftMessage, b: DraftMessage) {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export async function listDraftsByPlay(
  supabase: SupabaseClient | null,
  playId: string,
): Promise<DraftMessage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('dashboard_draft_messages')
    .select('payload')
    .eq('play_id', playId);
  if (error || !data?.length) return [];
  return (data as { payload: DraftMessage }[]).map((r) => r.payload).sort(byUpdatedDraft);
}

export async function listDraftsByStatus(
  supabase: SupabaseClient | null,
  status: DraftMessageStatus,
): Promise<DraftMessage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('dashboard_draft_messages')
    .select('payload')
    .eq('status', status);
  if (error || !data?.length) return [];
  return (data as { payload: DraftMessage }[]).map((r) => r.payload).sort(byUpdatedDraft);
}

export async function getDraft(
  supabase: SupabaseClient | null,
  id: string,
): Promise<DraftMessage | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from('dashboard_draft_messages')
    .select('payload')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return undefined;
  return (data as { payload: DraftMessage }).payload;
}

export async function upsertDraft(
  supabase: SupabaseClient | null,
  draft: DraftMessage,
): Promise<void> {
  if (!supabase) return;
  await supabase.from('dashboard_draft_messages').upsert({
    id: draft.id,
    play_id: draft.playId,
    status: draft.status,
    payload: draft,
    updated_at: new Date().toISOString(),
  });
}

export async function deleteDraft(
  supabase: SupabaseClient | null,
  id: string,
): Promise<void> {
  if (!supabase) return;
  await supabase.from('dashboard_draft_messages').delete().eq('id', id);
}
