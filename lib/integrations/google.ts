/**
 * Google adapters — stubs for GSC, GA4, and Gmail.
 *
 * All three share GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN.
 * Each surface adds its own ID:
 *   - GSC: GSC_SITE_URL
 *   - GA4: GA4_PROPERTY_ID
 *   - Gmail: GMAIL_USER_EMAIL + GMAIL_LABEL_NAME
 *
 * Setup:
 *   1. Create a Google Cloud project for the dashboard.
 *   2. Enable APIs: Search Console API, Google Analytics Data API, Gmail API.
 *   3. Create an OAuth 2.0 Client ID (Web). Authorised redirect URI:
 *        http://localhost:3000/api/google/callback (and the deployed URL).
 *   4. Run the one-time OAuth flow at /api/google/connect to capture a
 *      refresh_token; persist it to GOOGLE_REFRESH_TOKEN.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  inferKeywordIntent,
  inferKeywordPriority,
  listGSCQueries28d,
  listLandingPages,
  listSeoKeywords,
  listThreads,
  listTrafficDays,
  listTrafficSources,
} from '@/lib/dashboard/repository';

const requiredEnv = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'] as const;

function googleAuthReady(): boolean {
  return requiredEnv.every((k) => Boolean(process.env[k]));
}

export const isGSCConnected = () => googleAuthReady() && Boolean(process.env.GSC_SITE_URL);
export const isGA4Connected = () => googleAuthReady() && Boolean(process.env.GA4_PROPERTY_ID);
export const isGmailConnected = () => googleAuthReady() && Boolean(process.env.GMAIL_USER_EMAIL);

/**
 * Traffic days for the Briefing / Traffic page.
 *
 * Nightly cron writes the last 30 days of real GA4 sessions/users/etc into
 * `dashboard_traffic_days`; this function just reads whatever's there.
 * When GA4 isn't connected at all, the table holds the pre-seeded mock data.
 */
export async function fetchGA4Traffic30d() {
  return listTrafficDays(createSupabaseAdmin());
}

/**
 * Traffic sources — same pattern as above, backed by `dashboard_traffic_sources`.
 */
export async function fetchGA4Sources() {
  return listTrafficSources(createSupabaseAdmin());
}

export async function fetchGA4LandingPages() {
  return listLandingPages(createSupabaseAdmin());
}

/**
 * Keywords for the /keywords page.
 *
 * Preference order:
 *   1. Real GSC rollup (written nightly by /api/integrations/google/gsc/ingest)
 *   2. Mock `dashboard_seo_keywords` rows (pre-seeded demo data) — used
 *      while GSC is still inside its 48h processing window, or if the rollup
 *      hasn't been run yet.
 *
 * Returns an array of `KeywordRow`; always safe to render (never throws).
 */
export async function fetchGSCKeywords() {
  const admin = createSupabaseAdmin();
  if (isGSCConnected()) {
    const live = await listGSCQueries28d(admin, {
      siteUrl: process.env.GSC_SITE_URL,
      limit: 500,
    });
    if (live.length > 0) return live;
  }
  return listSeoKeywords(admin);
}

// -----------------------------------------------------------------------------
// OAuth plumbing — refresh-token flow.
//
// We exchange the long-lived refresh token for a short-lived access token
// every time we call a Google API. Access tokens live ~1h so caching in memory
// is possible later; for now the round-trip is cheap.
// -----------------------------------------------------------------------------

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Exchange the persisted refresh token for a fresh access token.
 * Throws if any env var is missing or Google rejects the refresh.
 * Caches the token in-memory until 60s before expiry.
 */
export async function getGoogleAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Google OAuth env missing (need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)',
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '<no body>');
    throw new Error(`Google token refresh failed: ${res.status} ${errText}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
    scope?: string;
  };

  cachedAccessToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

// -----------------------------------------------------------------------------
// GSC — Search Console top-queries call.
// Ref: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
// -----------------------------------------------------------------------------

/**
 * List all GSC properties the connected Google account has access to.
 * Useful as a sanity check — the `siteUrl` strings returned here are the
 * exact values GSC expects in searchAnalytics queries.
 *
 * URL-prefix properties look like `https://evari.cc/`.
 * Domain properties look like `sc-domain:evari.cc`.
 */
export async function fetchGSCSiteList(): Promise<
  Array<{ siteUrl: string; permissionLevel: string }>
> {
  const accessToken = await getGoogleAccessToken();
  const res = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '<no body>');
    throw new Error(`GSC sites.list failed: ${res.status} ${errText}`);
  }
  const json = (await res.json()) as {
    siteEntry?: Array<{ siteUrl: string; permissionLevel: string }>;
  };
  return json.siteEntry ?? [];
}

