import { createSupabaseAdmin } from '@/lib/supabase/admin';

// -----------------------------------------------------------------------------
// Keyword workspace repository.
//
// Reads the two list tables (dashboard_keyword_lists + _members) and stitches
// them against the three existing DataForSEO tables to produce an enriched
// view ready for the UI:
//
//   lists       → metadata for every active list (own + competitors)
//   members     → per-list rows with market data + our position + their position
//
// Single source of truth:
//   - market data (volume, CPC, KD, intent)  → dashboard_dataforseo_keyword_data
//   - us positions                           → dashboard_dataforseo_serp_keywords (target='evari.cc')
//   - them positions                         → dashboard_dataforseo_serp_keywords (target=<competitor domain>)
//
// We never cache positions on the member row — competitor lists with 500
// members can be rebuilt in a single DFS call without fanning out writes.
// -----------------------------------------------------------------------------

export type ListKind = 'own' | 'competitor';
export type MemberSource = 'manual' | 'auto' | 'gsc' | 'seed';

export interface KeywordList {
  id: number;
  slug: string;
  label: string;
  kind: ListKind;
  targetDomain: string | null;
  colorTone: string;
  locationCode: number;
  languageCode: string;
  notes: string | null;
  createdAt: string;
  lastSyncedAt: string | null;
  lastSyncCostUsd: number | null;
  memberCount: number;
}

export interface KeywordMember {
  listId: number;
  keyword: string;
  source: MemberSource;
  priority: number;
  notes: string | null;
  addedAt: string;

  // Market data (shared across every list).
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  competitionLevel: string | null;
  keywordDifficulty: number | null;
  searchIntent: string | null;

  // Position on Evari's own site — null if we haven't SERP-tracked this keyword
  // for target='evari.cc'.
  ourPosition: number | null;
  ourUrl: string | null;
  ourCheckedAt: string | null;

  // Position on the competitor domain this list targets. Only populated for
  // competitor lists. null when we haven't ingested ranked_keywords for the
  // list (or the keyword ranks beyond the depth we fetched).
  theirPosition: number | null;
  theirUrl: string | null;
  theirTitle: string | null;
  theirCheckedAt: string | null;

  // SERP features Evari appears alongside (from the serp_keywords row for
  // target='evari.cc'). Useful for the Features donut chart.
  serpFeatures: string[];
}

export interface KeywordWorkspace {
  lists: KeywordList[];
  membersByList: Record<number, KeywordMember[]>;
  connected: boolean; // DataForSEO env set?
  hasData: boolean;  // any list has >= 1 member?
}

interface MarketDataRow {
  keyword: string;
  location_code: number;
  language_code: string;
  search_volume: number | null;
  cpc: number | null;
  competition: number | null;
  competition_level: string | null;
  keyword_difficulty: number | null;
  search_intent: string | null;
}

interface SerpKeywordRow {
  keyword: string;
  target: string;
  location_code: number;
  language_code: string;
  latest_position: number | null;
  latest_url: string | null;
  latest_title: string | null;
  latest_serp_features: string[] | null;
  latest_checked_at: string | null;
}

const OUR_DOMAIN = 'evari.cc';

