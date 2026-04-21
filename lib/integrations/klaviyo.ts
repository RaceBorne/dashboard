/**
 * Klaviyo adapters — read-only ingest for campaigns, flows, lists, and metrics.
 *
 * Requires KLAVIYO_API_KEY env var (pk_* format, read-only scopes:
 * campaigns:read, flows:read, lists:read, metrics:read, profiles:read, segments:read).
 *
 * Mirrors the GA4 ingest pattern exactly:
 *   - isKlaviyoConnected() to check env var
 *   - getKlaviyoStatus() to fetch last sync log + status
 *   - ingestKlaviyoRollup() to fetch and upsert data
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_API_REVISION = '2024-10-15';

function getAuthHeader(): string {
  const key = process.env.KLAVIYO_API_KEY;
  if (!key) throw new Error('KLAVIYO_API_KEY is not set');
  return `Klaviyo-API-Key ${key}`;
}

function getCommonHeaders(): HeadersInit {
  return {
    Authorization: getAuthHeader(),
    'revision': KLAVIYO_API_REVISION,
    'accept': 'application/json',
  };
}

// ============================================================================
// Connection Status
// ============================================================================

export function isKlaviyoConnected(): boolean {
  return Boolean(process.env.KLAVIYO_API_KEY);
}

export async function getKlaviyoStatus(): Promise<{
  connected: boolean;
  lastSyncAt?: string;
  durationMs?: number;
  rowsCampaigns?: number;
  rowsFlows?: number;
  rowsLists?: number;
  rowsMetricDays?: number;
}> {
  if (!isKlaviyoConnected()) {
    return { connected: false };
  }

  const supa = createSupabaseAdmin();
  if (!supa) {
    return { connected: true };
  }

  const { data, error } = await supa
    .from('dashboard_klaviyo_sync_log')
    .select('ran_at, rows_campaigns, rows_flows, rows_lists, rows_metric_days, duration_ms')
    .order('ran_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return { connected: true };
  }

  return {
    connected: true,
    lastSyncAt: data.ran_at,
    durationMs: data.duration_ms,
    rowsCampaigns: data.rows_campaigns,
    rowsFlows: data.rows_flows,
    rowsLists: data.rows_lists,
    rowsMetricDays: data.rows_metric_days,
  };
}

// ============================================================================
// Klaviyo API Calls
// ============================================================================

interface KlaviyoCampaign {
  id: string;
  attributes: {
    name: string;
    send_time?: string;
    status: string;
    num_recipients?: number;
    // Klaviyo puts subject/preview/from on the first campaign-message, but
    // when the `fields[campaign]` param is used they also surface here.
    subject_line?: string;
    preview_text?: string;
    from_email?: string;
    from_label?: string;
    reply_to_email?: string;
  };
  relationships?: {
    'campaign-messages'?: {
      data?: Array<{ id: string; type: string }>;
    };
  };
}

interface KlaviyoCampaignMessage {
  id: string;
  attributes: {
    label?: string;
    channel?: string;
    content?: {
      subject?: string;
      preview_text?: string;
      from_email?: string;
      from_label?: string;
      reply_to_email?: string;
    };
    render_options?: unknown;
  };
}

interface KlaviyoCampaignValuesReport {
  data?: {
    attributes: {
      results: Array<{
        groupings: { campaign_id: string };
        statistics: {
          opens?: number;
          opens_unique?: number;
          open_rate?: number;
          clicks?: number;
          clicks_unique?: number;
          click_rate?: number;
          click_to_open_rate?: number;
          delivered?: number;
          delivery_rate?: number;
          bounced?: number;
          bounce_rate?: number;
          conversion_uniques?: number;
          conversion_value?: number;
          unsubscribes?: number;
          unsubscribe_rate?: number;
          recipients?: number;
        };
      }>;
    };
  };
}

interface KlaviyoCampaignRender {
  data?: {
    attributes: {
      html?: string;
      plain_text?: string;
    };
  };
}

interface KlaviyoCampaignRecipients {
  data: Array<{
    id: string;
    attributes: {
      metric_id: string;
      opens: number;
      unique_opens: number;
      clicks: number;
      unique_clicks: number;
      revenue: number;
      orders: number;
      unsubscribes: number;
      bounced: number;
    };
  }>;
  links?: {
    next?: string;
  };
}

interface KlaviyoFlow {
  id: string;
  attributes: {
    name: string;
    status: string;
    trigger: {
      type: string;
    };
    created_at: string;
    updated_at: string;
  };
}

interface KlaviyoList {
  id: string;
  attributes: {
    name: string;
    type: string;
    profile_count?: number;
    created_at: string;
    updated_at: string;
  };
}

interface KlaviyoSegment {
  id: string;
  attributes: {
    name: string;
    profile_count?: number;
    created_at: string;
    updated_at: string;
  };
}

interface KlaviyoMetric {
  id: string;
  attributes: {
    name: string;
  };
}

interface KlaviyoMetricAggregates {
  data: Array<{
    attributes: {
      measurements: Array<{
        timestamp: string;
        count?: number;
        value?: number;
      }>;
    };
  }>;
}

async function fetchKlaviyoAPI<T>(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<T> {
  const url = `${KLAVIYO_API_BASE}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: getCommonHeaders(),
    cache: 'no-store',
  };
  if (body) {
    options.body = JSON.stringify(body);
    (options.headers as Record<string, string>)['content-type'] = 'application/json';
  }

  const res = await fetch(url, options);
  if (!res.ok) {
    const errText = await res.text().catch(() => '<no body>');
    throw new Error(`Klaviyo API ${endpoint} failed: ${res.status} ${errText.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

async function fetchCampaigns(maxCampaigns: number): Promise<KlaviyoCampaign[]> {
  const campaigns: KlaviyoCampaign[] = [];
  // `include=campaign-messages` would let us pull subject/from in one hop but
  // it massively inflates the payload. We instead cheaply fetch the message
  // for each campaign below via `fetchCampaignMessage`.
  let nextUrl: string | undefined = `/campaigns?filter=equals(messages.channel,'email')&sort=-scheduled_at`;

  while (nextUrl && campaigns.length < maxCampaigns) {
    const response: { data: KlaviyoCampaign[]; links?: { next?: string } } =
      await fetchKlaviyoAPI<{
        data: KlaviyoCampaign[];
        links?: { next?: string };
      }>(nextUrl);

    campaigns.push(...(response.data ?? []));
    const pageNext: string | undefined = response.links?.next;
    if (!pageNext || campaigns.length >= maxCampaigns) {
      break;
    }
    // Extract the path from the full URL if needed
    nextUrl = pageNext.includes('/api/') ? pageNext.substring(pageNext.indexOf('/api/')) : pageNext;
  }

  return campaigns.slice(0, maxCampaigns);
}

/**
 * For each campaign we grab its first email message so we have subject line,
 * preview text, and sender fields. We fan out in small concurrency batches to
 * stay inside Klaviyo's 75 req/s burst envelope.
 */
