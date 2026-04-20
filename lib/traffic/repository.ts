import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { isGA4Connected } from '@/lib/integrations/google';

// -----------------------------------------------------------------------------
// Traffic repository — one-stop read layer for the /traffic page.
//
// The GA4 ingest fans out into ~8 tables; this module joins them and shapes
// them into the exact dataset the Traffic page needs, so the server component
// can stay lean.
//
// Windows:
//   - trend365:        last 365 days of daily sessions/users/new-users/events
//   - windowDays:      the canonical 28d breakdown window (matches what GA4
//                      shows by default on every report)
//   - prevWindowDays:  the 28d block immediately before windowDays — used for
//                      % delta arrows on every KPI tile
// -----------------------------------------------------------------------------

export interface TrafficDay {
  day: string;
  sessions: number;
  users: number;
  newUsers: number;
  engagedSessions: number;
  engagementRate: number;
  events: number;
  bounceRate: number;
  avgDurationSec: number;
  conversions: number;
}

export interface TrafficKpiTile {
  label: string;
  value: number;
  previousValue: number;
  delta: number; // value - previousValue
  deltaPct: number; // delta / previousValue (0-1, or 0 if prev=0)
  trend: TrafficSparkPoint[]; // one point per day, 12 months (or whatever exists)
}

export interface TrafficSparkPoint {
  day: string;
  value: number;
}

export interface TrafficCountryRow {
  country: string;
  countryCode: string;
  sessions: number;
  users: number;
  conversions: number;
}

export interface TrafficCityRow {
  city: string;
  country: string;
  countryCode: string;
  sessions: number;
  users: number;
}

export interface TrafficChannelRow {
  channel: string;
  sessions: number;
  users: number;
  newUsers: number;
  engagedSessions: number;
  conversions: number;
}

export interface TrafficPageRow {
  pagePath: string;
  pageTitle: string;
  views: number;
  sessions: number;
  users: number;
  bounceRate: number;
  avgDurationSec: number;
  conversions: number;
}

export interface TrafficSourceRow {
  source: string;
  medium: string;
  sessions: number;
  conversions: number;
  conversionRate: number;
}

export interface TrafficLanguageRow {
  language: string;
  sessions: number;
  users: number;
}

export interface TrafficEventRow {
  eventName: string;
  eventCount: number;
  users: number;
}

export interface TrafficSnapshot {
  connected: boolean;
  hasData: boolean;
  windowStart: string;
  windowEnd: string;
  kpi: {
    activeUsers: TrafficKpiTile;
    newUsers: TrafficKpiTile;
    sessions: TrafficKpiTile;
    events: TrafficKpiTile;
  };
  trend365: TrafficDay[];
  countries: TrafficCountryRow[];
  cities: TrafficCityRow[];
  channels: TrafficChannelRow[];
  pages: TrafficPageRow[];
  sources: TrafficSourceRow[];
  languages: TrafficLanguageRow[];
  events: TrafficEventRow[];
  lastSyncedAt: string | null;
}

const WINDOW_DAYS = 28;

function todayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDays(d: Date, delta: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + delta);
  return copy;
}

function pct(delta: number, prev: number): number {
  if (!prev) return 0;
  return delta / prev;
}

/**
 * Returns the full dataset the Traffic page needs.
 * Always returns a well-formed snapshot (empty arrays) — the page component
 * decides whether to render an "awaiting ingest" state based on hasData.
 */
