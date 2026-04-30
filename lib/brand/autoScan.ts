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
    // Single source: Google Places via DataForSEO Business Listings.
    // SERP organic was tried but it returns anything Google has
    // indexed under the keywords (yacht clubs that mention supercars,
    // golf clubs with car events, etc.) which destroys precision.
    // Listings matches against actual business categories.
    const listingResults = await Promise.allSettled(
      plans.map((p) =>
        searchBusinessListings({
          description: p.description,
          locationName: p.locationName,
          limit: p.limit ?? 100,
        }),
      ),
    );
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
    if (listings.length === 0) {
      const firstErr = listingResults.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (firstErr) throw firstErr.reason;
    }

    // Relevance gate: ask Claude to filter the candidate list against
    // the brief BEFORE we insert anything. This catches the
    // 'supercar clubs' brief returning yacht clubs / golf clubs /
    // cannabis clubs that DataForSEO's category matching let through.
    if (listings.length > 0) {
      try {
        const filtered = await filterListingsByRelevance(play, listings);
        listings = filtered;
      } catch {
        // If the gate fails, fall back to the unfiltered list rather
        // than inserting nothing.
      }
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
  // Strategy: ask Claude to translate the brief into actual Google
  // Places business-category strings (the kind Google indexes
  // listings under: "Boat builder", "Yacht broker", "Marina",
  // "Naval architect", "Boat dealer", "Marine engineer", etc.) NOT
  // the marketing-tier descriptors the user picked on Market
  // analysis ("Luxury yacht manufacturing", "Superyacht design").
  // Google Places returns nothing useful for those.
  const brief = await getOrCreateBrief(play.id).catch(() => null);
  const geos = brief?.geographies && brief.geographies.length > 0
    ? brief.geographies
    : (brief?.geography ? [brief.geography] : ['United Kingdom']);
  const sectors = brief?.industries ?? [];

  try {
    const categories = await deriveBusinessCategoriesFromBrief(play, sectors);
    if (categories.length > 0) {
      const queries: SearchPlan[] = [];
      // Cross every category with every geography, cap at 12 to keep
      // cost sane (~$0.06 per scan at $0.005 per query).
      for (const cat of categories) {
        for (const geo of geos) {
          queries.push({
            description: cat,
            locationName: normaliseLocation(geo),
            limit: limit ?? 100,
          });
          if (queries.length >= 12) break;
        }
        if (queries.length >= 12) break;
      }
      if (queries.length > 0) return queries;
    }
  } catch {
    // Fall through to legacy single-plan path.
  }

  // Last-resort fallback: single AI-generated plan (the legacy path).
  const single = await deriveSinglePlanFromPlay(play, limit ?? 100);
  return [single];
}

/**
 * Ask Claude to translate the play title + brief + the user's chip
 * picks into a list of Google Places category strings — the ACTUAL
 * keywords Google indexes business listings under. The user's chips
 * are aspirational ("Luxury yacht manufacturing"); Google needs
 * categorical ("Boat builder", "Yacht broker", "Marina", etc.).
 *
 * Returns 6-12 distinct categories in priority order.
 */
async function deriveBusinessCategoriesFromBrief(
  play: Play,
  pickedSectors: string[],
): Promise<string[]> {
  const prompt = [
    'Translate this prospecting brief into Google Places business-category search keywords.',
    '',
    'Idea title: ' + play.title,
    'Brief: ' + (play.brief ?? ''),
    pickedSectors.length > 0 ? 'User-picked sectors: ' + pickedSectors.join(', ') : '',
    '',
    'You are picking the BUSINESS CATEGORY STRINGS Google Places actually indexes. The user-picked sectors are aspirational marketing tiers ("Luxury yacht manufacturing"); Google Places matches on categorical strings ("Boat builder", "Yacht broker", "Naval architect", "Marina", "Marine engineer", "Boat dealer", "Boatyard").',
    '',
    'For a yacht-manufacturer brief in the UK, valid categories include: "Boat builder", "Yacht broker", "Naval architect", "Yacht designer", "Marina", "Marine engineer", "Boat dealer", "Boatyard", "Marine fabricator", "Yacht charter".',
    '',
    'For a supercar-club brief, valid categories include: "Car club", "Driving experience", "Motorsport club", "Track day operator", "Sports car dealer", "Performance car specialist".',
    '',
    'Reply with VALID JSON, no commentary, no markdown fences:',
    '{ "categories": [array of 6 to 12 short phrases, each a real Google Places business category that matches the brief] }',
    '',
    'Strict rules: each entry is 1-3 words, no quotes, no qualifiers like "luxury" or "premium" (Google does not index those). Order the most specific category first.',
  ].filter(Boolean).join('\n');

  const text = await generateBriefing({
    task: 'auto-scan-categories',
    voice: 'analyst',
    prompt,
  });
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned) as { categories?: string[] };
  if (!Array.isArray(parsed.categories)) return [];
  return parsed.categories
    .map((c) => (typeof c === 'string' ? c.trim() : ''))
    .filter((c) => c.length > 0 && c.length < 60)
    .slice(0, 12);
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