async function fetchCampaignMessages(
  campaignIds: string[],
): Promise<Map<string, KlaviyoCampaignMessage>> {
  const out = new Map<string, KlaviyoCampaignMessage>();
  const CONCURRENCY = 3;
  for (let i = 0; i < campaignIds.length; i += CONCURRENCY) {
    const slice = campaignIds.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (campaignId) => {
        try {
          const res = await fetchKlaviyoAPI<{ data: KlaviyoCampaignMessage[] }>(
            `/campaigns/${campaignId}/campaign-messages`,
          );
          const first = res.data?.[0];
          return first ? ([campaignId, first] as const) : null;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`Klaviyo campaign-messages fetch failed for ${campaignId}: ${msg}`);
          return null;
        }
      }),
    );
    for (const r of results) {
      if (r) out.set(r[0], r[1]);
    }
    // Gentle spacing so we don't trip the 75 req/s burst limit.
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return out;
}

/**
 * Pulls per-campaign aggregate stats (opens_unique, clicks_unique, revenue,
 * bounced, unsubscribed, etc.) via the reporting endpoint. This is the same
 * data Klaviyo surfaces on the campaign dashboard.
 *
 * Endpoint reference: POST /campaign-values-reports
 * https://developers.klaviyo.com/en/reference/query_campaign_values
 */