export async function getTrafficSnapshot(): Promise<TrafficSnapshot> {
  const empty = emptySnapshot();
  const supa = createSupabaseAdmin();
  if (!supa) return { ...empty, connected: isGA4Connected() };

  const endDate = shiftDays(todayUTC(), -1); // GA4 yesterday is usually complete
  const windowStart = shiftDays(endDate, -(WINDOW_DAYS - 1));
  const prevWindowEnd = shiftDays(windowStart, -1);
  const prevWindowStart = shiftDays(prevWindowEnd, -(WINDOW_DAYS - 1));
  const trendStart = shiftDays(endDate, -364);

  // 1. 365-day day-level trend — drives all KPI sparklines + the value chart.
  const { data: dayRows } = await supa
    .from('dashboard_traffic_days')
    .select('day, sessions, users, new_users, engaged_sessions, engagement_rate, events, bounce_rate, avg_duration_sec, conversions')
    .gte('day', isoDate(trendStart))
    .lte('day', isoDate(endDate))
    .order('day', { ascending: true });

  const trend365: TrafficDay[] = (dayRows ?? []).map((r) => ({
    day: r.day as string,
    sessions: (r.sessions as number) ?? 0,
    users: (r.users as number) ?? 0,
    newUsers: (r.new_users as number) ?? 0,
    engagedSessions: (r.engaged_sessions as number) ?? 0,
    engagementRate: (r.engagement_rate as number) ?? 0,
    events: (r.events as number) ?? 0,
    bounceRate: (r.bounce_rate as number) ?? 0,
    avgDurationSec: (r.avg_duration_sec as number) ?? 0,
    conversions: (r.conversions as number) ?? 0,
  }));

  const kpi = buildKpiTiles(trend365, windowStart, endDate, prevWindowStart, prevWindowEnd);

  // 2. Breakdown tables — all scoped to the ingest's 28d window (we don't
  //    filter by window_start/end because ingest truncates each run).
  const [countriesRes, citiesRes, channelsRes, pagesRes, sourcesRes, languagesRes, eventsRes, syncRes] =
    await Promise.all([
      supa
        .from('dashboard_ga4_geo_28d')
        .select('country, country_code, sessions, users, conversions')
        .order('sessions', { ascending: false })
        .limit(50),
      supa
        .from('dashboard_ga4_cities_28d')
        .select('city, country, country_code, sessions, users')
        .order('sessions', { ascending: false })
        .limit(25),
      supa
        .from('dashboard_ga4_channels_28d')
        .select('channel, sessions, users, new_users, engaged_sessions, conversions')
        .order('sessions', { ascending: false })
        .limit(20),
      supa
        .from('dashboard_ga4_pages_28d')
        .select('page_path, page_title, views, sessions, users, bounce_rate, avg_duration_sec, conversions')
        .order('views', { ascending: false })
        .limit(25),
      supa
        .from('dashboard_traffic_sources')
        .select('source, medium, sessions, conversions, conversion_rate')
        .order('sort_order', { ascending: true })
        .limit(20),
      supa
        .from('dashboard_ga4_languages_28d')
        .select('language, sessions, users')
        .order('sessions', { ascending: false })
        .limit(15),
      supa
        .from('dashboard_ga4_events_28d')
        .select('event_name, event_count, users')
        .order('event_count', { ascending: false })
        .limit(20),
      supa
        .from('dashboard_ga4_sync_log')
        .select('ran_at')
        .order('ran_at', { ascending: false })
        .limit(1),
    ]);

  // Collapse geo to country-level (dedupe the (country, region) duplicates).
  const countryMap = new Map<string, TrafficCountryRow>();
  (countriesRes.data ?? []).forEach((r) => {
    const cc = (r.country_code as string) ?? '';
    const country = (r.country as string) ?? '(not set)';
    const key = cc || country;
    const prev = countryMap.get(key);
    if (!prev) {
      countryMap.set(key, {
        country,
        countryCode: cc,
        sessions: (r.sessions as number) ?? 0,
        users: (r.users as number) ?? 0,
        conversions: (r.conversions as number) ?? 0,
      });
    } else {
      prev.sessions += (r.sessions as number) ?? 0;
      prev.users += (r.users as number) ?? 0;
      prev.conversions += (r.conversions as number) ?? 0;
    }
  });
  const countries = Array.from(countryMap.values())
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 20);

  const cities: TrafficCityRow[] = (citiesRes.data ?? []).map((r) => ({
    city: (r.city as string) ?? '(not set)',
    country: (r.country as string) ?? '',
    countryCode: (r.country_code as string) ?? '',
    sessions: (r.sessions as number) ?? 0,
    users: (r.users as number) ?? 0,
  }));

  const channels: TrafficChannelRow[] = (channelsRes.data ?? []).map((r) => ({
    channel: (r.channel as string) ?? '(unassigned)',
    sessions: (r.sessions as number) ?? 0,
    users: (r.users as number) ?? 0,
    newUsers: (r.new_users as number) ?? 0,
    engagedSessions: (r.engaged_sessions as number) ?? 0,
    conversions: (r.conversions as number) ?? 0,
  }));

  const pages: TrafficPageRow[] = (pagesRes.data ?? []).map((r) => ({
    pagePath: (r.page_path as string) ?? '/',
    pageTitle: (r.page_title as string) ?? '',
    views: (r.views as number) ?? 0,
    sessions: (r.sessions as number) ?? 0,
    users: (r.users as number) ?? 0,
    bounceRate: (r.bounce_rate as number) ?? 0,
    avgDurationSec: (r.avg_duration_sec as number) ?? 0,
    conversions: (r.conversions as number) ?? 0,
  }));

  const sources: TrafficSourceRow[] = (sourcesRes.data ?? []).map((r) => ({
    source: (r.source as string) ?? '',
    medium: (r.medium as string) ?? '',
    sessions: (r.sessions as number) ?? 0,
    conversions: (r.conversions as number) ?? 0,
    conversionRate: (r.conversion_rate as number) ?? 0,
  }));

  const languages: TrafficLanguageRow[] = (languagesRes.data ?? []).map((r) => ({
    language: (r.language as string) ?? '(unknown)',
    sessions: (r.sessions as number) ?? 0,
    users: (r.users as number) ?? 0,
  }));

  const events: TrafficEventRow[] = (eventsRes.data ?? []).map((r) => ({
    eventName: (r.event_name as string) ?? '(unknown)',
    eventCount: (r.event_count as number) ?? 0,
    users: (r.users as number) ?? 0,
  }));

  const lastSyncedAt = (syncRes.data?.[0]?.ran_at as string | undefined) ?? null;

  const hasData =
    trend365.length > 0 ||
    countries.length > 0 ||
    cities.length > 0 ||
    channels.length > 0 ||
    pages.length > 0;

  return {
    connected: isGA4Connected(),
    hasData,
    windowStart: isoDate(windowStart),
    windowEnd: isoDate(endDate),
    kpi,
    trend365,
    countries,
    cities,
    channels,
    pages,
    sources,
    languages,
    events,
    lastSyncedAt,
  };
}