export type GSCQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GSCPageRow = {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GSCTopQueriesResult = {
  siteUrl: string;
  startDate: string;
  endDate: string;
  rows: GSCQueryRow[];
};

export type GSCTopPagesResult = {
  siteUrl: string;
  startDate: string;
  endDate: string;
  rows: GSCPageRow[];
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultGSCWindow(days: number): { startDate: string; endDate: string } {
  // GSC only has data up to ~2 days ago, so we end the window 2 days before
  // today to avoid empty trailing dates.
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

/**
 * Generic GSC searchAnalytics.query call with pagination.
 *
 * GSC caps each request at 25,000 rows. Call it with `startRow` to walk past
 * that limit — we stop as soon as a page returns fewer rows than requested,
 * or when we've collected `maxRows` total.
 */
async function gscSearchAnalytics(opts: {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions: Array<'query' | 'page' | 'country' | 'device' | 'date'>;
  maxRows: number;
}): Promise<
  Array<{
    keys: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>
> {
  const PAGE_SIZE = 25_000; // GSC API cap per call
  const accessToken = await getGoogleAccessToken();
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    opts.siteUrl,
  )}/searchAnalytics/query`;

  const out: Array<{
    keys: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }> = [];

  for (let startRow = 0; out.length < opts.maxRows; startRow += PAGE_SIZE) {
    const rowsLeft = opts.maxRows - out.length;
    const rowLimit = Math.min(PAGE_SIZE, rowsLeft);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: opts.startDate,
        endDate: opts.endDate,
        dimensions: opts.dimensions,
        rowLimit,
        startRow,
        dataState: 'all',
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '<no body>');
      throw new Error(`GSC searchAnalytics.query failed: ${res.status} ${errText}`);
    }

    const json = (await res.json()) as {
      rows?: Array<{
        keys: string[];
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
      }>;
    };
    const batch = json.rows ?? [];
    out.push(...batch);
    if (batch.length < rowLimit) break; // no more pages
  }

  return out;
}

/**
 * Pull top search queries for the configured GSC property.
 */
export async function fetchGSCTopQueries(opts: {
  days?: number;
  limit?: number;
} = {}): Promise<GSCTopQueriesResult> {
  const siteUrl = process.env.GSC_SITE_URL;
  if (!siteUrl) throw new Error('GSC_SITE_URL is not set');
  const days = opts.days ?? 28;
  const limit = opts.limit ?? 25;
  const { startDate, endDate } = defaultGSCWindow(days);

  const raw = await gscSearchAnalytics({
    siteUrl,
    startDate,
    endDate,
    dimensions: ['query'],
    maxRows: limit,
  });

  const rows: GSCQueryRow[] = raw.map((r) => ({
    query: r.keys[0] ?? '',
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
  return { siteUrl, startDate, endDate, rows };
}

/**
 * Pull top landing pages for the configured GSC property.
 */
export async function fetchGSCTopPages(opts: {
  days?: number;
  limit?: number;
} = {}): Promise<GSCTopPagesResult> {
  const siteUrl = process.env.GSC_SITE_URL;
  if (!siteUrl) throw new Error('GSC_SITE_URL is not set');
  const days = opts.days ?? 28;
  const limit = opts.limit ?? 25;
  const { startDate, endDate } = defaultGSCWindow(days);

  const raw = await gscSearchAnalytics({
    siteUrl,
    startDate,
    endDate,
    dimensions: ['page'],
    maxRows: limit,
  });

  const rows: GSCPageRow[] = raw.map((r) => ({
    page: r.keys[0] ?? '',
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
  return { siteUrl, startDate, endDate, rows };
}

/**
 * Nightly rollup: fetch queries + pages for the last 28 days and overwrite
 * the `dashboard_gsc_*_28d` tables. Returns counts for the ingest endpoint.
 */
export async function ingestGSCRollup(opts: {
  days?: number;
  maxQueries?: number;
  maxPages?: number;
} = {}): Promise<{
  siteUrl: string;
  startDate: string;
  endDate: string;
  queries: { fetched: number; written: number };
  pages: { fetched: number; written: number };
}> {
  const days = opts.days ?? 28;
  const maxQueries = opts.maxQueries ?? 1000;
  const maxPages = opts.maxPages ?? 500;

  const [queries, pages] = await Promise.all([
    fetchGSCTopQueries({ days, limit: maxQueries }),
    fetchGSCTopPages({ days, limit: maxPages }),
  ]);

  const supa = createSupabaseAdmin();
  if (!supa) {
    throw new Error(
      'Supabase admin client unavailable — set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL',
    );
  }
  const { siteUrl, startDate, endDate } = queries;

  // Queries: truncate scope of this site, then insert fresh rows.
  const del1 = await supa.from('dashboard_gsc_queries_28d').delete().eq('site_url', siteUrl);
  if (del1.error) throw new Error(`Clear queries rollup failed: ${del1.error.message}`);

  let writtenQueries = 0;
  if (queries.rows.length > 0) {
    const payload = queries.rows.map((r) => ({
      site_url: siteUrl,
      query: r.query,
      clicks: Math.round(r.clicks),
      impressions: Math.round(r.impressions),
      ctr: r.ctr,
      position: r.position,
      window_start: startDate,
      window_end: endDate,
    }));
    // Chunk insert in case of very long query lists
    const CHUNK = 500;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const ins = await supa.from('dashboard_gsc_queries_28d').insert(slice);
      if (ins.error) throw new Error(`Insert queries rollup failed: ${ins.error.message}`);
      writtenQueries += slice.length;
    }

    // Also upsert into dashboard_seo_keywords so the Keywords page + the SERP
    // ingest fallback can read a unified KeywordRow shape without re-joining
    // the raw rollup every time. Source of truth for intent/priority lives in
    // lib/dashboard/repository.ts.
    const keywordPayload = queries.rows.map((r) => {
      const impressions = Math.round(r.impressions);
      const clicks = Math.round(r.clicks);
      return {
        id: `gsc:${r.query}`,
        payload: {
          id: `gsc:${r.query}`,
          query: r.query,
          impressions,
          clicks,
          ctr: r.ctr,
          position: r.position,
          positionDelta7d: 0, // requires day-level history; left at 0 for now
          intent: inferKeywordIntent(r.query),
          priority: inferKeywordPriority(impressions, r.position),
        },
      };
    });
    for (let i = 0; i < keywordPayload.length; i += CHUNK) {
      const slice = keywordPayload.slice(i, i + CHUNK);
      const up = await supa.from('dashboard_seo_keywords').upsert(slice, { onConflict: 'id' });
      if (up.error) throw new Error(`Upsert dashboard_seo_keywords failed: ${up.error.message}`);
    }
  }

  // Pages: same dance.
  const del2 = await supa.from('dashboard_gsc_pages_28d').delete().eq('site_url', siteUrl);
  if (del2.error) throw new Error(`Clear pages rollup failed: ${del2.error.message}`);

  let writtenPages = 0;
  if (pages.rows.length > 0) {
    const payload = pages.rows.map((r) => ({
      site_url: siteUrl,
      page: r.page,
      clicks: Math.round(r.clicks),
      impressions: Math.round(r.impressions),
      ctr: r.ctr,
      position: r.position,
      window_start: startDate,
      window_end: endDate,
    }));
    const CHUNK = 500;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const ins = await supa.from('dashboard_gsc_pages_28d').insert(slice);
      if (ins.error) throw new Error(`Insert pages rollup failed: ${ins.error.message}`);
      writtenPages += slice.length;
    }
  }

  return {
    siteUrl,
    startDate,
    endDate,
    queries: { fetched: queries.rows.length, written: writtenQueries },
    pages: { fetched: pages.rows.length, written: writtenPages },
  };
}

// -----------------------------------------------------------------------------
// GA4 — Google Analytics Data API v1beta.
// Ref: https://developers.google.com/analytics/devguides/reporting/data/v1
// -----------------------------------------------------------------------------

function ga4Endpoint(propertyId: string): string {
  return `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
}

function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultGA4Window(days: number): { startDate: string; endDate: string } {
  // GA4 processes data quickly; yesterday is almost always complete.
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: isoDateUTC(start), endDate: isoDateUTC(end) };
}

interface GA4ReportRequest {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  dimensions?: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  limit?: number;
  orderBys?: Array<{
    desc?: boolean;
    dimension?: { dimensionName: string };
    metric?: { metricName: string };
  }>;
}

interface GA4ReportRow {
  dimensionValues: Array<{ value: string }>;
  metricValues: Array<{ value: string }>;
}

interface GA4ReportResponse {
  rows?: GA4ReportRow[];
  dimensionHeaders?: Array<{ name: string }>;
  metricHeaders?: Array<{ name: string; type: string }>;
}

async function runGA4Report(
  propertyId: string,
  body: GA4ReportRequest,
): Promise<GA4ReportResponse> {
  const accessToken = await getGoogleAccessToken();
  const res = await fetch(ga4Endpoint(propertyId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '<no body>');
    throw new Error(`GA4 runReport failed: ${res.status} ${errText.slice(0, 400)}`);
  }
  return (await res.json()) as GA4ReportResponse;
}

export interface GA4TrafficDay {
  date: string; // YYYY-MM-DD
  sessions: number;
  users: number;
  newUsers: number;
  engagedSessions: number;
  engagementRate: number; // 0-1
  events: number;
  bounceRate: number; // 0-1
  avgDurationSec: number;
  conversions: number;
}

export interface GA4SourceRow {
  source: string;
  medium: string;
  sessions: number;
  conversions: number;
  conversionRate: number;
}

export interface GA4PageRow {
  pagePath: string;
  pageTitle: string;
  views: number;
  sessions: number;
  users: number;
  bounceRate: number;
  avgDurationSec: number;
  conversions: number;
}

export interface GA4GeoRow {
  country: string;
  countryCode: string;
  region: string;
  sessions: number;
  users: number;
  conversions: number;
}

export interface GA4ChannelRow {
  channel: string;
  sessions: number;
  users: number;
  newUsers: number;
  engagedSessions: number;
  conversions: number;
}

export interface GA4CityRow {
  city: string;
  country: string;
  countryCode: string;
  sessions: number;
  users: number;
}

export interface GA4LanguageRow {
  language: string;
  sessions: number;
  users: number;
}

export interface GA4EventRow {
  eventName: string;
  eventCount: number;
  users: number;
}

export interface GA4DeviceRow {
  device: string; // mobile | desktop | tablet | smart_tv | ...
  sessions: number;
  users: number;
  newUsers: number;
  engagedSessions: number;
}

export interface GA4DemographicRow {
  gender: string;
  ageBracket: string;
  users: number;
  sessions: number;
}

function ga4PropertyId(): string {
  const id = process.env.GA4_PROPERTY_ID?.trim();
  if (!id) throw new Error('GA4_PROPERTY_ID is not set');
  return id;
}

export async function fetchGA4TrafficDays(
  days = 30,
): Promise<{
  propertyId: string;
  startDate: string;
  endDate: string;
  rows: GA4TrafficDay[];
}> {
  const propertyId = ga4PropertyId();
  const { startDate, endDate } = defaultGA4Window(days);
  // GA4 caps a single runReport at 100k rows, and date dims return one row
  // per day — safe up to ~270 years. We don't worry about pagination.
  const report = await runGA4Report(propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'newUsers' },
      { name: 'engagedSessions' },
      { name: 'engagementRate' },
      { name: 'eventCount' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'conversions' },
    ],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
    limit: Math.max(days, 100),
  });

  const rows: GA4TrafficDay[] = (report.rows ?? []).map((row) => {
    const raw = row.dimensionValues[0]?.value ?? ''; // YYYYMMDD
    const date = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
    return {
      date,
      sessions: parseInt(row.metricValues[0]?.value ?? '0', 10) || 0,
      users: parseInt(row.metricValues[1]?.value ?? '0', 10) || 0,
      newUsers: parseInt(row.metricValues[2]?.value ?? '0', 10) || 0,
      engagedSessions: parseInt(row.metricValues[3]?.value ?? '0', 10) || 0,
      engagementRate: parseFloat(row.metricValues[4]?.value ?? '0') || 0,
      events: parseInt(row.metricValues[5]?.value ?? '0', 10) || 0,
      bounceRate: parseFloat(row.metricValues[6]?.value ?? '0') || 0,
      avgDurationSec: Math.round(parseFloat(row.metricValues[7]?.value ?? '0') || 0),
      conversions: Math.round(parseFloat(row.metricValues[8]?.value ?? '0') || 0),
    };
  });
  return { propertyId, startDate, endDate, rows };
}