async function fetchCampaignValuesReport(
  campaignIds: string[],
): Promise<Map<string, KlaviyoCampaignValuesReport['data']>> {
  const out = new Map<string, KlaviyoCampaignValuesReport['data']>();
  if (campaignIds.length === 0) return out;

  // Endpoint accepts a batch filter, but max 50 ids per call in practice.
  const BATCH = 40;
  for (let i = 0; i < campaignIds.length; i += BATCH) {
    const slice = campaignIds.slice(i, i + BATCH);
    const filter = `any(campaign_id,["${slice.join('","')}"])`;
    try {
      const res = await fetchKlaviyoAPI<KlaviyoCampaignValuesReport>(
        '/campaign-values-reports',
        'POST',
        {
          data: {
            type: 'campaign-values-report',
            attributes: {
              statistics: [
                'opens',
                'opens_unique',
                'open_rate',
                'clicks',
                'clicks_unique',
                'click_rate',
                'click_to_open_rate',
                'delivered',
                'delivery_rate',
                'bounced',
                'bounce_rate',
                'conversion_uniques',
                'conversion_value',
                'unsubscribes',
                'unsubscribe_rate',
                'recipients',
              ],
              timeframe: { key: 'last_365_days' },
              conversion_metric_id: await resolvePlacedOrderMetricId(),
              filter,
            },
          },
        },
      );

      for (const row of res.data?.attributes.results ?? []) {
        const cid = row.groupings.campaign_id;
        out.set(cid, {
          attributes: {
            results: [row],
          },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Klaviyo campaign-values-report batch failed (${slice.length} ids): ${msg}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return out;
}

// `campaign-values-reports` requires a conversion metric id (Klaviyo uses the
// Placed Order event by default). We cache the lookup so each ingest only
// makes the /metrics call once.
let cachedPlacedOrderMetricId: string | null = null;
async function resolvePlacedOrderMetricId(): Promise<string> {
  if (cachedPlacedOrderMetricId) return cachedPlacedOrderMetricId;
  const res = await fetchKlaviyoAPI<{ data: KlaviyoMetric[] }>(
    "/metrics?filter=equals(name,'Placed Order')",
  );
  const id = res.data?.[0]?.id;
  if (!id) {
    throw new Error('Could not resolve Placed Order metric id (needed for campaign values report)');
  }
  cachedPlacedOrderMetricId = id;
  return id;
}

/**
 * Grab the rendered HTML of a campaign message so we can use it as a thumbnail
 * (scaled iframe) on the /klaviyo page. Klaviyo doesn't expose a single
 * "rendered email" endpoint; the email body lives on the assigned Template
 * resource. We follow the relationship: campaign-message → template → html.
 *
 * Errors are logged and swallowed — the dashboard falls back to a teal
 * gradient card with the subject line if previewHtml is null.
 */
/**
 * Result type for the render pipeline. `error` is non-null when we couldn't
 * recover HTML — we bubble it up so the dashboard can surface exactly why
 * instead of just showing a blank preview.
 */
type RenderResult = {
  html: string | null;
  text: string | null;
  error: string | null;
};

/**
 * Parse Klaviyo error strings like
 *   "Klaviyo API /foo failed: 403 {\"errors\":[{\"id\":...,\"detail\":\"Your API key is missing required scopes: templates:read\"}]}"
 * into a short human-readable sentence. Keeps the prefix if the body doesn't
 * parse cleanly so we still surface something informative.
 */
function humanizeKlaviyoError(raw: string): string {
  const jsonStart = raw.indexOf('{');
  if (jsonStart < 0) return raw;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart));
    const first = Array.isArray(parsed.errors) ? parsed.errors[0] : null;
    if (first) {
      const detail = (first.detail ?? first.title ?? '').toString().trim();
      const code = (first.code ?? '').toString().trim();
      const status = (first.status ?? '').toString().trim();
      if (detail) {
        const parts = [detail];
        if (code && code !== 'permission_denied') parts.push(`(${code})`);
        if (status) parts.unshift(`HTTP ${status}:`);
        return parts.join(' ');
      }
    }
  } catch {
    // fall through
  }
  return raw;
}

async function fetchCampaignMessageRender(messageId: string): Promise<RenderResult> {
  // Fast path — one request returns the whole linked template object including
  // its `html` + `text` attributes. Klaviyo exposes this via the resource-
  // object shortcut /campaign-messages/{id}/template.
  let fastPathError: string | null = null;
  try {
    const direct = await fetchKlaviyoAPI<{
      data?: { id: string; attributes?: { html?: string; text?: string; name?: string } };
    }>(`/campaign-messages/${messageId}/template`);

    const html = direct.data?.attributes?.html ?? null;
    const text = direct.data?.attributes?.text ?? null;
    if (html && html.length > 0) {
      return { html, text, error: null };
    }
    // Fall through to the relationship-based path below.
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 404 here just means "no template linked via that shortcut" — try path 2.
    // 403 is permission — record it so we can surface it if the fallback also
    // fails for the same reason.
    if (!msg.includes('404')) {
      fastPathError = msg;
      console.warn(`Klaviyo /campaign-messages/${messageId}/template failed: ${msg}`);
    }
  }

  // Slow path — walk the relationship manually.
  try {
    const rel = await fetchKlaviyoAPI<{ data: { id: string; type: string } | null }>(
      `/campaign-messages/${messageId}/relationships/template`,
    );
    const templateId = rel?.data?.id;
    if (!templateId) {
      return {
        html: null,
        text: null,
        error:
          'No template linked to this campaign message. The campaign may have been built inline without a saved template.',
      };
    }

    const tpl = await fetchKlaviyoAPI<{
      data?: { attributes: { html?: string; text?: string } };
    }>(`/templates/${templateId}`);

    const html = tpl.data?.attributes.html ?? null;
    const text = tpl.data?.attributes.text ?? null;
    if (!html) {
      return {
        html: null,
        text,
        error: `Klaviyo returned an empty html body for template ${templateId}.`,
      };
    }
    return { html, text, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Prefer the first error if both paths hit the same permission issue.
    const detail = humanizeKlaviyoError(fastPathError ?? msg);
    // Special-case scope errors with actionable guidance.
    if (/scopes?/i.test(detail) || /permission_denied/i.test(msg)) {
      return {
        html: null,
        text: null,
        error: `${detail} — update your Klaviyo API key to include templates:read (and confirm campaigns:read and metrics:read are also granted).`,
      };
    }
    return {
      html: null,
      text: null,
      error: `Klaviyo template fetch failed: ${detail.slice(0, 400)}`,
    };
  }
}

/**
 * On-demand preview renderer — used by the `/api/integrations/klaviyo/render/[id]`
 * route so the user can force a fresh HTML pull for a single campaign from the
 * dashboard without running a full ingest. Writes the result back to
 * `dashboard_klaviyo_campaigns` so subsequent page loads serve from cache.
 */
export async function renderCampaignPreview(campaignId: string): Promise<{
  html: string | null;
  text: string | null;
  subject: string | null;
  messageId: string | null;
  error: string | null;
}> {
  // 1. Find the first campaign message for this campaign.
  let message: KlaviyoCampaignMessage | null = null;
  try {
    const msgRes = await fetchKlaviyoAPI<{ data: KlaviyoCampaignMessage[] }>(
      `/campaigns/${campaignId}/campaign-messages`,
    );
    message = msgRes.data?.[0] ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      html: null,
      text: null,
      subject: null,
      messageId: null,
      error: `Could not fetch campaign messages: ${msg.slice(0, 300)}`,
    };
  }
  if (!message) {
    return {
      html: null,
      text: null,
      subject: null,
      messageId: null,
      error: 'No campaign message found for this campaign.',
    };
  }

  // 2. Render via the template path.
  const rendered = await fetchCampaignMessageRender(message.id);

  // 3. Persist so the next page load already has it.
  try {
    const { createSupabaseAdmin } = await import('@/lib/supabase/admin');
    const supabase = createSupabaseAdmin();
    if (supabase) {
      const subject = message.attributes?.content?.subject ?? null;
      const updatePayload: Record<string, unknown> = {
        preview_html: rendered.html,
        preview_text: rendered.text,
        preview_fetched_at: rendered.html ? new Date().toISOString() : null,
      };
      if (subject) updatePayload.preview_subject = subject;
      await supabase
        .from('dashboard_klaviyo_campaigns')
        .update(updatePayload)
        .eq('id', campaignId);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`renderCampaignPreview DB write skipped: ${msg}`);
  }

  return {
    html: rendered.html,
    text: rendered.text,
    subject: message.attributes?.content?.subject ?? null,
    messageId: message.id,
    error: rendered.error,
  };
}

async function fetchFlows(maxFlows: number): Promise<KlaviyoFlow[]> {
  const flows: KlaviyoFlow[] = [];
  let nextUrl: string | undefined = `/flows?sort=-updated`;

  while (nextUrl && flows.length < maxFlows) {
    const response: { data: KlaviyoFlow[]; links?: { next?: string } } =
      await fetchKlaviyoAPI<{
        data: KlaviyoFlow[];
        links?: { next?: string };
      }>(nextUrl);

    flows.push(...(response.data ?? []));
    const pageNext: string | undefined = response.links?.next;
    if (!pageNext || flows.length >= maxFlows) {
      break;
    }
    nextUrl = pageNext.includes('/api/') ? pageNext.substring(pageNext.indexOf('/api/')) : pageNext;
  }

  return flows.slice(0, maxFlows);
}

async function fetchListsAndSegments(maxItems: number): Promise<(KlaviyoList | KlaviyoSegment)[]> {
  const items: (KlaviyoList | KlaviyoSegment)[] = [];

  // Fetch lists (note: /lists + /segments do not accept page[size] — cursor-only pagination)
  let nextUrl: string | undefined = `/lists`;
  while (nextUrl && items.length < maxItems) {
    const response: { data: KlaviyoList[]; links?: { next?: string } } =
      await fetchKlaviyoAPI<{
        data: KlaviyoList[];
        links?: { next?: string };
      }>(nextUrl);
    const batch = response.data ?? [];
    items.push(...batch);
    if (items.length >= maxItems) {
      break;
    }
    nextUrl = response.links?.next?.includes('/api/')
      ? response.links.next.substring(response.links.next.indexOf('/api/'))
      : response.links?.next;
  }

  // Fetch segments if we haven't hit max yet. Segments require a separate
  // `segments:read` scope on the API key — if that scope wasn't granted we
  // silently skip instead of failing the whole ingest.
  if (items.length < maxItems) {
    nextUrl = `/segments`;
    try {
      while (nextUrl && items.length < maxItems) {
        const response: { data: KlaviyoSegment[]; links?: { next?: string } } =
          await fetchKlaviyoAPI<{
            data: KlaviyoSegment[];
            links?: { next?: string };
          }>(nextUrl);
        const batch = response.data ?? [];
        items.push(...batch);
        if (items.length >= maxItems) {
          break;
        }
        nextUrl = response.links?.next?.includes('/api/')
          ? response.links.next.substring(response.links.next.indexOf('/api/'))
          : response.links?.next;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('permission_denied') || msg.includes('403')) {
        console.warn('Klaviyo segments skipped (segments:read scope missing on API key)');
      } else {
        throw err;
      }
    }
  }

  return items.slice(0, maxItems);
}

async function fetchMetricsDaily(
  days: number,
): Promise<
  Array<{ day: string; metric_id: string; metric_name: string; count: number; value: number }>
> {
  // Find the metric IDs for key metrics. The /metrics endpoint is paginated
  // (10 per page by default) and historically we only read page 1 — which is
  // why rows_metric_days has been stuck at 0 for every prior sync. Walk all
  // pages until every target name is resolved or the feed runs out.
  const metricNames = ['Placed Order', 'Opened Email', 'Clicked Email'];
  const metrics: Map<string, string> = new Map(); // id -> name

  let nextUrl: string | undefined = '/metrics';
  let safetyPages = 0;
  while (nextUrl && metrics.size < metricNames.length && safetyPages < 50) {
    const metricsResponse: { data: KlaviyoMetric[]; links?: { next?: string } } =
      await fetchKlaviyoAPI<{
        data: KlaviyoMetric[];
        links?: { next?: string };
      }>(nextUrl);

    for (const m of metricsResponse.data ?? []) {
      const name = m.attributes.name;
      if (metricNames.includes(name) && !metrics.has(m.id)) {
        metrics.set(m.id, name);
      }
    }
    const pageNext: string | undefined = metricsResponse.links?.next;
    nextUrl = pageNext?.includes('/api/')
      ? pageNext.substring(pageNext.indexOf('/api/'))
      : pageNext;
    safetyPages += 1;
  }

  if (metrics.size === 0) {
    console.warn(
      `Klaviyo metrics lookup found none of [${metricNames.join(', ')}] — daily rollup skipped`,
    );
  } else if (metrics.size < metricNames.length) {
    const missing = metricNames.filter((n) => !Array.from(metrics.values()).includes(n));
    console.warn(`Klaviyo metrics lookup missing: ${missing.join(', ')}`);
  }

  // Fetch daily aggregates for each metric
  const results: Array<{ day: string; metric_id: string; metric_name: string; count: number; value: number }> = [];
  const endDate = new Date();
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - days);

  for (const metricId of metrics.keys()) {
    const metricName = metrics.get(metricId);
    if (!metricName) continue;
    // Build the request for this metric — daily bucket over the date range
    const payload = {
      filter: `greater-or-equal(timestamp,"${startDate.toISOString().split('T')[0]}T00:00:00Z")`,
      measurements: [
        {
          id: metricId,
          aggregation: 'sum',
        },
      ],
      grouping: {
        bucket: 'day',
      },
    };

    try {
      const aggregates = await fetchKlaviyoAPI<KlaviyoMetricAggregates>(
        '/metric-aggregates',
        'POST',
        payload,
      );

      for (const record of aggregates.data ?? []) {
        for (const measurement of record.attributes?.measurements ?? []) {
          const dayStr = measurement.timestamp.split('T')[0];
          results.push({
            day: dayStr,
            metric_id: metricId,
            metric_name: metricName,
            count: measurement.count ?? 0,
            value: measurement.value ? parseFloat(String(measurement.value)) : 0,
          });
        }
      }

      // Small delay to avoid rate limiting (75 req/min burst, 700 req/min steady)
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`Failed to fetch metric aggregates for ${metricId}:`, err);
      // Continue with other metrics on error
    }
  }

  return results;
}

