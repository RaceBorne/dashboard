/**
 * DataForSEO adapters — backlinks, SERP tracking, keyword research, on-page audit.
 *
 * Requires DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD env vars (HTTP Basic Auth).
 * Supports five products:
 *   - backlinks: summary, individual links, referring domains
 *   - serp: keyword position tracking with history
 *   - keywords: search volume + keyword difficulty data
 *   - onpage: per-page crawl audit + issue discovery
 *
 * Mirrors the Klaviyo ingest pattern exactly:
 *   - isDataForSeoConnected() to check env vars
 *   - getDataForSeoStatus() to fetch last sync logs + per-product status
 *   - ingestBacklinks/ingestSerp/ingestKeywordData/ingestOnpage to fetch and upsert
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

const DATAFORSEO_API_BASE = 'https://api.dataforseo.com/v3';

// ============================================================================
// Types
// ============================================================================

interface DataForSeoResponse<T> {
  status_code: number;
  status_message: string;
  cost: number;
  tasks: Array<{
    id: string;
    status_code: number;
    status_message: string;
    result?: T[];
    cost: number;
  }>;
}

interface BacklinksLiveResult {
  rank?: number;
  backlinks?: number;
  backlinks_nofollow?: number;
  referring_domains?: number;
  referring_main_domains?: number;
  referring_ips?: number;
  referring_subnets?: number;
  top_anchors?: Array<{ anchor: string; backlinks: number }>;
}

// /backlinks/backlinks/live wraps rows under `items`, not `backlinks`.
interface BacklinksListResult {
  items?: Array<{
    url_from: string;
    url_to: string;
    domain_from: string;
    domain_to: string;
    anchor?: string;
    nofollow?: boolean;
    is_broken?: boolean;
    page_from_rank?: number;
    domain_from_rank?: number;
    first_seen?: string;
    last_seen?: string;
  }>;
}

// /backlinks/referring_domains/live wraps rows under `items`. Each item names
// the domain as `domain` (not `domain_from`) and uses `lost_date` for the
// "no longer active" timestamp (last_seen is not present at the domain level).
interface ReferringDomainsResult {
  items?: Array<{
    domain: string;
    backlinks?: number;
    first_seen?: string;
    lost_date?: string;
    rank?: number;
  }>;
}

interface SerpLiveResult {
  items?: Array<{
    domain: string;
    url: string;
    title: string;
    position: number;
    serp_features?: string[];
  }>;
  total_results?: number;
}

// /keywords_data/google_ads/search_volume/live returns `result` as a flat
// array where each element is a keyword — not wrapped in { keywords: [...] }.
interface KeywordDataSearchVolumeResult {
  keyword: string;
  search_volume?: number;
  cpc?: number;
  competition?: number;
  competition_level?: string;
  monthly_searches?: Array<{
    month: string;
    year: number;
    search_volume: number;
  }>;
}

interface KeywordDataDifficultyResult {
  items?: Array<{
    keyword: string;
    keyword_difficulty?: number;
  }>;
}

// /dataforseo_labs/google/ranked_keywords/live returns every keyword a given
// domain ranks for, with market data + the SERP element that made it rank.
// Shape is deeply nested — keyword facts live under `keyword_data`, position
// under `ranked_serp_element.serp_item`.
interface RankedKeywordsResult {
  items?: Array<{
    keyword_data?: {
      keyword: string;
      location_code?: number;
      language_code?: string;
      keyword_info?: {
        search_volume?: number;
        cpc?: number;
        competition?: number;
        competition_level?: string;
        monthly_searches?: Array<{ month: string; year: number; search_volume: number }>;
      };
      keyword_properties?: {
        keyword_difficulty?: number;
      };
      search_intent_info?: {
        main_intent?: string;
      };
    };
    ranked_serp_element?: {
      serp_item?: {
        type?: string;
        rank_group?: number;
        rank_absolute?: number;
        domain?: string;
        title?: string;
        url?: string;
        etv?: number;
      };
    };
  }>;
  total_count?: number;
}

interface OnPageInstantResult {
  items?: Array<{
    url: string;
    status_code?: number;
    fetch_time?: string;
    page_timing?: {
      time_to_interactive?: number;
      dom_complete?: number;
    };
    meta?: {
      title?: string;
      description?: string;
      canonical?: string;
    };
    h1?: string[];
    links?: {
      internal?: { total: number };
      external?: { total: number };
    };
    images?: { total: number };
    content?: {
      total_words?: number;
    };
    onpage_score?: number;
    checks?: Record<string, boolean>;
  }>;
}

export interface IngestResult {
  product: 'backlinks' | 'serp' | 'keywords' | 'onpage' | 'ranked_keywords';
  target?: string;
  costUsd: number;
  rowsWritten: number;
  durationMs: number;
}

export async function getDataForSeoStatus(): Promise<{
  connected: boolean;
  lastSyncs?: Record<
    string,
    { ranAt: string; durationMs: number; rowsWritten: number; costUsd: number; ok: boolean }
  >;
}> {
  if (!isDataForSeoConnected()) {
    return { connected: false };
  }

  const supa = createSupabaseAdmin();
  if (!supa) {
    return { connected: true };
  }

  // Fetch last sync per product
  const { data, error } = await supa
    .from('dashboard_dataforseo_sync_log')
    .select('product, ran_at, duration_ms, rows_written, cost_usd, ok')
    .order('ran_at', { ascending: false })
    .limit(100);

  if (error || !data) {
    return { connected: true };
  }

  const lastSyncs: Record<
    string,
    { ranAt: string; durationMs: number; rowsWritten: number; costUsd: number; ok: boolean }
  > = {};
  const seen = new Set<string>();

  for (const row of data) {
    if (!seen.has(row.product)) {
      lastSyncs[row.product] = {
        ranAt: row.ran_at,
        durationMs: row.duration_ms,
        rowsWritten: row.rows_written,
        costUsd: parseFloat(String(row.cost_usd || 0)),
        ok: row.ok,
      };
      seen.add(row.product);
    }
  }

  return { connected: true, lastSyncs };
}

// ============================================================================
// Connection Status
// ============================================================================

export function isDataForSeoConnected(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

// ============================================================================
// DataForSEO API Calls
// ============================================================================

async function dfsPost<T>(path: string, body: unknown[]): Promise<{ tasks: T[]; cost: number }> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error('DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are not set');
  }

  const auth = Buffer.from(`${login}:${password}`).toString('base64');
  const url = `${DATAFORSEO_API_BASE}${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const data = (await res.json()) as DataForSeoResponse<T>;

  if (data.status_code !== 20000) {
    throw new Error(`DataForSEO API ${path} failed: ${data.status_code} ${data.status_message}`);
  }

  if (data.tasks.length === 0) {
    throw new Error(`DataForSEO API ${path} returned no tasks`);
  }

  const task = data.tasks[0];
  if (task.status_code !== 20000) {
    throw new Error(`DataForSEO task ${path} failed: ${task.status_code} ${task.status_message}`);
  }

  return {
    tasks: (task.result ?? []) as T[],
    cost: data.cost,
  };
}

async function logSync(
  product: string,
  opts: { target?: string; costUsd: number; rowsWritten: number; durationMs: number; ok: boolean; error?: string },
): Promise<void> {
  const supa = createSupabaseAdmin();
  if (!supa) return;

  await supa.from('dashboard_dataforseo_sync_log').insert({
    product,
    target: opts.target,
    cost_usd: opts.costUsd,
    rows_written: opts.rowsWritten,
    duration_ms: opts.durationMs,
    ok: opts.ok,
    error: opts.error,
  });
}

// ============================================================================
// Business Listings (used by the Source Prospects agent)
// ============================================================================

export interface BusinessListing {
  title: string;
  url?: string;
  phone?: string;
  domain?: string;
  address?: string;
  rating?: { value?: number; votes_count?: number };
  category?: string;
  categoryIds?: string[];
  latitude?: number;
  longitude?: number;
  placeId?: string;
  cid?: string;
}

interface BusinessListingsLiveResult {
  items?: Array<{
    title?: string;
    url?: string;
    phone?: string;
    domain?: string;
    address?: string;
    rating?: { value?: number; votes_count?: number };
    category?: string;
    category_ids?: string[];
    latitude?: number;
    longitude?: number;
    place_id?: string;
    cid?: string;
  }>;
}

/**
 * Find business listings by keyword + location. Synchronous /live call.
 *
 * `description` is the Google-search-style keyword (e.g. "knee surgery clinic").
 * `locationName` is a DataForSEO location string (e.g. "United Kingdom",
 * "London, England, United Kingdom"). `limit` is capped at 500 by the API.
 */