export async function fetchGA4Sources28d(
  days = 28,
  limit = 50,
): Promise<{
  propertyId: string;
  startDate: string;
  endDate: string;
  rows: GA4SourceRow[];
}> {
  const propertyId = ga4PropertyId();
  const { startDate, endDate } = defaultGA4Window(days);
  const report = await runGA4Report(propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
    metrics: [{ name: 'sessions' }, { name: 'conversions' }],
    orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
    limit,
  });

  const rows: GA4SourceRow[] = (report.rows ?? []).map((row) => {
    const sessions = parseInt(row.metricValues[0]?.value ?? '0', 10) || 0;
    const conversions = Math.round(parseFloat(row.metricValues[1]?.value ?? '0') || 0);
    return {
      source: row.dimensionValues[0]?.value ?? '(not set)',
      medium: row.dimensionValues[1]?.value ?? '(not set)',
      sessions,
      conversions,
      conversionRate: sessions > 0 ? conversions / sessions : 0,
    };
  });
  return { propertyId, startDate, endDate, rows };
}

export async function fetchGA4Pages28d(
  days = 28,
  limit = 100,
): Promise<{
  propertyId: string;
  startDate: string;
  endDate: string;
  rows: GA4PageRow[];
}> {
  const propertyId = ga4PropertyId();
  const { startDate, endDate } = defaultGA4Window(days);
  const report = await runGA4Report(propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'conversions' },
    ],
    orderBys: [{ desc: true, metric: { metricName: 'screenPageViews' } }],
    limit,
  });

  const rows: GA4PageRow[] = (report.rows ?? []).map((row) => ({
    pagePath: row.dimensionValues[0]?.value ?? '/',
    pageTitle: row.dimensionValues[1]?.value ?? '',
    views: parseInt(row.metricValues[0]?.value ?? '0', 10) || 0,
    sessions: parseInt(row.metricValues[1]?.value ?? '0', 10) || 0,
    users: parseInt(row.metricValues[2]?.value ?? '0', 10) || 0,
    bounceRate: parseFloat(row.metricValues[3]?.value ?? '0') || 0,
    avgDurationSec: Math.round(parseFloat(row.metricValues[4]?.value ?? '0') || 0),
    conversions: Math.round(parseFloat(row.metricValues[5]?.value ?? '0') || 0),
  }));
  return { propertyId, startDate, endDate, rows };
}

