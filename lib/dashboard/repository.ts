import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuditFinding,
  KeywordRow,
  LandingPageRow,
  Lead,
  PageRecord,
  Play,
  Prospect,
  SocialPost,
  Thread,
  TrafficDay,
  TrafficSourceRow,
  User,
} from '@/lib/types';

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

export async function listLeads(supabase: SupabaseClient | null): Promise<Lead[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('dashboard_leads').select('payload');
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

export async function listProspects(supabase: SupabaseClient | null): Promise<Prospect[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('dashboard_prospects').select('payload');
  if (error || !data?.length) return [];
  return (data as { payload: Prospect }[]).map((r) => r.payload).sort(byLastTouchProspect);
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