export async function searchBusinessListings(opts: {
  description: string;
  locationName?: string;
  limit?: number;
  categories?: string[];
}): Promise<{ listings: BusinessListing[]; cost: number }> {
  const body: Record<string, unknown> = {
    description: opts.description,
    location_name: opts.locationName ?? 'United Kingdom',
    limit: Math.min(Math.max(opts.limit ?? 50, 1), 500),
  };
  if (opts.categories && opts.categories.length > 0) {
    body.categories = opts.categories;
  }
  const { tasks, cost } = await dfsPost<BusinessListingsLiveResult>(
    '/business_data/business_listings/search/live',
    [body],
  );
  const listings: BusinessListing[] = [];
  for (const t of tasks) {
    for (const it of t.items ?? []) {
      if (!it.title) continue;
      listings.push({
        title: it.title,
        url: it.url,
        phone: it.phone,
        domain: it.domain,
        address: it.address,
        rating: it.rating,
        category: it.category,
        categoryIds: it.category_ids,
        latitude: it.latitude,
        longitude: it.longitude,
        placeId: it.place_id,
        cid: it.cid,
      });
    }
  }
  return { listings, cost };
}

// ============================================================================
// Backlinks Ingest
// ============================================================================

export async function ingestBacklinks(opts: { targets: string[] }): Promise<IngestResult> {
  const startedAt = Date.now();
  let totalRowsWritten = 0;
  let totalCostUsd = 0;

  const supa = createSupabaseAdmin();
  if (!supa) {
    throw new Error(
      'Supabase admin client unavailable — set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL',
    );
  }

  try {
    for (const target of opts.targets) {
      // 1. Fetch backlinks summary
      const summaryRes = await dfsPost<BacklinksLiveResult>('/backlinks/summary/live', [
        {
          target,
          include_subdomains: true,
          internal_list_limit: 10,
        },
      ]);

      totalCostUsd += summaryRes.cost;
      const summaryData = summaryRes.tasks[0];

      if (summaryData) {
        const anchorTop10 = (summaryData.top_anchors ?? []).slice(0, 10).map((a) => ({
          anchor: a.anchor,
          backlinks: a.backlinks,
        }));

        const upRes = await supa.from('dashboard_dataforseo_backlinks_summary').upsert(
          {
            target,
            rank: summaryData.rank || 0,
            backlinks: summaryData.backlinks || 0,
            backlinks_nofollow: summaryData.backlinks_nofollow || 0,
            referring_domains: summaryData.referring_domains || 0,
            referring_main_domains: summaryData.referring_main_domains || 0,
            referring_ips: summaryData.referring_ips || 0,
            referring_subnets: summaryData.referring_subnets || 0,
            anchor_text_top10: anchorTop10,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: 'target' },
        );
        if (upRes.error) throw new Error(`Backlinks summary upsert failed: ${upRes.error.message}`);
        totalRowsWritten += 1;
      }

      // 2. Fetch individual backlinks (top 100)
      const backlinksRes = await dfsPost<BacklinksListResult>('/backlinks/backlinks/live', [
        {
          target,
          limit: 100,
          mode: 'as_is',
          backlinks_status_type: 'live',
          include_subdomains: true,
        },
      ]);

      totalCostUsd += backlinksRes.cost;
      const backlinksData = backlinksRes.tasks[0];

      if (backlinksData?.items && backlinksData.items.length > 0) {
        const rows = backlinksData.items.map((b) => ({
          target,
          url_from: b.url_from,
          url_to: b.url_to,
          domain_from: b.domain_from,
          domain_to: b.domain_to,
          anchor: b.anchor || null,
          is_nofollow: b.nofollow || false,
          is_broken: b.is_broken || false,
          page_from_rank: b.page_from_rank || null,
          domain_from_rank: b.domain_from_rank || null,
          first_seen: b.first_seen ? new Date(b.first_seen).toISOString() : null,
          last_seen: b.last_seen ? new Date(b.last_seen).toISOString() : null,
          fetched_at: new Date().toISOString(),
        }));

        const upRes = await supa
          .from('dashboard_dataforseo_backlinks')
          .upsert(rows, { onConflict: 'target,url_from,url_to' });
        if (upRes.error) throw new Error(`Backlinks upsert failed: ${upRes.error.message}`);
        totalRowsWritten += rows.length;
      }

      // 3. Fetch referring domains (top 100)
      const domainsRes = await dfsPost<ReferringDomainsResult>('/backlinks/referring_domains/live', [
        {
          target,
          limit: 100,
          include_subdomains: true,
        },
      ]);

      totalCostUsd += domainsRes.cost;
      const domainsData = domainsRes.tasks[0];

      if (domainsData?.items && domainsData.items.length > 0) {
        const rows = domainsData.items
          .filter((d) => d.domain) // defensive — skip any empty-domain rows
          .map((d) => ({
            target,
            domain_from: d.domain,
            backlinks: d.backlinks || 0,
            first_seen: d.first_seen ? new Date(d.first_seen).toISOString() : null,
            last_seen: d.lost_date ? new Date(d.lost_date).toISOString() : null,
            rank: d.rank || null,
            fetched_at: new Date().toISOString(),
          }));

        const upRes = await supa
          .from('dashboard_dataforseo_referring_domains')
          .upsert(rows, { onConflict: 'target,domain_from' });
        if (upRes.error) throw new Error(`Referring domains upsert failed: ${upRes.error.message}`);
        totalRowsWritten += rows.length;
      }
    }

    const durationMs = Date.now() - startedAt;
    await logSync('backlinks', {
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
      ok: true,
    });

    return {
      product: 'backlinks',
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errMsg = err instanceof Error ? err.message : String(err);
    await logSync('backlinks', {
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
      ok: false,
      error: errMsg,
    });
    throw err;
  }
}

// ============================================================================
// SERP Ingest
// ============================================================================

export async function ingestSerp(opts: {
  keywords: string[];
  locationCode?: number;
  languageCode?: string;
  target?: string;
}): Promise<IngestResult> {
  const startedAt = Date.now();
  let totalRowsWritten = 0;
  let totalCostUsd = 0;

  const locationCode = opts.locationCode ?? 2826;
  const languageCode = opts.languageCode ?? 'en';
  const target = opts.target ?? 'evari.cc';

  const supa = createSupabaseAdmin();
  if (!supa) {
    throw new Error(
      'Supabase admin client unavailable — set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL',
    );
  }

  try {
    // Strip protocol/www once so we can match cleanly against item.domain
    const targetHost = target.replace(/^(https?:\/\/)?(www\.)?/, '');
    const nowIso = new Date().toISOString();

    // 1. Fire all SERP calls in parallel — this is the big latency win (was 152s sequential for 10 keywords)
    const results = await Promise.all(
      opts.keywords.map(async (keyword) => {
        const res = await dfsPost<SerpLiveResult>('/serp/google/organic/live/advanced', [
          {
            keyword,
            location_code: locationCode,
            language_code: languageCode,
            depth: 100,
          },
        ]);
        return { keyword, res };
      }),
    );

    // 2. Aggregate cost + build per-keyword payloads
    type PerKeyword = {
      keyword: string;
      position: number | null;
      url: string | null;
      title: string | null;
      serpFeatures: string[];
      totalResults: number | null;
    };
    const perKeyword: PerKeyword[] = [];

    for (const { keyword, res } of results) {
      totalCostUsd += res.cost;
      const result = res.tasks[0];
      if (!result?.items) continue;

      let position: number | null = null;
      let url: string | null = null;
      let title: string | null = null;
      let serpFeatures: string[] = [];

      for (let i = 0; i < result.items.length; i++) {
        const item = result.items[i];
        if (item.domain && targetHost && item.domain.includes(targetHost)) {
          position = i + 1;
          url = item.url || null;
          title = item.title || null;
          serpFeatures = item.serp_features || [];
          break;
        }
      }

      perKeyword.push({
        keyword,
        position,
        url,
        title,
        serpFeatures,
        totalResults: result.total_results || null,
      });
    }

    if (perKeyword.length > 0) {
      // 3. Batch upsert all keyword rows in one call, returning IDs for the history insert
      const keywordRows = perKeyword.map((k) => ({
        keyword: k.keyword,
        location_code: locationCode,
        language_code: languageCode,
        target,
        latest_position: k.position,
        latest_url: k.url,
        latest_title: k.title,
        latest_serp_features: k.serpFeatures,
        latest_checked_at: nowIso,
        active: true,
        created_at: nowIso,
      }));

      const upRes = await supa
        .from('dashboard_dataforseo_serp_keywords')
        .upsert(keywordRows, { onConflict: 'keyword,location_code,language_code,target' })
        .select('id, keyword');
      if (upRes.error) throw new Error(`SERP keyword upsert failed: ${upRes.error.message}`);

      // 4. Map keyword → id, then batch insert all history rows in one call
      const idByKeyword: Record<string, number> = {};
      for (const row of upRes.data ?? []) {
        idByKeyword[row.keyword] = row.id;
      }

      const historyRows = perKeyword
        .filter((k) => idByKeyword[k.keyword] != null)
        .map((k) => ({
          keyword_id: idByKeyword[k.keyword],
          checked_at: nowIso,
          position: k.position,
          url: k.url,
          title: k.title,
          serp_features: k.serpFeatures,
          total_results: k.totalResults,
          fetched_at: nowIso,
        }));

      if (historyRows.length > 0) {
        const insRes = await supa.from('dashboard_dataforseo_serp_history').insert(historyRows);
        if (insRes.error) throw new Error(`SERP history insert failed: ${insRes.error.message}`);
      }

      totalRowsWritten = perKeyword.length;
    }

    const durationMs = Date.now() - startedAt;
    await logSync('serp', {
      target,
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
      ok: true,
    });

    return {
      product: 'serp',
      target,
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errMsg = err instanceof Error ? err.message : String(err);
    await logSync('serp', {
      target,
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
      ok: false,
      error: errMsg,
    });
    throw err;
  }
}

// ============================================================================
// Keyword Data Ingest (Search Volume + Difficulty)
// ============================================================================

export async function ingestKeywordData(opts: {
  keywords: string[];
  locationCode?: number;
  languageCode?: string;
}): Promise<IngestResult> {
  const startedAt = Date.now();
  let totalRowsWritten = 0;
  let totalCostUsd = 0;

  const locationCode = opts.locationCode ?? 2826;
  const languageCode = opts.languageCode ?? 'en';

  const supa = createSupabaseAdmin();
  if (!supa) {
    throw new Error(
      'Supabase admin client unavailable — set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL',
    );
  }

  try {
    // Fetch both search volume and keyword difficulty in parallel
    const [svRes, kdRes] = await Promise.all([
      dfsPost<KeywordDataSearchVolumeResult>('/keywords_data/google_ads/search_volume/live', [
        {
          keywords: opts.keywords,
          location_code: locationCode,
          language_code: languageCode,
        },
      ]),
      dfsPost<KeywordDataDifficultyResult>('/dataforseo_labs/google/bulk_keyword_difficulty/live', [
        {
          keywords: opts.keywords,
          location_code: locationCode,
          language_code: languageCode,
        },
      ]),
    ]);

    totalCostUsd += svRes.cost + kdRes.cost;

    // Index difficulty by keyword
    const difficultyMap: Record<string, number> = {};
    if (kdRes.tasks[0]?.items) {
      for (const item of kdRes.tasks[0].items) {
        if (item.keyword_difficulty !== undefined) {
          difficultyMap[item.keyword] = item.keyword_difficulty;
        }
      }
    }

    // Merge and upsert
    if (svRes.tasks.length > 0) {
      const rows = svRes.tasks.map((kw) => ({
        keyword: kw.keyword,
        location_code: locationCode,
        language_code: languageCode,
        search_volume: kw.search_volume || null,
        cpc: kw.cpc ? parseFloat(String(kw.cpc)) : null,
        competition: kw.competition ? parseFloat(String(kw.competition)) : null,
        competition_level: kw.competition_level || null,
        keyword_difficulty: difficultyMap[kw.keyword] || null,
        search_intent: null,
        monthly_searches: (kw.monthly_searches || []).map((m) => ({
          month: m.month,
          year: m.year,
          search_volume: m.search_volume,
        })),
        fetched_at: new Date().toISOString(),
      }));

      const upRes = await supa
        .from('dashboard_dataforseo_keyword_data')
        .upsert(rows, { onConflict: 'keyword,location_code,language_code' });
      if (upRes.error) throw new Error(`Keyword data upsert failed: ${upRes.error.message}`);
      totalRowsWritten = rows.length;
    }

    const durationMs = Date.now() - startedAt;
    await logSync('keywords', {
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
      ok: true,
    });

    return {
      product: 'keywords',
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errMsg = err instanceof Error ? err.message : String(err);
    await logSync('keywords', {
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
      ok: false,
      error: errMsg,
    });
    throw err;
  }
}

// ============================================================================
// On-Page Ingest
// ============================================================================

export async function ingestOnpage(opts: { urls: string[]; target: string }): Promise<IngestResult> {
  const startedAt = Date.now();
  let totalRowsWritten = 0;
  let totalCostUsd = 0;

  const supa = createSupabaseAdmin();
  if (!supa) {
    throw new Error(
      'Supabase admin client unavailable — set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL',
    );
  }

  try {
    for (const url of opts.urls) {
      const res = await dfsPost<OnPageInstantResult>('/on_page/instant_pages', [
        {
          url,
          enable_javascript: true,
          custom_user_agent: 'EvariDashboard/1.0',
        },
      ]);

      totalCostUsd += res.cost;
      const result = res.tasks[0];

      if (result?.items && result.items.length > 0) {
        const item = result.items[0];
        const taskId = `onpage_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Upsert page row
        const pageRow = {
          task_id: taskId,
          target: opts.target,
          url: item.url || url,
          status_code: item.status_code || null,
          fetch_time: item.fetch_time ? new Date(item.fetch_time).toISOString() : null,
          page_timing_time_to_interactive: item.page_timing?.time_to_interactive || null,
          page_timing_dom_complete: item.page_timing?.dom_complete || null,
          meta_title: item.meta?.title || null,
          meta_description: item.meta?.description || null,
          meta_canonical: item.meta?.canonical || null,
          h1: item.h1 || [],
          internal_links_count: item.links?.internal?.total || 0,
          external_links_count: item.links?.external?.total || 0,
          images_count: item.images?.total || 0,
          words_count: item.content?.total_words || 0,
          onpage_score: item.onpage_score ? parseFloat(String(item.onpage_score)) : null,
          fetched_at: new Date().toISOString(),
        };

        const upRes = await supa
          .from('dashboard_dataforseo_onpage_pages')
          .upsert(pageRow, { onConflict: 'task_id,url' });
        if (upRes.error) throw new Error(`On-page page upsert failed: ${upRes.error.message}`);
        totalRowsWritten += 1;

        // Insert issues from checks
        const pageId = await supa
          .from('dashboard_dataforseo_onpage_pages')
          .select('id')
          .eq('task_id', taskId)
          .eq('url', item.url || url)
          .single();

        if (pageId.data && item.checks) {
          const issues = [];
          for (const [checkName, isFailed] of Object.entries(item.checks)) {
            if (isFailed === true) {
              issues.push({
                page_id: pageId.data.id,
                severity: 'warning',
                category: 'technical',
                check_name: checkName,
                message: null,
                fetched_at: new Date().toISOString(),
              });
            }
          }

          if (issues.length > 0) {
            const insRes = await supa.from('dashboard_dataforseo_onpage_issues').insert(issues);
            if (insRes.error) throw new Error(`On-page issues insert failed: ${insRes.error.message}`);
            totalRowsWritten += issues.length;
          }
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    await logSync('onpage', {
      target: opts.target,
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
      ok: true,
    });

    return {
      product: 'onpage',
      target: opts.target,
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errMsg = err instanceof Error ? err.message : String(err);
    await logSync('onpage', {
      target: opts.target,
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
      ok: false,
      error: errMsg,
    });
    throw err;
  }
}

// ============================================================================
// Ranked Keywords Ingest (competitor auto-seed)
// ============================================================================
//
// Calls DFS Labs /dataforseo_labs/google/ranked_keywords/live for a single
// target domain. Response gives us up to `limit` keywords that domain ranks
// for, each decorated with market data (volume/CPC/difficulty/intent) and the
// SERP element that put them there (position/url/title).
//
// We fan this out into three existing tables (single source of truth — no new
// dedicated "competitor keywords" table):
//   1. dashboard_dataforseo_keyword_data   — market data (shared across all lists)
//   2. dashboard_dataforseo_serp_keywords  — one row per (keyword, location, language, target=domain)
//   3. dashboard_dataforseo_serp_history   — snapshot of the position at ingest time
//
// Then, if a `listId` is supplied, we auto-populate that list's membership with
// the fetched keywords (source='auto'). This is the "seed" half of seed-then-
// curate: Craig can then prune or tag in the UI.

export async function ingestRankedKeywords(opts: {
  target: string;
  limit?: number;
  locationCode?: number;
  languageCode?: string;
  listId?: number;
}): Promise<IngestResult> {
  const startedAt = Date.now();
  let totalRowsWritten = 0;
  let totalCostUsd = 0;

  const target = opts.target;
  const limit = Math.min(opts.limit ?? 200, 1000);
  const locationCode = opts.locationCode ?? 2826;
  const languageCode = opts.languageCode ?? 'en';

  const supa = createSupabaseAdmin();
  if (!supa) {
    throw new Error(
      'Supabase admin client unavailable — set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL',
    );
  }

  try {
    const res = await dfsPost<RankedKeywordsResult>(
      '/dataforseo_labs/google/ranked_keywords/live',
      [
        {
          target,
          location_code: locationCode,
          language_code: languageCode,
          limit,
          // Organic-only — skip paid placements, shopping blocks, etc.
          filters: [['ranked_serp_element.serp_item.type', '=', 'organic']],
          // Best positions first so a low `limit` still captures the wins.
          order_by: ['ranked_serp_element.serp_item.rank_group,asc'],
        },
      ],
    );

    totalCostUsd += res.cost;
    const result = res.tasks[0];
    const items = result?.items ?? [];
    const nowIso = new Date().toISOString();

    // Strip protocol/www for the domain-match check — DFS's serp_item.domain
    // can include subdomains (e.g. shop.competitor.com).
    const targetHost = target.replace(/^(https?:\/\/)?(www\.)?/, '');

    // Deduplicate by keyword — DFS occasionally returns dupes when the same
    // term ranks on multiple SERPs. Keep the best position.
    const byKeyword = new Map<
      string,
      {
        keyword: string;
        position: number | null;
        url: string | null;
        title: string | null;
        volume: number | null;
        cpc: number | null;
        competition: number | null;
        competitionLevel: string | null;
        difficulty: number | null;
        intent: string | null;
        monthly: Array<{ month: string; year: number; search_volume: number }>;
      }
    >();

    for (const item of items) {
      const kd = item.keyword_data;
      const se = item.ranked_serp_element?.serp_item;
      if (!kd?.keyword || !se) continue;
      // Skip rows where the ranking domain doesn't actually match our target.
      if (se.domain && targetHost && !se.domain.includes(targetHost)) continue;

      const keyword = kd.keyword.toLowerCase().trim();
      if (!keyword) continue;

      const rank = se.rank_absolute ?? se.rank_group ?? null;
      const existing = byKeyword.get(keyword);
      if (existing && existing.position !== null && rank !== null && existing.position <= rank) {
        continue;
      }

      byKeyword.set(keyword, {
        keyword,
        position: rank,
        url: se.url ?? null,
        title: se.title ?? null,
        volume: kd.keyword_info?.search_volume ?? null,
        cpc: kd.keyword_info?.cpc ?? null,
        competition: kd.keyword_info?.competition ?? null,
        competitionLevel: kd.keyword_info?.competition_level ?? null,
        difficulty: kd.keyword_properties?.keyword_difficulty ?? null,
        intent: kd.search_intent_info?.main_intent ?? null,
        monthly: kd.keyword_info?.monthly_searches ?? [],
      });
    }

    const rows = Array.from(byKeyword.values());

    if (rows.length > 0) {
      // 1. Market data — shared across every list that references this keyword.
      const marketRows = rows.map((k) => ({
        keyword: k.keyword,
        location_code: locationCode,
        language_code: languageCode,
        search_volume: k.volume,
        cpc: k.cpc != null ? parseFloat(String(k.cpc)) : null,
        competition: k.competition != null ? parseFloat(String(k.competition)) : null,
        competition_level: k.competitionLevel,
        keyword_difficulty: k.difficulty,
        search_intent: k.intent,
        monthly_searches: k.monthly,
        fetched_at: nowIso,
      }));

      const mRes = await supa
        .from('dashboard_dataforseo_keyword_data')
        .upsert(marketRows, { onConflict: 'keyword,location_code,language_code' });
      if (mRes.error) {
        throw new Error(`Ranked keywords market-data upsert failed: ${mRes.error.message}`);
      }
      totalRowsWritten += marketRows.length;

      // 2. SERP keywords — one row per (keyword, locale, target). target IS the
      //    competitor domain here; this is how the Keywords page will look up
      //    "their position" without needing a separate table.
      const serpRows = rows.map((k) => ({
        keyword: k.keyword,
        location_code: locationCode,
        language_code: languageCode,
        target,
        latest_position: k.position,
        latest_url: k.url,
        latest_title: k.title,
        latest_serp_features: [],
        latest_checked_at: nowIso,
        active: true,
        created_at: nowIso,
      }));

      const sRes = await supa
        .from('dashboard_dataforseo_serp_keywords')
        .upsert(serpRows, { onConflict: 'keyword,location_code,language_code,target' })
        .select('id, keyword');
      if (sRes.error) {
        throw new Error(`Ranked keywords SERP upsert failed: ${sRes.error.message}`);
      }
      totalRowsWritten += serpRows.length;

      // 3. History snapshot — so competitor movement is visible over time.
      const idByKeyword: Record<string, number> = {};
      for (const row of sRes.data ?? []) {
        idByKeyword[row.keyword] = row.id;
      }

      const historyRows = rows
        .filter((k) => idByKeyword[k.keyword] != null)
        .map((k) => ({
          keyword_id: idByKeyword[k.keyword],
          checked_at: nowIso,
          position: k.position,
          url: k.url,
          title: k.title,
          serp_features: [],
          total_results: null,
          fetched_at: nowIso,
        }));

      if (historyRows.length > 0) {
        const hRes = await supa.from('dashboard_dataforseo_serp_history').insert(historyRows);
        if (hRes.error) {
          throw new Error(`Ranked keywords history insert failed: ${hRes.error.message}`);
        }
      }

      // 4. Optionally auto-seed the competitor list's membership.
      if (opts.listId) {
        const memberRows = rows.map((k) => ({
          list_id: opts.listId!,
          keyword: k.keyword,
          source: 'auto' as const,
        }));

        const memRes = await supa
          .from('dashboard_keyword_list_members')
          .upsert(memberRows, { onConflict: 'list_id,keyword', ignoreDuplicates: true });
        if (memRes.error) {
          throw new Error(`Ranked keywords list-member upsert failed: ${memRes.error.message}`);
        }

        // Stamp the list with its last sync time + cost so the UI can show
        // staleness without joining the sync log.
        await supa
          .from('dashboard_keyword_lists')
          .update({
            last_synced_at: nowIso,
            last_sync_cost_usd: totalCostUsd,
          })
          .eq('id', opts.listId);
      }
    }

    const durationMs = Date.now() - startedAt;
    await logSync('ranked_keywords', {
      target,
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
      ok: true,
    });

    return {
      product: 'ranked_keywords',
      target,
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errMsg = err instanceof Error ? err.message : String(err);
    await logSync('ranked_keywords', {
      target,
      costUsd: totalCostUsd,
      rowsWritten: totalRowsWritten,
      durationMs,
      ok: false,
      error: errMsg,
    });
    throw err;
  }
}
