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
    subject_line?: string;
    send_time?: string;
    status: string;
    num_recipients?: number;
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
  // Find the metric IDs for key metrics
  const metricNames = ['Placed Order', 'Opened Email', 'Clicked Email'];
  const metrics: Map<string, string> = new Map(); // id -> name

  const metricsResponse = await fetchKlaviyoAPI<{
    data: KlaviyoMetric[];
    links?: { next?: string };
  }>('/metrics');

  for (const m of metricsResponse.data ?? []) {
    const name = m.attributes.name;
    if (metricNames.includes(name)) {
      metrics.set(m.id, name);
    }
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

  // 1. Campaigns — upsert by id
  let writtenCampaigns = 0;
  if (campaigns.length > 0) {
    const payload = campaigns.map((c) => ({
      id: c.id,
      name: c.attributes.name,
      subject_line: c.attributes.subject_line || null,
      send_time: c.attributes.send_time ? new Date(c.attributes.send_time).toISOString() : null,
      status: c.attributes.status,
      num_recipients: c.attributes.num_recipients || 0,
      opens: 0,
      opens_unique: 0,
      clicks: 0,
      clicks_unique: 0,
      revenue: 0,
      orders: 0,
      unsubscribes: 0,
      bounced: 0,
    }));

    const up = await supa
      .from('dashboard_klaviyo_campaigns')
      .upsert(payload, { onConflict: 'id' });
    if (up.error) throw new Error(`Campaigns upsert failed: ${up.error.message}`);
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