// ============================================================================
// Nightly Rollup
// ============================================================================

export interface KlaviyoIngestResult {
  startDate: string;
  endDate: string;
  campaigns: { fetched: number; written: number };
  flows: { fetched: number; written: number };
  lists: { fetched: number; written: number };
  metricDays: { fetched: number; written: number };
  durationMs: number;
}

export async function ingestKlaviyoRollup(opts: {
  days?: number;
  maxCampaigns?: number;
  maxFlows?: number;
  maxLists?: number;
} = {}): Promise<KlaviyoIngestResult> {
  const startedAt = Date.now();
  const days = opts.days ?? 90;
  const maxCampaigns = opts.maxCampaigns ?? 50;
  const maxFlows = opts.maxFlows ?? 50;
  const maxLists = opts.maxLists ?? 100;

  const supa = createSupabaseAdmin();
  if (!supa) {
    throw new Error(
      'Supabase admin client unavailable — set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL',
    );
  }

  // Fetch from Klaviyo
  const [campaigns, flows, listsAndSegments, metricDays] = await Promise.all([
    fetchCampaigns(maxCampaigns),
    fetchFlows(maxFlows),
    fetchListsAndSegments(maxLists),
    fetchMetricsDaily(days),
  ]);

  // Compute date window for logging
  const endDate = new Date();
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  // 1. Campaigns — enrich each with its first campaign-message (subject, sender,
  //    preview text, rendered HTML) plus the aggregate values report (opens,
  //    clicks, revenue, orders, bounced, unsubs). Campaigns in statuses where
  //    the values report hasn't settled yet (Draft / Scheduled) silently keep
  //    their zeroed-out stats.
  let writtenCampaigns = 0;
  if (campaigns.length > 0) {
    const campaignIds = campaigns.map((c) => c.id);

    // a. First-message lookup (subject, sender, render-target id)
    const messageMap = await fetchCampaignMessages(campaignIds);

    // b. Aggregate stats via campaign-values-reports
    let statsMap: Map<string, KlaviyoCampaignValuesReport['data']>;
    try {
      statsMap = await fetchCampaignValuesReport(campaignIds);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Klaviyo campaign values report unavailable — stats will stay at 0: ${msg}`);
      statsMap = new Map();
    }

    // c. Rendered HTML (one render call per message, errors swallowed)
    const renderMap = new Map<string, RenderResult>();
    for (const cid of campaignIds) {
      const msg = messageMap.get(cid);
      if (!msg) continue;
      const render = await fetchCampaignMessageRender(msg.id);
      renderMap.set(cid, render);
      // Spacing between render calls.
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    const payload = campaigns.map((c) => {
      const msg = messageMap.get(c.id);
      const content = msg?.attributes.content ?? {};
      const stats = statsMap.get(c.id)?.attributes.results[0]?.statistics ?? {};
      const render = renderMap.get(c.id);
      const recipients =
        stats.recipients ?? c.attributes.num_recipients ?? 0;
      const opensUnique = stats.opens_unique ?? 0;
      const clicksUnique = stats.clicks_unique ?? 0;

      const plainText = (render?.text ?? '').trim();
      const previewText = plainText ? plainText.slice(0, 240) : null;

      return {
        id: c.id,
        name: c.attributes.name,
        subject_line:
          content.subject || c.attributes.subject_line || null,
        send_time: c.attributes.send_time ? new Date(c.attributes.send_time).toISOString() : null,
        status: c.attributes.status,
        num_recipients: recipients,
        opens: stats.opens ?? 0,
        opens_unique: opensUnique,
        clicks: stats.clicks ?? 0,
        clicks_unique: clicksUnique,
        revenue: stats.conversion_value ?? 0,
        orders: stats.conversion_uniques ?? 0,
        unsubscribes: stats.unsubscribes ?? 0,
        bounced: stats.bounced ?? 0,
        delivered: stats.delivered ?? 0,
        clicks_to_opens: stats.click_to_open_rate ?? 0,
        preview_html: render?.html ?? null,
        preview_text: previewText,
        preview_subject: content.subject || c.attributes.subject_line || null,
        from_email: content.from_email ?? null,
        from_label: content.from_label ?? null,
        reply_to_email: content.reply_to_email ?? null,
        preview_fetched_at: render?.html ? new Date().toISOString() : null,
      };
    });

    const up = await supa
      .from('dashboard_klaviyo_campaigns')
      .upsert(payload, { onConflict: 'id' });
    if (up.error) {
      // If the new columns don't exist yet, fall back to the core fields. Print
      // a hint so the operator knows to run the migration.
      if (
        up.error.code === '42703' || // column does not exist
        up.error.message?.toLowerCase().includes('column') ||
        up.error.message?.toLowerCase().includes('schema cache')
      ) {
        console.warn(
          `Klaviyo campaigns upsert hit missing columns — run \`npm run db:migrate:klaviyo-preview\`. Falling back to legacy columns. (${up.error.message})`,
        );
        const legacy = payload.map((p) => ({
          id: p.id,
          name: p.name,
          subject_line: p.subject_line,
          send_time: p.send_time,
          status: p.status,
          num_recipients: p.num_recipients,
          opens: p.opens,
          opens_unique: p.opens_unique,
          clicks: p.clicks,
          clicks_unique: p.clicks_unique,
          revenue: p.revenue,
          orders: p.orders,
          unsubscribes: p.unsubscribes,
          bounced: p.bounced,
        }));
        const retry = await supa
          .from('dashboard_klaviyo_campaigns')
          .upsert(legacy, { onConflict: 'id' });
        if (retry.error) throw new Error(`Campaigns upsert failed: ${retry.error.message}`);
      } else {
        throw new Error(`Campaigns upsert failed: ${up.error.message}`);
      }
    }
    writtenCampaigns = payload.length;
  }

  // 2. Flows — upsert by id
  let writtenFlows = 0;
  if (flows.length > 0) {
    const payload = flows.map((f) => ({
      id: f.id,
      name: f.attributes.name,
      status: f.attributes.status,
      trigger_type: f.attributes.trigger?.type || null,
      created: f.attributes.created_at ? new Date(f.attributes.created_at).toISOString() : null,
      updated: f.attributes.updated_at ? new Date(f.attributes.updated_at).toISOString() : null,
      recipients_28d: 0,
      opens_28d: 0,
      clicks_28d: 0,
      revenue_28d: 0,
      orders_28d: 0,
    }));

    const up = await supa.from('dashboard_klaviyo_flows').upsert(payload, { onConflict: 'id' });
    if (up.error) throw new Error(`Flows upsert failed: ${up.error.message}`);
    writtenFlows = payload.length;
  }

  // 3. Lists & Segments — truncate + reinsert
  const delLists = await supa.from('dashboard_klaviyo_lists').delete().neq('id', '');
  if (delLists.error) throw new Error(`Lists clear failed: ${delLists.error.message}`);

  let writtenLists = 0;
  if (listsAndSegments.length > 0) {
    const payload = listsAndSegments.map((item) => {
      const isSegment = 'profile_count' in item.attributes;
      return {
        id: item.id,
        name: item.attributes.name,
        type: isSegment ? 'segment' : 'list',
        profile_count: item.attributes.profile_count || 0,
        created: item.attributes.created_at ? new Date(item.attributes.created_at).toISOString() : null,
        updated: item.attributes.updated_at ? new Date(item.attributes.updated_at).toISOString() : null,
      };
    });

    const ins = await supa.from('dashboard_klaviyo_lists').insert(payload);
    if (ins.error) throw new Error(`Lists insert failed: ${ins.error.message}`);
    writtenLists = payload.length;
  }

  // 4. Metrics daily — upsert by (day, metric_id)
  let writtenMetricDays = 0;
  if (metricDays.length > 0) {
    const payload = metricDays.map((m) => ({
      day: m.day,
      metric_id: m.metric_id,
      metric_name: m.metric_name,
      count: m.count,
      value: m.value,
    }));

    const up = await supa
      .from('dashboard_klaviyo_metrics_days')
      .upsert(payload, { onConflict: 'day,metric_id' });
    if (up.error) throw new Error(`Metrics daily upsert failed: ${up.error.message}`);
    writtenMetricDays = payload.length;
  }

  const durationMs = Date.now() - startedAt;

  // 5. Sync log
  await supa.from('dashboard_klaviyo_sync_log').insert({
    window_start: startDateStr,
    window_end: endDateStr,
    rows_campaigns: writtenCampaigns,
    rows_flows: writtenFlows,
    rows_lists: writtenLists,
    rows_metric_days: writtenMetricDays,
    duration_ms: durationMs,
    ok: true,
  });

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    campaigns: { fetched: campaigns.length, written: writtenCampaigns },
    flows: { fetched: flows.length, written: writtenFlows },
    lists: { fetched: listsAndSegments.length, written: writtenLists },
    metricDays: { fetched: metricDays.length, written: writtenMetricDays },
    durationMs,
  };
}
