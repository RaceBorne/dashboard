/**
 * Auto-scan: populate a freshly-created Play's funnel with candidate
 * companies, in the background.
 *
 * The Play POST route schedules this via Next.js `after()`. We don't block
 * the response on it — Craig gets the Play id immediately and the funnel
 * fills in asynchronously. Status transitions are persisted on
 * `play.autoScan` so the UI can render a "Scanning…" pill that self-resolves
 * once the scan finishes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import {
  isDataForSeoConnected,
  searchBusinessListings,
  webSearchQuery,
  type BusinessListing,
} from '@/lib/integrations/dataforseo';
import { upsertLead } from '@/lib/dashboard/repository';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getOrCreateBrief } from '@/lib/marketing/strategy';
import type { Lead, Play, PlayAutoScanStatus, PlaySourceRun } from '@/lib/types';

interface SearchPlan {
  description: string;
  locationName: string;
  limit?: number;
}

export interface AutoScanResult {
  inserted: number;
  found: number;
  agent: 'dataforseo' | 'skipped';
  query?: SearchPlan;
  costUsd?: number;
  skipReason?: string;
}

/**
 * Main entry. Called from POST /api/plays via `after()`.
 */
export async function autoScanForPlay(
  supabase: SupabaseClient,
  play: Play,
  opts?: { limit?: number },
): Promise<AutoScanResult> {
  const startedAt = new Date().toISOString();
  await setStatus(supabase, play, {
    status: 'running',
    startedAt,
  });

  if (!isDataForSeoConnected()) {
    await finish(
      supabase,
      play,
      {
        status: 'skipped',
        startedAt,
        finishedAt: new Date().toISOString(),
        skipReason: 'DataForSEO not configured',
      },
      'Auto-scan skipped: DataForSEO not configured.',
    );
    return { inserted: 0, found: 0, agent: 'skipped', skipReason: 'no-dataforseo' };
  }
  if (!hasAIGatewayCredentials()) {
    await finish(
      supabase,
      play,
      {
        status: 'skipped',
        startedAt,
        finishedAt: new Date().toISOString(),
        skipReason: 'AI gateway not configured',
      },
      'Auto-scan skipped: AI gateway not configured.',
    );
    return { inserted: 0, found: 0, agent: 'skipped', skipReason: 'no-ai' };
  }

  let plans: SearchPlan[];
  try {
    plans = await derivePlansFromPlay(supabase, play, opts?.limit);
  } catch (err) {
    await finish(
      supabase,
      play,
      {
        status: 'error',
        startedAt,
        finishedAt: new Date().toISOString(),
        error: 'Plan failed: ' + (err as Error).message,
      },
      'Auto-scan skipped: could not derive search plan, ' + (err as Error).message,
    );
    return { inserted: 0, found: 0, agent: 'skipped', skipReason: 'plan-failed' };
  }

  // Run TWO sources in parallel: Business Listings (Google Places via
  // DataForSEO) AND organic SERP (Google web search via DataForSEO).
  // Listings give us local businesses; SERP scours company websites,
  // industry directories, and trade press for the same companies plus
  // the long-tail Listings doesn't index. Results are merged on
  // normalised domain so the same yacht builder can't show up twice
  // across sources or keyword variants.
  let listings: BusinessListing[] = [];
  let cost = 0;
  try {
    // Build the SERP query set from the same sector + geography
    // pairings, but with phrasings designed to surface directory
    // pages and company sites rather than local listings.
    const serpQueries = buildSerpQueriesFromPlans(plans);
    const [listingResults, serpResults] = await Promise.all([
      Promise.allSettled(
        plans.map((p) =>
          searchBusinessListings({
            description: p.description,
            locationName: p.locationName,
            limit: p.limit ?? 100,
          }),
        ),
      ),
      Promise.allSettled(
        serpQueries.map((q) => webSearchQuery({ query: q, limit: 30 })),
      ),
    ]);

    const seen = new Set<string>();
    for (const r of listingResults) {
      if (r.status !== 'fulfilled') continue;
      cost += r.value.cost;
      for (const l of r.value.listings) {
        const key = (l.domain || l.url || l.title).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        listings.push(l);
      }
    }
    // SERP hits: convert each hit into a BusinessListing-shaped row,
    // filtered to exclude obvious aggregator/news domains so we end up
    // with company sites only.
    for (const r of serpResults) {
      if (r.status !== 'fulfilled') continue;
      cost += r.value.cost;
      for (const h of r.value.hits) {
        const domain = (h.domain || '').toLowerCase().replace(/^www\./, '');
        if (!domain) continue;
        if (isAggregatorDomain(domain)) continue;
        if (seen.has(domain)) continue;
        seen.add(domain);
        listings.push({
          title: h.title,
          url: h.url,
          domain,
          phone: undefined,
          address: undefined,
          category: undefined,
          rating: undefined,
        });
      }
    }
    if (listings.length === 0) {
      const firstErr =
        ([...listingResults, ...serpResults]
          .find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined);
      if (firstErr) throw firstErr.reason;
    }
  } catch (err) {
    await finish(
      supabase,
      play,
      {
        status: 'error',
        startedAt,
        finishedAt: new Date().toISOString(),
        description: plans.map((p) => p.description).join(' | '),
        locationName: plans[0]?.locationName ?? '',
        error: 'DataForSEO call failed: ' + (err as Error).message,
      },
      'Auto-scan skipped: DataForSEO call failed, ' + (err as Error).message,
    );
    return { inserted: 0, found: 0, agent: 'skipped', skipReason: 'dfs-failed' };
  }

  const nowIso = new Date().toISOString();
  const category = play.category ?? play.title;
  let inserted = 0;

  for (const l of listings) {
    const row = listingToLead(l, play, category, nowIso);
    const out = await upsertLead(supabase, row);
    if (out) inserted += 1;
    // Also write a shortlist row so the Discovery dashboard surfaces
    // the company. The leads table is the canonical prospect record;
    // the shortlist is the per-play scoring + curation surface that
    // /api/discover/[playId]/dashboard reads from.
    await upsertShortlistFromListing(supabase, l, play.id);
  }

  const finishedAt = new Date().toISOString();
  const planSummary = plans.map((p) => p.description).join(', ');
  await finish(
    supabase,
    play,
    {
      status: 'done',
      startedAt,
      finishedAt,
      inserted,
      found: listings.length,
      description: planSummary,
      locationName: plans[0]?.locationName ?? '',
      costUsd: cost,
    },
    'Auto-scan sourced ' +
      inserted +
      ' candidate(s) across ' +
      plans.length +
      ' searches (DataForSEO, $' +
      cost.toFixed(3) +
      ').',
    // Also stamp scope.lastSourceRun so the detail panel's "Last run"
    // card shows the auto-scan result even before Craig runs Source
    // Prospects manually.
    {
      at: finishedAt,
      agent: 'auto-scan',
      description: planSummary,
      locationName: plans[0]?.locationName ?? '',
      found: listings.length,
      inserted,
      costUsd: cost,
    },
  );

  return {
    inserted,
    found: listings.length,
    agent: 'dataforseo',
    query: plans[0],
    costUsd: cost,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function derivePlansFromPlay(
  supabase: SupabaseClient,
  play: Play,
  limit: number | undefined,
): Promise<SearchPlan[]> {
  // Strategy brief drives the matrix when present: every sector
  // crossed with every geography (capped at 8 queries to keep cost
  // sane). Falls back to a single AI-generated plan otherwise.
  const brief = await getOrCreateBrief(play.id).catch(() => null);
  if (brief && brief.industries.length > 0) {
    const geos = brief.geographies && brief.geographies.length > 0
      ? brief.geographies
      : (brief.geography ? [brief.geography] : ['United Kingdom']);
    const queries: SearchPlan[] = [];
    for (const sector of brief.industries) {
      for (const geo of geos) {
        queries.push({
          description: sector,
          locationName: normaliseLocation(geo),
          limit: limit ?? 100,
        });
        if (queries.length >= 8) break;
      }
      if (queries.length >= 8) break;
    }
    if (queries.length > 0) return queries;
  }
  // Fallback: single AI-generated plan.
  const single = await deriveSinglePlanFromPlay(play, limit ?? 50);
  return [single];
}

/**
 * Map free-form geography strings to a DataForSEO-friendly location
 * name. DataForSEO accepts country names ("United Kingdom"), region/
 * city pairs ("Southampton, England, United Kingdom"), and similar.
 * Anything we can't confidently re-format gets the country prefix
 * appended.
 */
function normaliseLocation(geo: string): string {
  const trimmed = geo.trim();
  if (!trimmed) return 'United Kingdom';
  // If they typed something with the country already, leave it alone.
  if (/united\s*kingdom|england|scotland|wales|usa|united\s*states|canada|australia|france|germany|italy|spain/i.test(trimmed)) {
    return trimmed;
  }
  // Strip parenthetical detail like 'South Coast (Solent, ...)' so
  // DataForSEO doesn't choke. Take what's outside the parens, append
  // 'United Kingdom' as the country anchor.
  const noParens = trimmed.replace(/\([^)]*\)/g, '').trim();
  return noParens + ', United Kingdom';
}

async function deriveSinglePlanFromPlay(play: Play, limit: number): Promise<SearchPlan> {
  const prompt = [
    'You are translating a freshly-named Evari outreach Play into a DataForSEO Business Listings search.',
    'The Play has JUST been created, so it may only have a title and a short brief.',
    '',
    'Play title: ' + play.title,
    'Brief: ' + (play.brief ?? ''),
    'Category: ' + (play.category ?? play.title),
    '',
    'Your grounding already tells you what Evari sells, who buys it, and the hard outreach rules. Use that grounding to pick the right keyword + location.',
    '',
    'Emit a single JSON object, nothing else:',
    '{',
    '  "description": string,    // short Google-style keyword for Business Listings',
    '  "locationName": string,   // DataForSEO location (e.g. "United Kingdom", "London, England, United Kingdom")',
    '  "limit": number           // 1..50',
    '}',
    '',
    'Rules:',
    '- The description should be concrete (what kind of business are we targeting) and as specific as the Play title allows.',
    '- Default location is "United Kingdom" unless the title implies a specific city/region.',
    '- Prefer 100 as the default limit, capped at 200.',
    '- Never target generic bike shops. Prefer HNW / luxury-adjacent categories consistent with the brand grounding.',
    '- Return raw JSON only — no prose, no markdown fences.',
  ].join('\n');

  const raw = await generateBriefing({
    task: 'auto-scan-plan',
    voice: 'analyst',
    prompt,
  });
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
  const locationName =
    typeof parsed.locationName === 'string' && parsed.locationName.trim().length > 0
      ? parsed.locationName.trim()
      : 'United Kingdom';
  const lim =
    typeof parsed.limit === 'number' && parsed.limit > 0 && parsed.limit <= 50
      ? Math.floor(parsed.limit)
      : limit;
  if (!description) throw new Error('empty description');
  return { description, locationName, limit: lim };
}

function listingToLead(
  l: BusinessListing,
  play: Play,
  category: string,
  nowIso: string,
): Lead {
  const slug = slugify(l.title) || Math.random().toString(36).slice(2, 10);
  const id = 'prospect-' + (play.id + '-' + slug).slice(0, 80);
  const domain = l.domain || deriveDomain(l.url);
  const inferredEmail = domain ? 'info@' + domain : '';
  return {
    id,
    fullName: l.title,
    companyName: l.title,
    companyUrl: l.url,
    address: l.address,
    phone: l.phone,
    email: inferredEmail,
    emailInferred: Boolean(inferredEmail),
    source: 'outreach_agent',
    sourceCategory: 'outreach',
    sourceDetail:
      'Auto-scan (DataForSEO): ' +
      (l.category ?? 'business listings') +
      (l.address ? ' — ' + l.address : ''),
    stage: 'new',
    intent: 'unknown',
    firstSeenAt: nowIso,
    lastTouchAt: nowIso,
    tags: [],
    activity: [],
    tier: 'prospect',
    category,
    playId: play.id,
    prospectStatus: 'pending',
  };
}

/**
 * Build SERP query phrasings from the matrix of (sector x geography)
 * SearchPlans. Listings searches use the bare sector name; SERP
 * searches need richer phrasings to surface directory pages and
 * company sites. We use 4-6 templates per sector so each combo fans
 * out into multiple Google queries.
 */
function buildSerpQueriesFromPlans(plans: SearchPlan[]): string[] {
  const out = new Set<string>();
  for (const p of plans) {
    const sector = p.description.trim();
    const geoBase = p.locationName.replace(/,\s*United Kingdom$/i, '').trim() || 'UK';
    out.add(`${sector} ${geoBase}`);
    out.add(`best ${sector} ${geoBase}`);
    out.add(`top ${sector} ${geoBase}`);
    out.add(`${sector} companies ${geoBase}`);
    out.add(`list of ${sector} in ${geoBase}`);
    out.add(`luxury ${sector} ${geoBase}`);
  }
  // Cap at 30 to keep cost predictable. SERP costs ~$0.001 per query.
  return Array.from(out).slice(0, 30);
}

const AGGREGATOR_DOMAINS = new Set([
  'wikipedia.org', 'linkedin.com', 'facebook.com', 'twitter.com',
  'x.com', 'youtube.com', 'instagram.com', 'tiktok.com', 'pinterest.com',
  'glassdoor.com', 'glassdoor.co.uk', 'indeed.com', 'indeed.co.uk',
  'trustpilot.com', 'yelp.com', 'yelp.co.uk', 'tripadvisor.com',
  'google.com', 'maps.google.com', 'bing.com', 'duckduckgo.com',
  'amazon.com', 'amazon.co.uk', 'ebay.com', 'ebay.co.uk',
  'crunchbase.com', 'pitchbook.com', 'dnb.com', 'bloomberg.com',
  'reuters.com', 'forbes.com', 'theguardian.com', 'bbc.co.uk',
  'bbc.com', 'thetimes.co.uk', 'telegraph.co.uk', 'ft.com',
  'companieshouse.gov.uk', 'gov.uk', 'medium.com', 'substack.com',
  'reddit.com', 'quora.com', 'stackoverflow.com', 'github.com',
]);

function isAggregatorDomain(domain: string): boolean {
  if (AGGREGATOR_DOMAINS.has(domain)) return true;
  // Match second-level matches: news.bbc.com -> bbc.com, blog.medium.com.
  const parts = domain.split('.');
  if (parts.length >= 2) {
    const last2 = parts.slice(-2).join('.');
    if (AGGREGATOR_DOMAINS.has(last2)) return true;
  }
  return false;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function upsertShortlistFromListing(
  supabase: ReturnType<typeof createSupabaseAdmin> extends infer T ? T : never,
  l: BusinessListing,
  playId: string,
): Promise<void> {
  if (!supabase) return;
  const domain = l.domain || deriveDomain(l.url) || (l.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.unknown');
  // Upsert by (play_id, domain) so re-running the auto-scan doesn't
  // duplicate companies that DataForSEO surfaces again.
  await supabase
    .from('dashboard_play_shortlist')
    .upsert(
      {
        play_id: playId,
        domain,
        name: l.title,
        industry: l.category ?? null,
        location: l.address ?? null,
        description: l.category
          ? 'Auto-scan (DataForSEO): ' + l.category + (l.address ? ', ' + l.address : '')
          : (l.address ?? null),
        // Default fit_score of 60 (good band) until the scoring rubric
        // kicks in or the operator overrides it.
        fit_score: 60,
        fit_band: 'good',
        status: 'candidate',
      },
      { onConflict: 'play_id,domain', ignoreDuplicates: false },
    );
}

function deriveDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url.startsWith('http') ? url : 'https://' + url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/**
 * Merge a new autoScan status into the Play row. Never touches
 * `activity` / `scope` — call `finish()` for terminal transitions that need
 * to stamp those too.
 */
async function setStatus(
  supabase: SupabaseClient,
  play: Play,
  autoScan: PlayAutoScanStatus,
): Promise<void> {
  const next: Play = {
    ...play,
    autoScan: { ...(play.autoScan ?? { status: 'pending' }), ...autoScan },
    updatedAt: new Date().toISOString(),
  };
  await supabase.from('dashboard_plays').update({ payload: next }).eq('id', play.id);
}

/**
 * Terminal status write + activity stamp. Optionally also writes
 * `scope.lastSourceRun` so the UI's "Last run" card reflects the auto-scan.
 */
async function finish(
  supabase: SupabaseClient,
  play: Play,
  autoScan: PlayAutoScanStatus,
  summary: string,
  lastSourceRun?: PlaySourceRun,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const nextScope =
    lastSourceRun && play.scope
      ? {
          ...play.scope,
          sourcedAt: lastSourceRun.at,
          sourcedCount:
            (play.scope.sourcedCount ?? 0) + lastSourceRun.inserted,
          lastSourceRun,
          updatedAt: nowIso,
        }
      : play.scope;
  const next: Play = {
    ...play,
    autoScan: { ...(play.autoScan ?? { status: 'pending' }), ...autoScan },
    scope: nextScope,
    updatedAt: nowIso,
    activity: [
      ...play.activity,
      {
        id: 'act-' + Date.now(),
        at: nowIso,
        type: 'note',
        summary,
      },
    ],
  };
  await supabase.from('dashboard_plays').update({ payload: next }).eq('id', play.id);
}