export async function getKeywordWorkspace(): Promise<KeywordWorkspace> {
  const supa = createSupabaseAdmin();
  const connected = Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);

  if (!supa) {
    return { lists: [], membersByList: {}, connected, hasData: false };
  }

  // 1. Active lists.
  const { data: listRows, error: listErr } = await supa
    .from('dashboard_keyword_lists')
    .select(
      'id, slug, label, kind, target_domain, color_tone, location_code, language_code, notes, created_at, last_synced_at, last_sync_cost_usd',
    )
    .is('retired_at', null);

  if (listErr || !listRows || listRows.length === 0) {
    return { lists: [], membersByList: {}, connected, hasData: false };
  }

  // 2. All members for those lists.
  const listIds = listRows.map((l) => l.id as number);
  const { data: memRows } = await supa
    .from('dashboard_keyword_list_members')
    .select('list_id, keyword, source, priority, notes, added_at')
    .in('list_id', listIds);

  const membersRaw = memRows ?? [];

  // Unique keyword set — we'll query market data + SERP once for the union.
  const uniqueKeywords = Array.from(
    new Set(membersRaw.map((m) => String(m.keyword).toLowerCase().trim())),
  );

  // 3. Market data for all unique keywords (one big IN query, not per-keyword).
  //    Filter by location_code/language_code only once we know we need more than
  //    one locale. For now the app is single-locale (UK/en), so skip filtering
  //    and let the client resolve per-list.
  let marketRows: MarketDataRow[] = [];
  if (uniqueKeywords.length > 0) {
    const { data } = await supa
      .from('dashboard_dataforseo_keyword_data')
      .select(
        'keyword, location_code, language_code, search_volume, cpc, competition, competition_level, keyword_difficulty, search_intent',
      )
      .in('keyword', uniqueKeywords);
    marketRows = (data ?? []) as MarketDataRow[];
  }

  // 4. SERP positions. We need rows for target='evari.cc' AND for every
  //    competitor domain referenced by a competitor list.
  const competitorTargets = new Set<string>();
  for (const l of listRows) {
    if (l.kind === 'competitor' && l.target_domain) {
      competitorTargets.add(String(l.target_domain).toLowerCase());
    }
  }
  const allTargets = Array.from(new Set([OUR_DOMAIN, ...competitorTargets]));

  let serpRows: SerpKeywordRow[] = [];
  if (uniqueKeywords.length > 0 && allTargets.length > 0) {
    const { data } = await supa
      .from('dashboard_dataforseo_serp_keywords')
      .select(
        'keyword, target, location_code, language_code, latest_position, latest_url, latest_title, latest_serp_features, latest_checked_at',
      )
      .in('keyword', uniqueKeywords)
      .in('target', allTargets);
    serpRows = (data ?? []) as SerpKeywordRow[];
  }

  // 5. Index market + SERP rows for O(1) lookup.
  const marketKey = (kw: string, loc: number, lang: string) => `${kw}|${loc}|${lang}`;
  const marketIndex = new Map<string, MarketDataRow>();
  for (const r of marketRows) {
    marketIndex.set(marketKey(r.keyword, r.location_code, r.language_code), r);
  }

  const serpKey = (kw: string, tgt: string, loc: number, lang: string) =>
    `${kw}|${tgt}|${loc}|${lang}`;
  const serpIndex = new Map<string, SerpKeywordRow>();
  for (const r of serpRows) {
    serpIndex.set(serpKey(r.keyword, r.target, r.location_code, r.language_code), r);
  }

  // 6. Assemble each list's enriched members.
  const membersByList: Record<number, KeywordMember[]> = {};
  const memberCountByList: Record<number, number> = {};

  for (const list of listRows) {
    membersByList[list.id as number] = [];
    memberCountByList[list.id as number] = 0;
  }

  for (const m of membersRaw) {
    const listRow = listRows.find((l) => l.id === m.list_id);
    if (!listRow) continue;

    const keyword = String(m.keyword).toLowerCase().trim();
    const loc = listRow.location_code as number;
    const lang = listRow.language_code as string;

    const market = marketIndex.get(marketKey(keyword, loc, lang));

    const us = serpIndex.get(serpKey(keyword, OUR_DOMAIN, loc, lang));
    const them =
      listRow.kind === 'competitor' && listRow.target_domain
        ? serpIndex.get(
            serpKey(keyword, String(listRow.target_domain).toLowerCase(), loc, lang),
          )
        : undefined;

    membersByList[listRow.id as number].push({
      listId: listRow.id as number,
      keyword,
      source: (m.source as MemberSource) ?? 'manual',
      priority: (m.priority as number) ?? 0,
      notes: (m.notes as string | null) ?? null,
      addedAt: String(m.added_at),

      searchVolume: market?.search_volume ?? null,
      cpc: market?.cpc != null ? Number(market.cpc) : null,
      competition: market?.competition != null ? Number(market.competition) : null,
      competitionLevel: market?.competition_level ?? null,
      keywordDifficulty: market?.keyword_difficulty ?? null,
      searchIntent: market?.search_intent ?? null,

      ourPosition: us?.latest_position ?? null,
      ourUrl: us?.latest_url ?? null,
      ourCheckedAt: us?.latest_checked_at ?? null,

      theirPosition: them?.latest_position ?? null,
      theirUrl: them?.latest_url ?? null,
      theirTitle: them?.latest_title ?? null,
      theirCheckedAt: them?.latest_checked_at ?? null,

      serpFeatures: (us?.latest_serp_features as string[] | null) ?? [],
    });

    memberCountByList[listRow.id as number] =
      (memberCountByList[listRow.id as number] ?? 0) + 1;
  }

  // Sort each list: priority desc, then search volume desc, then keyword asc.
  for (const id of Object.keys(membersByList)) {
    const numId = Number(id);
    membersByList[numId].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const av = a.searchVolume ?? -1;
      const bv = b.searchVolume ?? -1;
      if (bv !== av) return bv - av;
      return a.keyword.localeCompare(b.keyword);
    });
  }

  const lists: KeywordList[] = listRows
    .map((l) => ({
      id: l.id as number,
      slug: l.slug as string,
      label: l.label as string,
      kind: l.kind as ListKind,
      targetDomain: (l.target_domain as string | null) ?? null,
      colorTone: (l.color_tone as string) ?? 'accent',
      locationCode: l.location_code as number,
      languageCode: l.language_code as string,
      notes: (l.notes as string | null) ?? null,
      createdAt: String(l.created_at),
      lastSyncedAt: (l.last_synced_at as string | null) ?? null,
      lastSyncCostUsd: (l.last_sync_cost_usd as number | null) ?? null,
      memberCount: memberCountByList[l.id as number] ?? 0,
    }))
    // Own lists first, then competitors alphabetically.
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'own' ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

  const hasData = Object.values(membersByList).some((arr) => arr.length > 0);

  return { lists, membersByList, connected, hasData };
}
