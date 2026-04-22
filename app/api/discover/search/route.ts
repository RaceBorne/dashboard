import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  isDataForSeoConnected,
  searchBusinessListings,
  type BusinessListing,
} from '@/lib/integrations/dataforseo';
import type {
  DiscoverCard,
  DiscoverFilters,
  DiscoveredCompany,
} from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/discover/search
 *
 * Body: { filters: DiscoverFilters }
 * Returns: { companies: DiscoverCard[], source: 'dfs' | 'cache' | 'mixed' }
 *
 * Strategy:
 *   1. If savedOnly OR no include filters are set, return paginated cache only.
 *   2. Otherwise, query DataForSEO Business Listings with the union of
 *      industry+keyword includes and location includes. Overlay any cached
 *      enrichment (employeeBand, emailCount) onto the DFS rows.
 *   3. Apply exclude filters and size / companyType / technologies filters
 *      client-side (these need enriched data we only have in the cache).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    filters?: DiscoverFilters;
    limit?: number;
  };
  const filters = body.filters ?? {};
  const limit = Math.min(Math.max(body.limit ?? 50, 5), 200);

  const supabase = createSupabaseAdmin();
  const cacheByDomain = new Map<string, DiscoveredCompany>();

  if (supabase) {
    const { data } = await supabase
      .from('dashboard_discovered_companies')
      .select('domain, payload')
      .limit(1000);
    for (const row of (data ?? []) as Array<{ domain: string; payload: DiscoveredCompany }>) {
      cacheByDomain.set(row.domain, row.payload);
    }
  }

  // ---- Saved-only path ----------------------------------------------------
  if (filters.savedOnly) {
    const companies = Array.from(cacheByDomain.values())
      .filter((c) => passesFilters(c, filters))
      .slice(0, limit)
      .map((c) => toCard(c));
    return NextResponse.json({
      ok: true,
      companies,
      source: 'cache' as const,
    });
  }

  // ---- DataForSEO fan-out -------------------------------------------------
  const hasAnyInclude =
    (filters.industry?.include?.length ?? 0) +
      (filters.keywords?.include?.length ?? 0) +
      (filters.location?.include?.length ?? 0) +
      (filters.companyName?.include?.length ?? 0) +
      (filters.similarTo?.length ?? 0) >
    0;

  if (!hasAnyInclude) {
    // Nothing to search on — return the cache so the page isn't empty.
    const companies = Array.from(cacheByDomain.values())
      .slice(0, limit)
      .map((c) => toCard(c));
    return NextResponse.json({ ok: true, companies, source: 'cache' as const });
  }

  const listings: BusinessListing[] = [];
  const seenDomains = new Set<string>();

  if (isDataForSeoConnected()) {
    const industryTerms = filters.industry?.include ?? [];
    const keywordTerms = filters.keywords?.include ?? [];
    const companyNameTerms = filters.companyName?.include ?? [];
    const locationTerms = filters.location?.include?.length
      ? filters.location.include
      : ['United Kingdom'];

    // Build keyword-style descriptions. DFS Business Listings accepts a single
    // description per request, so we fan out and union.
    const descriptions: string[] = [];
    const coreTerms = [...industryTerms, ...keywordTerms, ...companyNameTerms].filter(
      (s) => s.trim().length > 0,
    );
    if (coreTerms.length === 0) {
      descriptions.push(locationTerms[0]);
    } else {
      for (const term of coreTerms) descriptions.push(term.trim());
    }

    const queries: Array<{ description: string; locationName: string }> = [];
    for (const d of descriptions) {
      for (const loc of locationTerms) {
        queries.push({ description: d, locationName: loc });
      }
    }
    const cappedQueries = queries.slice(0, 6); // avoid blowing DFS credit

    const perQueryLimit = Math.max(20, Math.floor(limit / Math.max(1, cappedQueries.length)));
    const fanouts = await Promise.allSettled(
      cappedQueries.map((q) =>
        searchBusinessListings({
          description: q.description,
          locationName: q.locationName,
          limit: perQueryLimit,
        }),
      ),
    );
    for (const r of fanouts) {
      if (r.status !== 'fulfilled') continue;
      for (const l of r.value.listings) {
        const d = normaliseDomain(l.domain ?? l.url);
        if (!d) continue;
        if (seenDomains.has(d)) continue;
        seenDomains.add(d);
        listings.push({ ...l, domain: d });
      }
    }
  }

  // Also include saved companies that match — union with DFS rows.
  for (const [d, c] of cacheByDomain.entries()) {
    if (!seenDomains.has(d) && passesFilters(c, filters)) {
      seenDomains.add(d);
      listings.push({
        title: c.name,
        url: 'https://' + d,
        domain: d,
        category: c.category,
      });
    }
  }

  // ---- Apply excludes + headcount + type filters on cached enrichments ----
  const cards: DiscoverCard[] = [];
  for (const l of listings) {
    const d = normaliseDomain(l.domain ?? l.url);
    if (!d) continue;

    const cached = cacheByDomain.get(d);

    // Location exclude — match by substring on address/hq
    if (filters.location?.exclude?.length) {
      const hay = [l.address ?? '', cached?.hq?.full ?? '', cached?.hq?.country ?? '']
        .join(' ')
        .toLowerCase();
      if (filters.location.exclude.some((x) => hay.includes(x.toLowerCase()))) continue;
    }

    // Industry exclude
    if (filters.industry?.exclude?.length) {
      const hay = (l.category ?? cached?.category ?? '').toLowerCase();
      if (filters.industry.exclude.some((x) => hay.includes(x.toLowerCase()))) continue;
    }

    // Keyword exclude — matches name/description
    if (filters.keywords?.exclude?.length) {
      const hay = [l.title ?? '', cached?.description ?? '', cached?.name ?? '']
        .join(' ')
        .toLowerCase();
      if (filters.keywords.exclude.some((x) => hay.includes(x.toLowerCase()))) continue;
    }

    // Company name exclude
    if (filters.companyName?.exclude?.length) {
      const hay = (l.title ?? cached?.name ?? '').toLowerCase();
      if (filters.companyName.exclude.some((x) => hay.includes(x.toLowerCase()))) continue;
    }

    // Size band — needs enrichment
    if (filters.sizeBands && filters.sizeBands.length > 0) {
      if (!cached?.employeeBand) continue;
      if (!filters.sizeBands.includes(cached.employeeBand)) continue;
    }

    // Company type — needs enrichment
    if (filters.companyType?.include?.length) {
      if (!cached?.orgType) continue;
      const includes = filters.companyType.include.map((x) => x.toLowerCase());
      if (!includes.includes(cached.orgType.toLowerCase())) continue;
    }

    // Technologies — needs enrichment
    if (filters.technologies?.length) {
      if (!cached?.technologies?.length) continue;
      const have = cached.technologies.map((x) => x.toLowerCase());
      const want = filters.technologies.map((x) => x.toLowerCase());
      if (!want.every((w) => have.some((h) => h.includes(w)))) continue;
    }

    // Founded year
    if (filters.foundedYearMin && (!cached?.foundedYear || cached.foundedYear < filters.foundedYearMin))
      continue;
    if (filters.foundedYearMax && (!cached?.foundedYear || cached.foundedYear > filters.foundedYearMax))
      continue;

    cards.push({
      domain: d,
      name: cached?.name ?? l.title ?? d,
      logoUrl: cached?.logoUrl,
      category: cached?.category ?? l.category,
      employeeBand: cached?.employeeBand,
      hqLabel: shortHq(l.address ?? cached?.hq?.full),
      enriched: Boolean(cached?.enrichedAt),
      emailCount: cached?.emails?.length,
    });
    if (cards.length >= limit) break;
  }

  return NextResponse.json({
    ok: true,
    companies: cards,
    source: listings.length > 0 ? ('mixed' as const) : ('cache' as const),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseDomain(input: string | undefined): string {
  if (!input) return '';
  const s = input.trim().toLowerCase();
  if (!s) return '';
  try {
    const url = s.startsWith('http') ? new URL(s) : new URL('https://' + s);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

function shortHq(addr: string | undefined): string | undefined {
  if (!addr) return undefined;
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  // Prefer the last two parts (city + country) since the street is noise
  return parts.slice(-2).join(', ');
}

function toCard(c: DiscoveredCompany): DiscoverCard {
  return {
    domain: c.domain,
    name: c.name,
    logoUrl: c.logoUrl,
    category: c.category,
    employeeBand: c.employeeBand,
    hqLabel: c.hq?.full ? shortHq(c.hq.full) : c.hq?.country,
    enriched: Boolean(c.enrichedAt),
    emailCount: c.emails?.length,
  };
}

function passesFilters(c: DiscoveredCompany, filters: DiscoverFilters): boolean {
  if (filters.location?.include?.length) {
    const hay = [c.hq?.full ?? '', c.hq?.country ?? '', c.hq?.city ?? '']
      .join(' ')
      .toLowerCase();
    if (!filters.location.include.some((x) => hay.includes(x.toLowerCase()))) return false;
  }
  if (filters.industry?.include?.length) {
    const hay = (c.category ?? '').toLowerCase();
    if (!filters.industry.include.some((x) => hay.includes(x.toLowerCase()))) return false;
  }
  if (filters.keywords?.include?.length) {
    const hay = [c.name, c.description ?? '', (c.keywords ?? []).join(' ')].join(' ').toLowerCase();
    if (!filters.keywords.include.some((x) => hay.includes(x.toLowerCase()))) return false;
  }
  if (filters.companyName?.include?.length) {
    const hay = c.name.toLowerCase();
    if (!filters.companyName.include.some((x) => hay.includes(x.toLowerCase()))) return false;
  }
  if (filters.sizeBands?.length) {
    if (!c.employeeBand) return false;
    if (!filters.sizeBands.includes(c.employeeBand)) return false;
  }
  if (filters.companyType?.include?.length) {
    if (!c.orgType) return false;
    const includes = filters.companyType.include.map((x) => x.toLowerCase());
    if (!includes.includes(c.orgType.toLowerCase())) return false;
  }
  if (filters.technologies?.length) {
    if (!c.technologies?.length) return false;
    const have = c.technologies.map((x) => x.toLowerCase());
    const want = filters.technologies.map((x) => x.toLowerCase());
    if (!want.every((w) => have.some((h) => h.includes(w)))) return false;
  }
  return true;
}