/**
 * Ask Claude to filter the raw DataForSEO candidate list to the rows
 * that genuinely match the play's brief. DataForSEO's Business
 * Listings API matches by Google business category, which is loose:
 * "supercar clubs" surfaces yacht clubs and cannabis clubs because
 * Google tags them all as "club". Claude reads the title + category
 * + address + the brief, returns the IDs of legitimate matches.
 *
 * Falls back to the unfiltered list on any error so the operator
 * still gets candidates rather than nothing.
 */
async function filterListingsByRelevance(
  play: Play,
  listings: BusinessListing[],
): Promise<BusinessListing[]> {
  if (listings.length === 0) return listings;
  // Build a numbered list Claude can reference by index.
  const numbered = listings
    .map(
      (l, i) =>
        `${i}. ${l.title}` +
        (l.category ? ` (${l.category})` : '') +
        (l.address ? `, ${l.address}` : ''),
    )
    .join('\n');
  const prompt = [
    'Identify the OBVIOUS category misfits in this list of candidates for a prospecting brief. We are removing only the wildly-off matches, NOT borderline ones.',
    '',
    'Play title: ' + play.title,
    'Brief: ' + (play.brief ?? '(no brief)'),
    '',
    'Candidates (numbered):',
    numbered,
    '',
    'Reply with VALID JSON, no commentary, no markdown fences:',
    '{ "excludeIds": [array of numeric indices that are clearly off-target] }',
    '',
    'Rules:',
    '- Be PERMISSIVE. Default to KEEPING. Only exclude when the candidate is in a wildly different industry than the brief.',
    '- For a yacht-manufacturer brief: exclude yoga studios, cannabis clubs, golf clubs, restaurants, dental practices. KEEP boat builders, yacht brokers, marine engineers, naval architects, marinas, boat dealers, sailmakers, riggers, even if their address is unusual.',
    '- For a supercar-club brief: exclude yacht clubs, gardening clubs, knitting clubs, cannabis clubs. KEEP marque-specific car clubs, driving-experience operators, track-day organisers, sports-car dealers.',
    '- If you cannot tell from name + category, KEEP it.',
    '- Return excludeIds only. Empty array is fine if everything looks plausible.',
  ].join('\n');

  try {
    const text = await generateBriefing({
      task: 'auto-scan-relevance',
      voice: 'analyst',
      prompt,
    });
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned) as { excludeIds?: number[] };
    if (!Array.isArray(parsed.excludeIds)) return listings;
    const drop = new Set<number>(parsed.excludeIds.filter((n) => Number.isInteger(n)));
    // Sanity guard: if Claude wants to drop more than HALF the list, it
    // probably misread the brief. Keep everything in that case so we
    // never collapse to 5-of-25.
    if (drop.size > listings.length / 2) return listings;
    return listings.filter((_, i) => !drop.has(i));
  } catch {
    return listings;
  }
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
  // Logo via Clearbit's free CDN. No API key required for the logo
  // endpoint; it returns a transparent PNG. We just URL-build it; the
  // browser will fall back to an initials avatar if Clearbit doesn't
  // have a logo for this domain.
  const looksRealDomain = /\./.test(domain) && !domain.endsWith('.unknown');
  const logoUrl = looksRealDomain ? 'https://logo.clearbit.com/' + domain : null;
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
        logo_url: logoUrl,
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