export async function fetchGA4Channels28d(
  days = 28,
  limit = 20,
): Promise<{
  propertyId: string;
  startDate: string;
  endDate: string;
  rows: GA4ChannelRow[];
}> {
  const propertyId = ga4PropertyId();
  const { startDate, endDate } = defaultGA4Window(days);
  const report = await runGA4Report(propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'newUsers' },
      { name: 'engagedSessions' },
      { name: 'conversions' },
    ],
    orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
    limit,
  });
  const rows: GA4ChannelRow[] = (report.rows ?? []).map((row) => ({
    channel: row.dimensionValues[0]?.value ?? '(unassigned)',
    sessions: parseInt(row.metricValues[0]?.value ?? '0', 10) || 0,
    users: parseInt(row.metricValues[1]?.value ?? '0', 10) || 0,
    newUsers: parseInt(row.metricValues[2]?.value ?? '0', 10) || 0,
    engagedSessions: parseInt(row.metricValues[3]?.value ?? '0', 10) || 0,
    conversions: Math.round(parseFloat(row.metricValues[4]?.value ?? '0') || 0),
  }));
  return { propertyId, startDate, endDate, rows };
}

export async function fetchGA4Cities28d(
  days = 28,
  limit = 200,
): Promise<{
  propertyId: string;
  startDate: string;
  endDate: string;
  rows: GA4CityRow[];
}> {
  const propertyId = ga4PropertyId();
  const { startDate, endDate } = defaultGA4Window(days);
  const report = await runGA4Report(propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'city' }, { name: 'country' }, { name: 'countryId' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
    limit,
  });
  const rows: GA4CityRow[] = (report.rows ?? []).map((row) => ({
    city: row.dimensionValues[0]?.value ?? '(not set)',
    country: row.dimensionValues[1]?.value ?? '',
    countryCode: row.dimensionValues[2]?.value ?? '',
    sessions: parseInt(row.metricValues[0]?.value ?? '0', 10) || 0,
    users: parseInt(row.metricValues[1]?.value ?? '0', 10) || 0,
  }));
  return { propertyId, startDate, endDate, rows };
}

