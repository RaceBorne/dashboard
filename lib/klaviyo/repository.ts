import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { isKlaviyoConnected } from '@/lib/integrations/klaviyo';

// -----------------------------------------------------------------------------
// Klaviyo repository — the read layer for the /klaviyo page.
//
// Shapes everything the client needs in one snapshot:
//   - per-campaign rows (newest first) with preview HTML + all engagement stats
//   - per-flow rows (automated sequences — welcome, abandoned cart, etc.)
//   - 28d aggregate KPIs (sends, recipients, avg open rate, avg CTR, revenue)
//   - 90d daily trend (opens, clicks, placed orders) for KPI sparklines
//   - hero list stats (top ~12 lists/segments by profile count)
// -----------------------------------------------------------------------------

export interface KlaviyoCampaignRow {
  id: string;
  name: string;
  subject: string | null;
  previewText: string | null;
  previewHtml: string | null;
  fromLabel: string | null;
  fromEmail: string | null;
  sendTime: string | null; // ISO date
  status: string | null;
  recipients: number;
  delivered: number;
  opens: number;
  opensUnique: number;
  openRate: number; // 0..1
  clicks: number;
  clicksUnique: number;
  clickRate: number; // 0..1
  clickToOpenRate: number; // 0..1
  revenue: number;
  orders: number;
  unsubscribes: number;
  bounced: number;
  revenuePerRecipient: number;
}

export interface KlaviyoFlowRow {
  id: string;
  name: string;
  status: string | null;
  triggerType: string | null;
  recipients28d: number;
  opens28d: number;
  clicks28d: number;
  revenue28d: number;
  orders28d: number;
  updatedAt: string | null;
}

export interface KlaviyoListRow {
  id: string;
  name: string;
  type: string | null;
  profileCount: number;
  updatedAt: string | null;
}

export interface KlaviyoTrendPoint {
  day: string;
  opens: number;
  clicks: number;
  orders: number;
  revenue: number;
}

export interface KlaviyoAggregateKpi {
  label: string;
  value: number;
  previousValue: number;
  delta: number;
  deltaPct: number;
  format: 'count' | 'currency' | 'percent';
  trend: Array<{ day: string; value: number }>;
}

export interface KlaviyoSnapshot {
  connected: boolean;
  hasData: boolean;
  lastSyncedAt: string | null;
  windowStart: string; // 28d window start ISO
  windowEnd: string; // today ISO
  campaigns: KlaviyoCampaignRow[];
  flows: KlaviyoFlowRow[];
  lists: KlaviyoListRow[];
  trend90: KlaviyoTrendPoint[];
  kpis: {
    sends28d: KlaviyoAggregateKpi;
    recipients28d: KlaviyoAggregateKpi;
    avgOpenRate28d: KlaviyoAggregateKpi;
    avgClickRate28d: KlaviyoAggregateKpi;
    revenue28d: KlaviyoAggregateKpi;
    revenuePerSend28d: KlaviyoAggregateKpi;
  };
}

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

function safeDiv(num: number, denom: number): number {
  return denom > 0 ? num / denom : 0;
}

function pct(delta: number, prev: number): number {
  return prev > 0 ? delta / prev : 0;
}

