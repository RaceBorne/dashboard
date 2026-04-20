import { createSupabaseAdmin } from '@/lib/supabase/admin';

// -----------------------------------------------------------------------------
// Backlinks repository — reads the four DataForSEO rollup tables and shapes
// them into a single BacklinksOverview for the page to consume. Treats the
// evaribikes.com → evari.cc migration as a first-class comparison so the UI
// can show recovery progress at a glance.
// -----------------------------------------------------------------------------

export interface BacklinksSummary {
  target: string;
  rank: number;
  backlinks: number;
  backlinksNofollow: number;
  referringDomains: number;
  referringMainDomains: number;
  referringIps: number;
  referringSubnets: number;
  anchorTop10: Array<{ anchor: string; backlinks: number }>;
  firstSeen: string | null;
  lostDate: string | null;
  fetchedAt: string;
}

export interface BacklinkRow {
  id: number;
  target: string;
  urlFrom: string;
  urlTo: string;
  domainFrom: string;
  domainTo: string;
  anchor: string | null;
  isNofollow: boolean;
  isBroken: boolean;
  pageFromRank: number | null;
  domainFromRank: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface ReferringDomainRow {
  target: string;
  domainFrom: string;
  backlinks: number;
  firstSeen: string | null;
  lastSeen: string | null;
  rank: number | null;
}

export interface SyncLogEntry {
  product: string;
  ranAt: string;
  target: string | null;
  costUsd: number | null;
  rowsWritten: number;
  durationMs: number;
  ok: boolean;
  error: string | null;
}

export interface BacklinksOverview {
  summaries: BacklinksSummary[];
  topDomainsByTarget: Record<string, ReferringDomainRow[]>; // top 25 per target, by rank
  recentBacklinksByTarget: Record<string, BacklinkRow[]>; // top 25 per target, by last_seen
  lastSync: SyncLogEntry | null;
  recentSyncs: SyncLogEntry[]; // last 10 backlinks ingests
  connected: boolean;
  hasData: boolean;
}

/** Primary Evari targets. First element is treated as the "new" domain, second as "legacy". */
export const EVARI_TARGETS = ['evari.cc', 'evaribikes.com'] as const;

export async function getBacklinksOverview(): Promise<BacklinksOverview> {
  const supa = createSupabaseAdmin();
  const connected = Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);

  if (!supa) {
    return {
      summaries: [],
      topDomainsByTarget: {},
      recentBacklinksByTarget: {},
      lastSync: null,
      recentSyncs: [],
      connected,
      hasData: false,
    };
  }

  const [summariesRes, domainsRes, backlinksRes, syncsRes] = await Promise.all([
    supa
      .from('dashboard_dataforseo_backlinks_summary')
      .select(
        'target, rank, backlinks, backlinks_nofollow, referring_domains, referring_main_domains, referring_ips, referring_subnets, anchor_text_top10, first_seen, lost_date, fetched_at',
      ),
    supa
      .from('dashboard_dataforseo_referring_domains')
      .select('target, domain_from, backlinks, first_seen, last_seen, rank')
      .order('rank', { ascending: false, nullsFirst: false })
      .limit(500),
    supa
      .from('dashboard_dataforseo_backlinks')
      .select(
        'id, target, url_from, url_to, domain_from, domain_to, anchor, is_nofollow, is_broken, page_from_rank, domain_from_rank, first_seen, last_seen',
      )
      .order('last_seen', { ascending: false, nullsFirst: false })
      .limit(500),
    supa
      .from('dashboard_dataforseo_sync_log')
      .select('product, ran_at, target, cost_usd, rows_written, duration_ms, ok, error')
      .eq('product', 'backlinks')
      .order('ran_at', { ascending: false })
      .limit(10),
  ]);

  const summaries: BacklinksSummary[] = (summariesRes.data ?? []).map((r) => ({
    target: r.target as string,
    rank: (r.rank as number) ?? 0,
    backlinks: (r.backlinks as number) ?? 0,
    backlinksNofollow: (r.backlinks_nofollow as number) ?? 0,
    referringDomains: (r.referring_domains as number) ?? 0,
    referringMainDomains: (r.referring_main_domains as number) ?? 0,
    referringIps: (r.referring_ips as number) ?? 0,
    referringSubnets: (r.referring_subnets as number) ?? 0,
    anchorTop10:
      (r.anchor_text_top10 as Array<{ anchor: string; backlinks: number }> | null) ?? [],
    firstSeen: (r.first_seen as string | null) ?? null,
    lostDate: (r.lost_date as string | null) ?? null,
    fetchedAt: String(r.fetched_at),
  }));

  // Order summaries so primary Evari targets always come first and in the
  // canonical order (evari.cc, then evaribikes.com), then any others.
  summaries.sort((a, b) => {
    const ia = EVARI_TARGETS.indexOf(a.target as (typeof EVARI_TARGETS)[number]);
    const ib = EVARI_TARGETS.indexOf(b.target as (typeof EVARI_TARGETS)[number]);
    const sa = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
    const sb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
    if (sa !== sb) return sa - sb;
    return a.target.localeCompare(b.target);
  });

  // Group top domains by target, cap at 25 per target
  const topDomainsByTarget: Record<string, ReferringDomainRow[]> = {};
  for (const r of domainsRes.data ?? []) {
    const target = r.target as string;
    if (!topDomainsByTarget[target]) topDomainsByTarget[target] = [];
    if (topDomainsByTarget[target].length >= 25) continue;
    topDomainsByTarget[target].push({
      target,
      domainFrom: r.domain_from as string,
      backlinks: (r.backlinks as number) ?? 0,
      firstSeen: (r.first_seen as string | null) ?? null,
      lastSeen: (r.last_seen as string | null) ?? null,
      rank: (r.rank as number | null) ?? null,
    });
  }

  // Group recent backlinks by target, cap at 25 per target
  const recentBacklinksByTarget: Record<string, BacklinkRow[]> = {};
  for (const r of backlinksRes.data ?? []) {
    const target = r.target as string;
    if (!recentBacklinksByTarget[target]) recentBacklinksByTarget[target] = [];
    if (recentBacklinksByTarget[target].length >= 25) continue;
    recentBacklinksByTarget[target].push({
      id: r.id as number,
      target,
      urlFrom: r.url_from as string,
      urlTo: r.url_to as string,
      domainFrom: r.domain_from as string,
      domainTo: r.domain_to as string,
      anchor: (r.anchor as string | null) ?? null,
      isNofollow: Boolean(r.is_nofollow),
      isBroken: Boolean(r.is_broken),
      pageFromRank: (r.page_from_rank as number | null) ?? null,
      domainFromRank: (r.domain_from_rank as number | null) ?? null,
      firstSeen: (r.first_seen as string | null) ?? null,
      lastSeen: (r.last_seen as string | null) ?? null,
    });
  }

  const recentSyncs: SyncLogEntry[] = (syncsRes.data ?? []).map((r) => ({
    product: r.product as string,
    ranAt: String(r.ran_at),
    target: (r.target as string | null) ?? null,
    costUsd: (r.cost_usd as number | null) ?? null,
    rowsWritten: (r.rows_written as number) ?? 0,
    durationMs: (r.duration_ms as number) ?? 0,
    ok: Boolean(r.ok),
    error: (r.error as string | null) ?? null,
  }));

  return {
    summaries,
    topDomainsByTarget,
    recentBacklinksByTarget,
    lastSync: recentSyncs[0] ?? null,
    recentSyncs,
    connected,
    hasData: summaries.length > 0,
  };
}