export async function fetchGA4Languages28d(
  days = 28,
  limit = 20,
): Promise<{
  propertyId: string;
  startDate: string;
  endDate: string;
  rows: GA4LanguageRow[];
}> {
  const propertyId = ga4PropertyId();
  const { startDate, endDate } = defaultGA4Window(days);
  const report = await runGA4Report(propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'language' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
    limit,
  });
  const rows: GA4LanguageRow[] = (report.rows ?? []).map((row) => ({
    language: row.dimensionValues[0]?.value ?? '(unknown)',
    sessions: parseInt(row.metricValues[0]?.value ?? '0', 10) || 0,
    users: parseInt(row.metricValues[1]?.value ?? '0', 10) || 0,
  }));
  return { propertyId, startDate, endDate, rows };
}

export async function fetchGA4Events28d(
  days = 28,
  limit = 30,
): Promise<{
  propertyId: string;
  startDate: string;
  endDate: string;
  rows: GA4EventRow[];
}> {
  const propertyId = ga4PropertyId();
  const { startDate, endDate } = defaultGA4Window(days);
  const report = await runGA4Report(propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    orderBys: [{ desc: true, metric: { metricName: 'eventCount' } }],
    limit,
  });
  const rows: GA4EventRow[] = (report.rows ?? []).map((row) => ({
    eventName: row.dimensionValues[0]?.value ?? '(unknown)',
    eventCount: parseInt(row.metricValues[0]?.value ?? '0', 10) || 0,
    users: parseInt(row.metricValues[1]?.value ?? '0', 10) || 0,
  }));
  return { propertyId, startDate, endDate, rows };
}

export async function fetchGA4Geo28d(
  days = 28,
  limit = 250,
): Promise<{
  propertyId: string;
  startDate: string;
  endDate: string;
  rows: GA4GeoRow[];
}> {
  const propertyId = ga4PropertyId();
  const { startDate, endDate } = defaultGA4Window(days);
  const report = await runGA4Report(propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'country' }, { name: 'countryId' }, { name: 'region' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }],
    orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
    limit,
  });

  const rows: GA4GeoRow[] = (report.rows ?? []).map((row) => ({
    country: row.dimensionValues[0]?.value ?? '(not set)',
    countryCode: row.dimensionValues[1]?.value ?? '',
    region: row.dimensionValues[2]?.value ?? '',
    sessions: parseInt(row.metricValues[0]?.value ?? '0', 10) || 0,
    users: parseInt(row.metricValues[1]?.value ?? '0', 10) || 0,
    conversions: Math.round(parseFloat(row.metricValues[2]?.value ?? '0') || 0),
  }));
  return { propertyId, startDate, endDate, rows };
}

export async function fetchGA4Devices28d(
  days = 28,
  limit = 10,
): Promise<{
  propertyId: string;
  startDate: string;
  endDate: string;
  rows: GA4DeviceRow[];
}> {
  const propertyId = ga4PropertyId();
  const { startDate, endDate } = defaultGA4Window(days);
  const report = await runGA4Report(propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'newUsers' },
      { name: 'engagedSessions' },
    ],
    orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
    limit,
  });
  const rows: GA4DeviceRow[] = (report.rows ?? []).map((row) => ({
    device: row.dimensionValues[0]?.value ?? '(unknown)',
    sessions: parseInt(row.metricValues[0]?.value ?? '0', 10) || 0,
    users: parseInt(row.metricValues[1]?.value ?? '0', 10) || 0,
    newUsers: parseInt(row.metricValues[2]?.value ?? '0', 10) || 0,
    engagedSessions: parseInt(row.metricValues[3]?.value ?? '0', 10) || 0,
  }));
  return { propertyId, startDate, endDate, rows };
}

/**
 * Gender + age bracket from GA4. Requires Google Signals — without it GA4
 * returns zero rows and the UI falls back to an empty-state explanation.
 * We swallow common "Signals not enabled" errors so the nightly ingest
 * keeps running even when the property is freshly provisioned.
 */
export async function fetchGA4Demographics28d(
  days = 28,
  limit = 50,
): Promise<{
  propertyId: string;
  startDate: string;
  endDate: string;
  rows: GA4DemographicRow[];
  signalsEnabled: boolean;
}> {
  const propertyId = ga4PropertyId();
  const { startDate, endDate } = defaultGA4Window(days);
  try {
    const report = await runGA4Report(propertyId, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'userGender' }, { name: 'userAgeBracket' }],
      metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
      orderBys: [{ desc: true, metric: { metricName: 'totalUsers' } }],
      limit,
    });
    const rows: GA4DemographicRow[] = (report.rows ?? []).map((row) => ({
      gender: (row.dimensionValues[0]?.value ?? 'unknown').toLowerCase(),
      ageBracket: row.dimensionValues[1]?.value ?? 'unknown',
      users: parseInt(row.metricValues[0]?.value ?? '0', 10) || 0,
      sessions: parseInt(row.metricValues[1]?.value ?? '0', 10) || 0,
    }));
    return { propertyId, startDate, endDate, rows, signalsEnabled: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // GA4 returns 403 / "permission" style errors when Signals is off. Treat as
    // "no data" so the caller can show the empty state hint.
    if (
      msg.includes('userGender') ||
      msg.includes('userAgeBracket') ||
      msg.includes('permission') ||
      msg.includes('Signals')
    ) {
      return { propertyId, startDate, endDate, rows: [], signalsEnabled: false };
    }
    throw err;
  }
}