/**
 * Window A = last 28 days; Window B = 28 days immediately prior.
 * We sum each metric across both windows and return delta + deltaPct + trend.
 */
function buildKpiTiles(
  trend: TrafficDay[],
  windowStart: Date,
  windowEnd: Date,
  prevStart: Date,
  prevEnd: Date,
): TrafficSnapshot['kpi'] {
  const ws = isoDate(windowStart);
  const we = isoDate(windowEnd);
  const ps = isoDate(prevStart);
  const pe = isoDate(prevEnd);

  const sum = {
    sessions: 0, users: 0, newUsers: 0, events: 0,
    prevSessions: 0, prevUsers: 0, prevNewUsers: 0, prevEvents: 0,
  };
  for (const d of trend) {
    if (d.day >= ws && d.day <= we) {
      sum.sessions += d.sessions;
      sum.users += d.users;
      sum.newUsers += d.newUsers;
      sum.events += d.events;
    } else if (d.day >= ps && d.day <= pe) {
      sum.prevSessions += d.sessions;
      sum.prevUsers += d.users;
      sum.prevNewUsers += d.newUsers;
      sum.prevEvents += d.events;
    }
  }

  const tile = (
    label: string,
    value: number,
    prev: number,
    picker: (d: TrafficDay) => number,
  ): TrafficKpiTile => ({
    label,
    value,
    previousValue: prev,
    delta: value - prev,
    deltaPct: pct(value - prev, prev),
    trend: trend.map((d) => ({ day: d.day, value: picker(d) })),
  });

  return {
    activeUsers: tile('Active users', sum.users, sum.prevUsers, (d) => d.users),
    newUsers: tile('New users', sum.newUsers, sum.prevNewUsers, (d) => d.newUsers),
    sessions: tile('Sessions', sum.sessions, sum.prevSessions, (d) => d.sessions),
    events: tile('Event count', sum.events, sum.prevEvents, (d) => d.events),
  };
}

function emptySnapshot(): TrafficSnapshot {
  const blankTile: TrafficKpiTile = {
    label: '',
    value: 0,
    previousValue: 0,
    delta: 0,
    deltaPct: 0,
    trend: [],
  };
  return {
    connected: false,
    hasData: false,
    windowStart: '',
    windowEnd: '',
    kpi: {
      activeUsers: { ...blankTile, label: 'Active users' },
      newUsers: { ...blankTile, label: 'New users' },
      sessions: { ...blankTile, label: 'Sessions' },
      events: { ...blankTile, label: 'Event count' },
    },
    trend365: [],
    countries: [],
    cities: [],
    channels: [],
    pages: [],
    sources: [],
    languages: [],
    events: [],
    lastSyncedAt: null,
  };
}