export async function getKlaviyoSnapshot(): Promise<KlaviyoSnapshot> {
  const empty = emptySnapshot();
  const supa = createSupabaseAdmin();
  if (!supa) return { ...empty, connected: isKlaviyoConnected() };

  const endDate = todayUTC();
  const windowStart = shiftDays(endDate, -27);
  const prevEnd = shiftDays(windowStart, -1);
  const prevStart = shiftDays(prevEnd, -27);
  const trendStart = shiftDays(endDate, -89);

  const [campaignsRes, flowsRes, listsRes, metricsRes, syncRes] = await Promise.all([
    supa
      .from('dashboard_klaviyo_campaigns')
      .select(
        'id, name, subject_line, send_time, status, num_recipients, delivered, opens, opens_unique, clicks, clicks_unique, clicks_to_opens, revenue, orders, unsubscribes, bounced, preview_html, preview_text, from_email, from_label',
      )
      .order('send_time', { ascending: false, nullsFirst: false })
      .limit(100),
    supa
      .from('dashboard_klaviyo_flows')
      .select(
        'id, name, status, trigger_type, recipients_28d, opens_28d, clicks_28d, revenue_28d, orders_28d, updated',
      )
      .order('revenue_28d', { ascending: false })
      .limit(40),
    supa
      .from('dashboard_klaviyo_lists')
      .select('id, name, type, profile_count, updated')
      .order('profile_count', { ascending: false })
      .limit(12),
    supa
      .from('dashboard_klaviyo_metrics_days')
      .select('day, metric_name, count, value')
      .gte('day', isoDate(trendStart))
      .order('day', { ascending: true }),
    supa
      .from('dashboard_klaviyo_sync_log')
      .select('ran_at')
      .order('ran_at', { ascending: false })
      .limit(1),
  ]);

  // Campaigns — compute per-row derived metrics (open rate, click rate, CTOR,
  // revenue-per-recipient). We fall back to computed values when the report
  // hasn't populated `click_to_open_rate` yet.
  const campaignsRaw = (campaignsRes.data ?? []) as Array<Record<string, unknown>>;
  const rawCampaigns: KlaviyoCampaignRow[] = campaignsRaw.map((r) => {
    const recipients = (r.num_recipients as number) ?? 0;
    const delivered = (r.delivered as number) ?? recipients;
    const opensUnique = (r.opens_unique as number) ?? 0;
    const clicksUnique = (r.clicks_unique as number) ?? 0;
    const ctorStored = (r.clicks_to_opens as number) ?? 0;
    const revenue = Number(r.revenue ?? 0);

    return {
      id: r.id as string,
      name: (r.name as string) ?? '',
      subject: (r.subject_line as string | null) ?? null,
      previewText: (r.preview_text as string | null) ?? null,
      previewHtml: (r.preview_html as string | null) ?? null,
      fromLabel: (r.from_label as string | null) ?? null,
      fromEmail: (r.from_email as string | null) ?? null,
      sendTime: (r.send_time as string | null) ?? null,
      status: (r.status as string | null) ?? null,
      recipients,
      delivered,
      opens: (r.opens as number) ?? 0,
      opensUnique,
      openRate: safeDiv(opensUnique, delivered || recipients),
      clicks: (r.clicks as number) ?? 0,
      clicksUnique,
      clickRate: safeDiv(clicksUnique, delivered || recipients),
      clickToOpenRate: ctorStored > 0 ? ctorStored : safeDiv(clicksUnique, opensUnique),
      revenue,
      orders: (r.orders as number) ?? 0,
      unsubscribes: (r.unsubscribes as number) ?? 0,
      bounced: (r.bounced as number) ?? 0,
      revenuePerRecipient: safeDiv(revenue, recipients),
    };
  });

  // Only campaigns that actually went out the door: status === Sent AND a real
  // send_time. Drops drafts, queued, scheduled, sending-in-progress, and
  // cancelled campaigns. We deliberately do NOT require recipients > 0 because
  // Klaviyo's campaign-values stats endpoint can lag by several hours (or
  // silently return zero if the metrics sync hasn't run yet), so enforcing that
  // would hide real-but-just-sent campaigns.
  const campaigns = rawCampaigns.filter(
    (c) => c.sendTime && c.status === 'Sent',
  );

  const flowsRaw = (flowsRes.data ?? []) as Array<Record<string, unknown>>;
  const flows: KlaviyoFlowRow[] = flowsRaw.map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? '',
    status: (r.status as string | null) ?? null,
    triggerType: (r.trigger_type as string | null) ?? null,
    recipients28d: (r.recipients_28d as number) ?? 0,
    opens28d: (r.opens_28d as number) ?? 0,
    clicks28d: (r.clicks_28d as number) ?? 0,
    revenue28d: Number(r.revenue_28d ?? 0),
    orders28d: (r.orders_28d as number) ?? 0,
    updatedAt: (r.updated as string | null) ?? null,
  }));

  const listsRaw = (listsRes.data ?? []) as Array<Record<string, unknown>>;
  const lists: KlaviyoListRow[] = listsRaw.map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? '',
    type: (r.type as string | null) ?? null,
    profileCount: (r.profile_count as number) ?? 0,
    updatedAt: (r.updated as string | null) ?? null,
  }));

  // Build 90d daily trend from metrics_days (Opened Email, Clicked Email,
  // Placed Order) — one row per (day, metric), we pivot it into per-day.
  const metricsRaw = (metricsRes.data ?? []) as Array<Record<string, unknown>>;
  const trendMap = new Map<string, KlaviyoTrendPoint>();
  for (const r of metricsRaw) {
    const day = r.day as string;
    const name = (r.metric_name as string) ?? '';
    const count = (r.count as number) ?? 0;
    const value = Number(r.value ?? 0);
    let row = trendMap.get(day);
    if (!row) {
      row = { day, opens: 0, clicks: 0, orders: 0, revenue: 0 };
      trendMap.set(day, row);
    }
    if (name === 'Opened Email') row.opens += count;
    else if (name === 'Clicked Email') row.clicks += count;
    else if (name === 'Placed Order') {
      row.orders += count;
      row.revenue += value;
    }
  }
  const trend90 = Array.from(trendMap.values()).sort((a, b) => a.day.localeCompare(b.day));

  // 28d aggregate KPIs from the campaigns list — we only count campaigns whose
  // send_time falls inside the rolling window. Average rates are weighted by
  // recipient count so a tiny campaign doesn't tank the headline number.
  const sumInWindow = (from: Date, to: Date) => {
    const fromIso = isoDate(from);
    const toIso = isoDate(to);
    let sends = 0;
    let recipients = 0;
    let opensU = 0;
    let clicksU = 0;
    let revenue = 0;
    let delivered = 0;
    for (const c of campaigns) {
      const day = (c.sendTime ?? '').slice(0, 10);
      if (day < fromIso || day > toIso) continue;
      sends += 1;
      recipients += c.recipients;
      delivered += c.delivered;
      opensU += c.opensUnique;
      clicksU += c.clicksUnique;
      revenue += c.revenue;
    }
    const avgOpenRate = safeDiv(opensU, delivered || recipients);
    const avgClickRate = safeDiv(clicksU, delivered || recipients);
    const revenuePerSend = safeDiv(revenue, sends);
    return {
      sends,
      recipients,
      opensU,
      clicksU,
      revenue,
      delivered,
      avgOpenRate,
      avgClickRate,
      revenuePerSend,
    };
  };

  const cur = sumInWindow(windowStart, endDate);
  const prev = sumInWindow(prevStart, prevEnd);

  // Sparklines for KPI tiles — daily rollup of sent campaigns aggregated
  // across the last 90 days so each KPI has a tiny trend strip.
  const dailyCampaignStats = new Map<
    string,
    { sends: number; recipients: number; opensU: number; clicksU: number; revenue: number }
  >();
  for (const c of campaigns) {
    const day = (c.sendTime ?? '').slice(0, 10);
    if (!day) continue;
    let entry = dailyCampaignStats.get(day);
    if (!entry) {
      entry = { sends: 0, recipients: 0, opensU: 0, clicksU: 0, revenue: 0 };
      dailyCampaignStats.set(day, entry);
    }
    entry.sends += 1;
    entry.recipients += c.recipients;
    entry.opensU += c.opensUnique;
    entry.clicksU += c.clicksUnique;
    entry.revenue += c.revenue;
  }
  // Force the sparkline horizon to always include the full 90-day window so
  // sparse sending schedules still produce a recognizable shape.
  const allDays: string[] = [];
  for (let d = trendStart; d <= endDate; d = shiftDays(d, 1)) {
    allDays.push(isoDate(d));
  }
  const spark = (picker: (day: string) => number) =>
    allDays.map((day) => ({ day, value: picker(day) }));
  const sparkSends = spark((d) => dailyCampaignStats.get(d)?.sends ?? 0);
  const sparkRecipients = spark((d) => dailyCampaignStats.get(d)?.recipients ?? 0);
  const sparkOpenRate = spark((d) => {
    const entry = dailyCampaignStats.get(d);
    if (!entry || entry.recipients === 0) return 0;
    return entry.opensU / entry.recipients;
  });
  const sparkClickRate = spark((d) => {
    const entry = dailyCampaignStats.get(d);
    if (!entry || entry.recipients === 0) return 0;
    return entry.clicksU / entry.recipients;
  });
  const sparkRevenue = spark((d) => dailyCampaignStats.get(d)?.revenue ?? 0);
  const sparkRevenuePerSend = spark((d) => {
    const entry = dailyCampaignStats.get(d);
    if (!entry || entry.sends === 0) return 0;
    return entry.revenue / entry.sends;
  });

  const tile = (
    label: string,
    value: number,
    previousValue: number,
    format: KlaviyoAggregateKpi['format'],
    trend: Array<{ day: string; value: number }>,
  ): KlaviyoAggregateKpi => {
    const delta = value - previousValue;
    return {
      label,
      value,
      previousValue,
      delta,
      deltaPct: pct(delta, previousValue),
      format,
      trend,
    };
  };

  const kpis: KlaviyoSnapshot['kpis'] = {
    sends28d: tile('Sends', cur.sends, prev.sends, 'count', sparkSends),
    recipients28d: tile('Recipients', cur.recipients, prev.recipients, 'count', sparkRecipients),
    avgOpenRate28d: tile(
      'Avg open rate',
      cur.avgOpenRate,
      prev.avgOpenRate,
      'percent',
      sparkOpenRate,
    ),
    avgClickRate28d: tile(
      'Avg click rate',
      cur.avgClickRate,
      prev.avgClickRate,
      'percent',
      sparkClickRate,
    ),
    revenue28d: tile('Revenue', cur.revenue, prev.revenue, 'currency', sparkRevenue),
    revenuePerSend28d: tile(
      'Revenue per send',
      cur.revenuePerSend,
      prev.revenuePerSend,
      'currency',
      sparkRevenuePerSend,
    ),
  };

  const lastSyncedAt = (syncRes.data?.[0]?.ran_at as string | undefined) ?? null;
  const hasData = campaigns.length > 0 || flows.length > 0;

  return {
    connected: isKlaviyoConnected(),
    hasData,
    lastSyncedAt,
    windowStart: isoDate(windowStart),
    windowEnd: isoDate(endDate),
    campaigns,
    flows,
    lists,
    trend90,
    kpis,
  };
}

function emptySnapshot(): KlaviyoSnapshot {
  const blankKpi: KlaviyoAggregateKpi = {
    label: '',
    value: 0,
    previousValue: 0,
    delta: 0,
    deltaPct: 0,
    format: 'count',
    trend: [],
  };
  return {
    connected: false,
    hasData: false,
    lastSyncedAt: null,
    windowStart: '',
    windowEnd: '',
    campaigns: [],
    flows: [],
    lists: [],
    trend90: [],
    kpis: {
      sends28d: { ...blankKpi, label: 'Sends' },
      recipients28d: { ...blankKpi, label: 'Recipients' },
      avgOpenRate28d: { ...blankKpi, label: 'Avg open rate', format: 'percent' },
      avgClickRate28d: { ...blankKpi, label: 'Avg click rate', format: 'percent' },
      revenue28d: { ...blankKpi, label: 'Revenue', format: 'currency' },
      revenuePerSend28d: { ...blankKpi, label: 'Revenue per send', format: 'currency' },
    },
  };
}