/**
 * Nightly GA4 rollup. Upserts into:
 *   - dashboard_traffic_days        (one row per day, up to 365d)
 *   - dashboard_traffic_sources     (truncated + reinserted)
 *   - dashboard_ga4_pages_28d       (truncated + reinserted per property)
 *   - dashboard_ga4_geo_28d         (truncated + reinserted per property)
 *   - dashboard_ga4_channels_28d    (truncated + reinserted per property)
 *   - dashboard_ga4_cities_28d      (truncated + reinserted per property)
 *   - dashboard_ga4_languages_28d   (truncated + reinserted per property)
 *   - dashboard_ga4_events_28d      (truncated + reinserted per property)
 *   - dashboard_ga4_devices_28d     (truncated + reinserted per property)
 *   - dashboard_ga4_demographics_28d (truncated + reinserted; may be empty
 *     if Google Signals is not enabled on the property)
 *
 * Default window is 365 days for the day-level trend (used by the Traffic
 * page's 12-month KPI sparklines). The breakdown widgets all use the last 28d
 * so they match what GA4 shows out of the box.
 *
 * Also writes a row to `dashboard_ga4_sync_log` so `/performance` / `/traffic`
 * can show "last updated" UI.
 */
export async function ingestGA4Rollup(opts: {
  days?: number;
  maxSources?: number;
  maxPages?: number;
  maxGeo?: number;
  maxChannels?: number;
  maxCities?: number;
  maxLanguages?: number;
  maxEvents?: number;
  maxDevices?: number;
  maxDemographics?: number;
} = {}): Promise<{
  propertyId: string;
  startDate: string;
  endDate: string;
  days: { fetched: number; written: number };
  sources: { fetched: number; written: number };
  pages: { fetched: number; written: number };
  geo: { fetched: number; written: number };
  channels: { fetched: number; written: number };
  cities: { fetched: number; written: number };
  languages: { fetched: number; written: number };
  events: { fetched: number; written: number };
  devices: { fetched: number; written: number };
  demographics: { fetched: number; written: number; signalsEnabled: boolean };
  durationMs: number;
}> {
  const startedAt = Date.now();
  const days = opts.days ?? 365;
  const supa = createSupabaseAdmin();
  if (!supa) {
    throw new Error(
      'Supabase admin client unavailable — set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL',
    );
  }

  // Fan out every GA4 report in parallel — each is its own API call.
  const [traffic, sources, pages, geo, channels, cities, languages, events, devices, demographics] =
    await Promise.all([
      fetchGA4TrafficDays(days),
      fetchGA4Sources28d(28, opts.maxSources ?? 50),
      fetchGA4Pages28d(28, opts.maxPages ?? 100),
      fetchGA4Geo28d(28, opts.maxGeo ?? 250),
      fetchGA4Channels28d(28, opts.maxChannels ?? 20),
      fetchGA4Cities28d(28, opts.maxCities ?? 200),
      fetchGA4Languages28d(28, opts.maxLanguages ?? 20),
      fetchGA4Events28d(28, opts.maxEvents ?? 30),
      fetchGA4Devices28d(28, opts.maxDevices ?? 10),
      fetchGA4Demographics28d(28, opts.maxDemographics ?? 50),
    ]);

  const propertyId = traffic.propertyId;

  // 1. Traffic days — upsert by day (accumulates historical).
  let writtenDays = 0;
  if (traffic.rows.length > 0) {
    const payload = traffic.rows.map((r) => ({
      day: r.date,
      sessions: r.sessions,
      users: r.users,
      new_users: r.newUsers,
      engaged_sessions: r.engagedSessions,
      engagement_rate: r.engagementRate,
      events: r.events,
      bounce_rate: r.bounceRate,
      avg_duration_sec: r.avgDurationSec,
      conversions: r.conversions,
    }));
    const up = await supa.from('dashboard_traffic_days').upsert(payload, { onConflict: 'day' });
    if (up.error) throw new Error(`GA4 days upsert failed: ${up.error.message}`);
    writtenDays = payload.length;
  }

  // 2. Sources — truncate + reinsert.
  const delSources = await supa
    .from('dashboard_traffic_sources')
    .delete()
    .neq('id', -1); // match-all
  if (delSources.error) throw new Error(`GA4 sources clear failed: ${delSources.error.message}`);

  let writtenSources = 0;
  if (sources.rows.length > 0) {
    const payload = sources.rows.map((r, idx) => ({
      sort_order: idx + 1,
      source: r.source,
      medium: r.medium,
      sessions: r.sessions,
      conversions: r.conversions,
      conversion_rate: r.conversionRate,
    }));
    const ins = await supa.from('dashboard_traffic_sources').insert(payload);
    if (ins.error) throw new Error(`GA4 sources insert failed: ${ins.error.message}`);
    writtenSources = payload.length;
  }

  // 3. Pages rollup — delete-then-insert scoped to this property.
  const delPages = await supa
    .from('dashboard_ga4_pages_28d')
    .delete()
    .eq('property_id', propertyId);
  if (delPages.error) throw new Error(`GA4 pages clear failed: ${delPages.error.message}`);

  let writtenPages = 0;
  if (pages.rows.length > 0) {
    // GA4 returns one row per (pagePath, pageTitle) — so the same path can
    // appear with different titles. Collapse to the best-viewed variant.
    const byPath = new Map<string, GA4PageRow>();
    for (const r of pages.rows) {
      const prev = byPath.get(r.pagePath);
      if (!prev || r.views > prev.views) byPath.set(r.pagePath, r);
    }
    const payload = Array.from(byPath.values()).map((r) => ({
      property_id: propertyId,
      page_path: r.pagePath,
      page_title: r.pageTitle,
      views: r.views,
      sessions: r.sessions,
      users: r.users,
      bounce_rate: r.bounceRate,
      avg_duration_sec: r.avgDurationSec,
      conversions: r.conversions,
      window_start: pages.startDate,
      window_end: pages.endDate,
    }));
    const ins = await supa.from('dashboard_ga4_pages_28d').insert(payload);
    if (ins.error) throw new Error(`GA4 pages insert failed: ${ins.error.message}`);
    writtenPages = payload.length;
  }

  // 4. Geo rollup.
  const delGeo = await supa
    .from('dashboard_ga4_geo_28d')
    .delete()
    .eq('property_id', propertyId);
  if (delGeo.error) throw new Error(`GA4 geo clear failed: ${delGeo.error.message}`);

  let writtenGeo = 0;
  if (geo.rows.length > 0) {
    // Dedupe in case GA4 returns (country, '') and (country, 'region') variants
    const seen = new Set<string>();
    const payload: Array<Record<string, unknown>> = [];
    for (const r of geo.rows) {
      const key = `${r.country}|${r.region}`;
      if (seen.has(key)) continue;
      seen.add(key);
      payload.push({
        property_id: propertyId,
        country: r.country,
        country_code: r.countryCode,
        region: r.region,
        sessions: r.sessions,
        users: r.users,
        conversions: r.conversions,
        window_start: geo.startDate,
        window_end: geo.endDate,
      });
    }
    const ins = await supa.from('dashboard_ga4_geo_28d').insert(payload);
    if (ins.error) throw new Error(`GA4 geo insert failed: ${ins.error.message}`);
    writtenGeo = payload.length;
  }

  // 5. Channels.
  const delChannels = await supa
    .from('dashboard_ga4_channels_28d')
    .delete()
    .eq('property_id', propertyId);
  if (delChannels.error) throw new Error(`GA4 channels clear failed: ${delChannels.error.message}`);
  let writtenChannels = 0;
  if (channels.rows.length > 0) {
    const payload = channels.rows.map((r, idx) => ({
      property_id: propertyId,
      channel: r.channel,
      sessions: r.sessions,
      users: r.users,
      new_users: r.newUsers,
      engaged_sessions: r.engagedSessions,
      conversions: r.conversions,
      window_start: channels.startDate,
      window_end: channels.endDate,
      sort_order: idx + 1,
    }));
    const ins = await supa.from('dashboard_ga4_channels_28d').insert(payload);
    if (ins.error) throw new Error(`GA4 channels insert failed: ${ins.error.message}`);
    writtenChannels = payload.length;
  }

  // 6. Cities.
  const delCities = await supa
    .from('dashboard_ga4_cities_28d')
    .delete()
    .eq('property_id', propertyId);
  if (delCities.error) throw new Error(`GA4 cities clear failed: ${delCities.error.message}`);
  let writtenCities = 0;
  if (cities.rows.length > 0) {
    // Composite PK is (property_id, city, country_code) — dedupe to avoid conflicts.
    const seen = new Set<string>();
    const payload: Array<Record<string, unknown>> = [];
    cities.rows.forEach((r, idx) => {
      const key = `${r.city}|${r.countryCode}`;
      if (seen.has(key)) return;
      seen.add(key);
      payload.push({
        property_id: propertyId,
        city: r.city,
        country: r.country,
        country_code: r.countryCode,
        sessions: r.sessions,
        users: r.users,
        window_start: cities.startDate,
        window_end: cities.endDate,
        sort_order: idx + 1,
      });
    });
    if (payload.length > 0) {
      const ins = await supa.from('dashboard_ga4_cities_28d').insert(payload);
      if (ins.error) throw new Error(`GA4 cities insert failed: ${ins.error.message}`);
      writtenCities = payload.length;
    }
  }

  // 7. Languages.
  const delLanguages = await supa
    .from('dashboard_ga4_languages_28d')
    .delete()
    .eq('property_id', propertyId);
  if (delLanguages.error) throw new Error(`GA4 languages clear failed: ${delLanguages.error.message}`);
  let writtenLanguages = 0;
  if (languages.rows.length > 0) {
    const seen = new Set<string>();
    const payload: Array<Record<string, unknown>> = [];
    languages.rows.forEach((r, idx) => {
      if (seen.has(r.language)) return;
      seen.add(r.language);
      payload.push({
        property_id: propertyId,
        language: r.language,
        sessions: r.sessions,
        users: r.users,
        window_start: languages.startDate,
        window_end: languages.endDate,
        sort_order: idx + 1,
      });
    });
    if (payload.length > 0) {
      const ins = await supa.from('dashboard_ga4_languages_28d').insert(payload);
      if (ins.error) throw new Error(`GA4 languages insert failed: ${ins.error.message}`);
      writtenLanguages = payload.length;
    }
  }

  // 8. Events.
  const delEvents = await supa
    .from('dashboard_ga4_events_28d')
    .delete()
    .eq('property_id', propertyId);
  if (delEvents.error) throw new Error(`GA4 events clear failed: ${delEvents.error.message}`);
  let writtenEvents = 0;
  if (events.rows.length > 0) {
    const seen = new Set<string>();
    const payload: Array<Record<string, unknown>> = [];
    events.rows.forEach((r, idx) => {
      if (seen.has(r.eventName)) return;
      seen.add(r.eventName);
      payload.push({
        property_id: propertyId,
        event_name: r.eventName,
        event_count: r.eventCount,
        users: r.users,
        window_start: events.startDate,
        window_end: events.endDate,
        sort_order: idx + 1,
      });
    });
    if (payload.length > 0) {
      const ins = await supa.from('dashboard_ga4_events_28d').insert(payload);
      if (ins.error) throw new Error(`GA4 events insert failed: ${ins.error.message}`);
      writtenEvents = payload.length;
    }
  }

  // Helper: does this Supabase error indicate the table just doesn't exist
  // yet? PostgREST surfaces it as "Could not find the table '...' in the
  // schema cache" (error code PGRST205); Postgres surfaces it as
  // "relation ... does not exist" (42P01). We degrade gracefully for both
  // so the first ingest after adding a migration doesn't hard-fail.
  const isTableMissing = (err: { message?: string; code?: string } | null): boolean => {
    if (!err) return false;
    if (err.code === 'PGRST205' || err.code === '42P01') return true;
    const msg = err.message ?? '';
    return (
      /relation .* does not exist/i.test(msg) ||
      /could not find the table/i.test(msg) ||
      /schema cache/i.test(msg)
    );
  };

  // 9. Devices. Truncate + reinsert per property.
  let writtenDevices = 0;
  let devicesMissing = false;
  const delDevices = await supa
    .from('dashboard_ga4_devices_28d')
    .delete()
    .eq('property_id', propertyId);
  if (delDevices.error) {
    if (isTableMissing(delDevices.error)) {
      devicesMissing = true;
      console.warn(
        '[ga4 ingest] dashboard_ga4_devices_28d not found — run `npm run db:migrate:ga4-devices-demo` to create it.',
      );
    } else {
      throw new Error(`GA4 devices clear failed: ${delDevices.error.message}`);
    }
  }
  if (!devicesMissing && devices.rows.length > 0) {
    const payload = devices.rows.map((r, idx) => ({
      property_id: propertyId,
      device: r.device,
      sessions: r.sessions,
      users: r.users,
      new_users: r.newUsers,
      engaged_sessions: r.engagedSessions,
      window_start: devices.startDate,
      window_end: devices.endDate,
      sort_order: idx + 1,
    }));
    const ins = await supa.from('dashboard_ga4_devices_28d').insert(payload);
    if (ins.error) {
      if (!isTableMissing(ins.error)) {
        throw new Error(`GA4 devices insert failed: ${ins.error.message}`);
      }
    } else {
      writtenDevices = payload.length;
    }
  }

  // 10. Demographics (may be empty if Google Signals is off).
  let writtenDemographics = 0;
  let demoMissing = false;
  const delDemo = await supa
    .from('dashboard_ga4_demographics_28d')
    .delete()
    .eq('property_id', propertyId);
  if (delDemo.error) {
    if (isTableMissing(delDemo.error)) {
      demoMissing = true;
      console.warn(
        '[ga4 ingest] dashboard_ga4_demographics_28d not found — run `npm run db:migrate:ga4-devices-demo` to create it.',
      );
    } else {
      throw new Error(`GA4 demographics clear failed: ${delDemo.error.message}`);
    }
  }
  if (!demoMissing && demographics.rows.length > 0) {
    const seen = new Set<string>();
    const payload: Array<Record<string, unknown>> = [];
    demographics.rows.forEach((r, idx) => {
      const key = `${r.gender}|${r.ageBracket}`;
      if (seen.has(key)) return;
      seen.add(key);
      payload.push({
        property_id: propertyId,
        gender: r.gender,
        age_bracket: r.ageBracket,
        users: r.users,
        sessions: r.sessions,
        window_start: demographics.startDate,
        window_end: demographics.endDate,
        sort_order: idx + 1,
      });
    });
    if (payload.length > 0) {
      const ins = await supa.from('dashboard_ga4_demographics_28d').insert(payload);
      if (ins.error) {
        if (!isTableMissing(ins.error)) {
          throw new Error(`GA4 demographics insert failed: ${ins.error.message}`);
        }
      } else {
        writtenDemographics = payload.length;
      }
    }
  }

  const durationMs = Date.now() - startedAt;

  // Sync log.
  await supa.from('dashboard_ga4_sync_log').insert({
    property_id: propertyId,
    window_start: traffic.startDate,
    window_end: traffic.endDate,
    rows_days: writtenDays,
    rows_sources: writtenSources,
    rows_pages: writtenPages,
    rows_geo: writtenGeo,
    duration_ms: durationMs,
    ok: true,
  });

  return {
    propertyId,
    startDate: traffic.startDate,
    endDate: traffic.endDate,
    days: { fetched: traffic.rows.length, written: writtenDays },
    sources: { fetched: sources.rows.length, written: writtenSources },
    pages: { fetched: pages.rows.length, written: writtenPages },
    geo: { fetched: geo.rows.length, written: writtenGeo },
    channels: { fetched: channels.rows.length, written: writtenChannels },
    cities: { fetched: cities.rows.length, written: writtenCities },
    languages: { fetched: languages.rows.length, written: writtenLanguages },
    events: { fetched: events.rows.length, written: writtenEvents },
    devices: { fetched: devices.rows.length, written: writtenDevices },
    demographics: {
      fetched: demographics.rows.length,
      written: writtenDemographics,
      signalsEnabled: demographics.signalsEnabled,
    },
    durationMs,
  };
}

export async function fetchGmailThreads() {
  if (!isGmailConnected()) return listThreads(createSupabaseAdmin());
  throw new Error('Gmail live mode not yet implemented');
}

export async function sendGmailReply(args: {
  threadId: string;
  toEmail: string;
  subject: string;
  bodyMarkdown: string;
}) {
  if (!isGmailConnected()) {
    return { ok: true, dryRun: true, ...args };
  }
  throw new Error('Gmail live mode not yet implemented');
}
