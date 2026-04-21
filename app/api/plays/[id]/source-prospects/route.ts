import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay, upsertLead } from '@/lib/dashboard/repository';
import {
  isDataForSeoConnected,
  searchBusinessListings,
  type BusinessListing,
} from '@/lib/integrations/dataforseo';
import {
  isGooglePlacesConnected,
  searchPlaces,
} from '@/lib/integrations/googleplaces';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import type { Lead, Play, PlaySourceRun } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/plays/[id]/source-prospects
 *
 * Streams Server-Sent Events (SSE) so the UI can show step-by-step progress
 * while the sourcing agent runs. Each event is a JSON object on a single
 * `data:` line.
 *
 * Phases emitted (in order):
 *   planning           — asking Claude to derive a DataForSEO search plan
 *   plan-ready         — plan decided (includes { queries: [{description, locationName, limit?}] })
 *   searching          — DataForSEO call in flight (includes { query, index, total })
 *   search-done        — one DataForSEO result chunk returned (includes { query, found, foundTotal, costUsd, costTotal })
 *   all-searches-done  — every fan-out query finished (includes { foundTotal, uniqueTotal, costTotal })
 *   inserting          — writing Lead rows to Supabase (includes { total })
 *   inserted-progress  — progress tick per row (includes { done, total, lead })
 *   done               — final success (includes { play, inserted, found, costUsd })
 *   error              — terminal failure (includes { message })
 *
 * Body: `{ candidates?: Lead[], search?: { description, locationName, limit } }`
 *  - If `candidates` is provided the route skips planning + DataForSEO and just
 *    inserts the pasted rows.
 *  - If `search` is provided it overrides the AI planner (single query).
 */

interface SearchQuery {
  description: string;
  locationName: string;
  limit?: number;
  /**
   * Optional Google Places type for strict filtering (e.g. "sports_club",
   * "gym", "bicycle_store", "doctor"). When present AND the active provider
   * is Google Places, the search rejects anything that isn't of this type.
   * DFS ignores this field.
   */
  includedType?: string;
}

interface SearchPlan {
  queries: SearchQuery[];
}

interface CandidateBody {
  candidates?: Array<Partial<Lead>>;
  search?: Partial<SearchQuery>;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(event: Record<string, unknown>): void {
        controller.enqueue(
          encoder.encode('data: ' + JSON.stringify(event) + '\n\n'),
        );
      }
      function fail(message: string, status: number = 500): void {
        emit({ phase: 'error', message, status });
        controller.close();
      }

      const supabase = createSupabaseAdmin();
      if (!supabase) {
        fail('Supabase admin client unavailable');
        return;
      }
      const play = await getPlay(supabase, id);
      if (!play) {
        fail('Play not found', 404);
        return;
      }
      if (!play.scope) {
        fail(
          'Convert the strategy to a scope before sourcing prospects',
          400,
        );
        return;
      }

      let body: CandidateBody = {};
      try {
        body = (await req.json()) as CandidateBody;
      } catch {
        // empty body is fine — auto-source path
      }

      const cap = 500;
      const nowIso = new Date().toISOString();
      const category = play.category ?? play.title;

      // ---------------- Paste-list path ----------------------------------
      if (
        body.candidates &&
        Array.isArray(body.candidates) &&
        body.candidates.length > 0
      ) {
        const candidates = body.candidates.slice(0, cap);
        emit({
          phase: 'inserting',
          message: 'Inserting ' + candidates.length + ' pasted candidate(s)…',
          total: candidates.length,
        });
        const inserted = await insertCandidates(
          supabase,
          candidates,
          play,
          category,
          nowIso,
          (done, total, lead) =>
            emit({ phase: 'inserted-progress', done, total, lead }),
        );
        const run: PlaySourceRun = {
          at: nowIso,
          agent: 'paste',
          inserted,
          durationMs: Date.now() - startedAt,
        };
        const saved = await stampRun(supabase, play, run);
        emit({ phase: 'done', play: saved, inserted, agent: 'paste' });
        controller.close();
        return;
      }

      // ---------------- Auto-source path ---------------------------------
      // Accept either provider. Google Places is preferred when configured;
      // DFS is the fallback. If neither is set, bail out with the reason.
      const gpConnected = isGooglePlacesConnected();
      const dfsConnected = isDataForSeoConnected();
      if (!gpConnected && !dfsConnected) {
        const run: PlaySourceRun = {
          at: nowIso,
          agent: 'dataforseo',
          inserted: 0,
          error: 'No search provider configured',
          durationMs: Date.now() - startedAt,
        };
        await stampRun(supabase, play, run);
        fail(
          'No search provider configured. Set GOOGLE_PLACES_API_KEY (preferred) or DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD, or paste a candidate list.',
        );
        return;
      }

      let plan: SearchPlan;
      if (body.search?.description && body.search?.locationName) {
        plan = {
          queries: [
            {
              description: body.search.description,
              locationName: body.search.locationName,
              limit: body.search.limit ?? 20,
              includedType: body.search.includedType,
            },
          ],
        };
        emit({
          phase: 'plan-ready',
          message: 'Using operator-supplied search plan',
          queries: plan.queries,
        });
      } else {
        if (!hasAIGatewayCredentials()) {
          const run: PlaySourceRun = {
            at: nowIso,
            agent: 'dataforseo',
            inserted: 0,
            error: 'AI gateway not configured',
            durationMs: Date.now() - startedAt,
          };
          await stampRun(supabase, play, run);
          fail(
            'AI gateway not configured. Send { search: { description, locationName } } to bypass AI planning.',
          );
          return;
        }
        emit({
          phase: 'planning',
          message: 'Asking Claude to derive a fan-out search plan from your scope…',
        });
        try {
          plan = await derivePlan(play);
        } catch (err) {
          const msg = (err as Error).message;
          const run: PlaySourceRun = {
            at: nowIso,
            agent: 'dataforseo',
            inserted: 0,
            error: 'Search planner failed: ' + msg,
            durationMs: Date.now() - startedAt,
          };
          await stampRun(supabase, play, run);
          fail('Search planner failed: ' + msg);
          return;
        }
        emit({
          phase: 'plan-ready',
          message:
            'Plan: ' +
            plan.queries.length +
            ' fan-out queries — ' +
            plan.queries.map((q) => '"' + q.description + '" (' + q.locationName + ')').join(', '),
          queries: plan.queries,
        });
      }

      // Fan out across every planned query, dedupe listings globally.
      const seen = new Map<string, BusinessListing>();
      let costTotal = 0;
      let foundTotal = 0;
      const primaryQuery = plan.queries[0];

      for (let i = 0; i < plan.queries.length; i += 1) {
        const q = plan.queries[i];
        emit({
          phase: 'searching',
          message:
            'Searching "' + q.description + '" in ' + q.locationName + '…',
          query: q,
          index: i + 1,
          total: plan.queries.length,
        });
        try {
          const res = await runProviderQuery(q, cap, {
            gpConnected,
            dfsConnected,
          });
          costTotal += res.cost;
          foundTotal += res.listings.length;
          const country = extractCountryToken(q.locationName);
          let rejected = 0;
          for (const l of res.listings) {
            if (country && !listingMatchesCountry(l, country)) {
              rejected += 1;
              continue;
            }
            const key = dedupeKey(l);
            if (!seen.has(key)) seen.set(key, l);
          }
          emit({
            phase: 'search-done',
            message:
              '"' +
              q.description +
              '" via ' +
              res.source +
              ' returned ' +
              res.listings.length +
              ' listing(s)' +
              (rejected > 0
                ? ' · ' + rejected + ' dropped as out-of-country'
                : '') +
              '.',
            query: q,
            found: res.listings.length,
            rejected,
            country,
            source: res.source,
            foundTotal,
            uniqueTotal: seen.size,
            costUsd: res.cost,
            costTotal,
            index: i + 1,
            total: plan.queries.length,
          });
        } catch (err) {
          const msg = (err as Error).message;
          emit({
            phase: 'search-done',
            message: '"' + q.description + '" failed: ' + msg,
            query: q,
            found: 0,
            foundTotal,
            uniqueTotal: seen.size,
            error: msg,
            index: i + 1,
            total: plan.queries.length,
          });
        }
      }

      const unique = Array.from(seen.values());
      emit({
        phase: 'all-searches-done',
        message:
          'All queries complete — ' +
          unique.length +
          ' unique prospect(s) across ' +
          plan.queries.length +
          ' search(es). Cost $' +
          costTotal.toFixed(3) +
          '.',
        foundTotal,
        uniqueTotal: unique.length,
        costTotal,
      });

      if (unique.length === 0) {
        const agentLabel: PlaySourceRun['agent'] = gpConnected
          ? 'google_places'
          : 'dataforseo';
        const run: PlaySourceRun = {
          at: nowIso,
          agent: agentLabel,
          description: primaryQuery?.description,
          locationName: primaryQuery?.locationName,
          found: 0,
          inserted: 0,
          costUsd: costTotal,
          durationMs: Date.now() - startedAt,
        };
        const saved = await stampRun(supabase, play, run);
        emit({
          phase: 'done',
          message: 'No listings returned across ' + plan.queries.length + ' query variants.',
          play: saved,
          inserted: 0,
          found: 0,
          agent: agentLabel,
          queries: plan.queries,
          costUsd: costTotal,
        });
        controller.close();
        return;
      }

      const candidates: Array<Partial<Lead>> = unique.map((l) =>
        listingToLead(l, play, category),
      );
      emit({
        phase: 'inserting',
        message:
          'Writing ' + candidates.length + ' unique prospect row(s) to the funnel…',
        total: candidates.length,
      });
      const inserted = await insertCandidates(
        supabase,
        candidates,
        play,
        category,
        nowIso,
        (done, total, lead) =>
          emit({ phase: 'inserted-progress', done, total, lead }),
      );

      const finalAgentLabel: PlaySourceRun['agent'] = gpConnected
        ? 'google_places'
        : 'dataforseo';
      const run: PlaySourceRun = {
        at: nowIso,
        agent: finalAgentLabel,
        description: primaryQuery?.description,
        locationName: primaryQuery?.locationName,
        found: unique.length,
        inserted,
        costUsd: costTotal,
        durationMs: Date.now() - startedAt,
      };
      const saved = await stampRun(supabase, play, run);
      emit({
        phase: 'done',
        play: saved,
        inserted,
        found: unique.length,
        agent: finalAgentLabel,
        queries: plan.queries,
        costUsd: costTotal,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ask Claude for a fan-out of 3–6 SHORT Google-style keywords, each pointing
 * at a specific business vertical / role that would buy Evari bikes. Short
 * keywords are the only thing DataForSEO's business listings endpoint
 * actually returns useful results for — long descriptive phrases return zero.
 */
async function derivePlan(play: Play): Promise<SearchPlan> {
  const prompt = [
    'You are translating an Evari outreach Play into a fan-out of Google Places (New) Text Search queries.',
    '',
    'Google Places Text Search accepts natural Google-Maps-style queries like "cycling club in Surrey" or "private knee clinic in London". It returns structured places with an official `types` taxonomy (sports_club, gym, doctor, bicycle_store, etc.) — so keywords should describe the VENUE or ORGANISATION, not the people inside it.',
    '',
    'Play title: ' + play.title,
    'Category: ' + (play.category ?? play.title),
    'Strategy: ' + JSON.stringify(play.strategy ?? {}, null, 2),
    'Scope: ' + JSON.stringify(play.scope ?? {}, null, 2),
    '',
    'Emit a single JSON object with exactly this shape:',
    '{',
    '  "queries": [',
    '    { "description": string, "locationName": string, "limit": number, "includedType"?: string },',
    '    ...',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Return between 3 and 6 queries.',
    '- Each "description" must be 2-5 words — a natural Google-style BUSINESS/VENUE keyword. Examples that work: "cycling club", "road cycling club", "triathlon club", "yacht broker", "private knee clinic", "boutique design studio". BAD: "cycling club secretary" (person role — returns nothing), "where to buy luxury bikes" (too conversational).',
    '- CRITICAL: keywords describe business NAMES or venue types, NOT people. Forbidden tokens: "secretary", "organiser", "organizer", "director", "manager", "owner", "founder", "head of", "committee", "CEO", "CTO".',
    '- Vary the angles: different sub-types, different cities if the Play is geographic. The planner fans out — each query should hit a different slice of the market.',
    '- locationName must be a comma-separated human-readable location with the country as the tail. For a UK Play: "London, England, United Kingdom", "Surrey, England, United Kingdom", "Kent, England, United Kingdom", "South East England, United Kingdom". For a US Play: "San Francisco, CA, United States".',
    '- EVERY query must stay in the Play\'s target country. Inspect play.scope.summary for geographic intent. If the scope mentions "South East England", never emit a US or Canadian locationName.',
    '- includedType (optional) hard-filters to one Google Places type. Use it when you have high confidence. Common types: "sports_club" (cycling/triathlon/golf/yacht clubs), "gym" (fitness studios), "bicycle_store" (bike shops), "doctor" (medical practices — use "dental_clinic" for dentists, "hospital" for hospitals), "stadium", "sports_complex". Full list: https://developers.google.com/maps/documentation/places/web-service/place-types',
    '- limit should be 15-20 per query (Google Places caps at 20 results per page).',
    '- Never target generic bike shops. Prefer HNW / luxury-adjacent verticals consistent with the grounded brand brief.',
    '- Return raw JSON only — no prose, no markdown fences.',
  ].join('\n');

  const markdown = await generateBriefing({
    task: 'source-prospects-plan',
    voice: 'analyst',
    prompt,
  });
  const cleaned = markdown
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const rawQueries = Array.isArray(parsed.queries) ? parsed.queries : [];
  const queries: SearchQuery[] = [];
  for (const q of rawQueries) {
    if (!q || typeof q !== 'object') continue;
    const rec = q as Record<string, unknown>;
    const description =
      typeof rec.description === 'string' ? rec.description.trim() : '';
    const locationName =
      typeof rec.locationName === 'string' && rec.locationName.trim().length > 0
        ? rec.locationName.trim()
        : 'United Kingdom';
    const limit =
      typeof rec.limit === 'number' && rec.limit > 0 && rec.limit <= 200
        ? Math.floor(rec.limit)
        : 50;
    if (!description) continue;
    // Hard guard — refuse anything longer than 6 words; short keywords only.
    if (description.split(/\s+/).length > 6) continue;
    const includedType =
      typeof rec.includedType === 'string' && rec.includedType.trim().length > 0
        ? rec.includedType.trim()
        : undefined;
    queries.push({ description, locationName, limit, includedType });
  }
  if (queries.length === 0) {
    throw new Error(
      'AI planner returned no usable short-keyword queries (needs 2-4 word Google-style keywords)',
    );
  }
  return { queries };
}

/**
 * Best-effort country detector: reads a DataForSEO location_name like
 * "Surrey, England, United Kingdom" and returns a lowercase country token
 * ("united kingdom", "united states", "canada", etc.). Returns undefined
 * for ambiguous / country-less strings so the caller can skip filtering.
 */
function extractCountryToken(locationName: string): string | undefined {
  const raw = locationName.trim();
  if (!raw) return undefined;
  // Last comma segment is typically the country in DFS location strings.
  const tail = raw.split(',').pop()?.trim().toLowerCase();
  if (!tail) return undefined;
  if (tail.length < 2) return undefined;
  // Guard: if the string is bare city ("London") return undefined — we can't
  // be sure which London, so no filtering.
  if (!raw.includes(',')) {
    const lower = raw.toLowerCase();
    if (['united kingdom', 'uk', 'united states', 'usa', 'canada', 'australia', 'germany', 'france', 'spain', 'italy', 'ireland'].includes(lower)) {
      return lower === 'uk' ? 'united kingdom' : lower === 'usa' ? 'united states' : lower;
    }
    return undefined;
  }
  return tail;
}

/**
 * UK postcode — broad but strict enough: 1-2 letters, digit, optional alnum,
 * space, digit, 2 letters. Examples matched: SW1A 1AA, BN7 2TJ, KT1 4DB.
 */
const UK_POSTCODE = /\b[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}\b/i;

/**
 * Does this listing plausibly live in `country`? We accept a match from any
 * of: address text contains the country token; address matches the country's
 * postcode pattern; domain TLD is the country's ccTLD.
 *
 * Over-conservative when the address is missing — we default to KEEP rather
 * than reject so data-poor rows aren't silently dropped.
 */
function listingMatchesCountry(
  l: BusinessListing,
  country: string,
): boolean {
  const addr = (l.address ?? '').toLowerCase();
  const domain = (l.domain ?? '').toLowerCase();

  if (country === 'united kingdom') {
    if (!addr && !domain) return true; // too little data — keep, let the operator decide
    if (addr.includes('united kingdom') || /, ?uk\b/.test(addr) || /\buk$/i.test(addr)) return true;
    if (/(england|scotland|wales|northern ireland)/.test(addr)) return true;
    if (UK_POSTCODE.test(l.address ?? '')) return true;
    if (domain.endsWith('.uk') || domain.endsWith('.co.uk')) return true;
    return false;
  }
  if (country === 'united states') {
    if (!addr && !domain) return true;
    if (addr.includes('united states') || /, ?usa?\b/.test(addr)) return true;
    // US state-code + zip — e.g. "CA 94103"
    if (/,\s?[a-z]{2}\s+\d{5}/i.test(l.address ?? '')) return true;
    if (domain.endsWith('.us')) return true;
    return false;
  }

  // Generic fallback: token must appear somewhere in address.
  if (!addr) return true;
  return addr.includes(country);
}

function dedupeKey(l: BusinessListing): string {
  if (l.placeId) return 'place:' + l.placeId;
  if (l.cid) return 'cid:' + l.cid;
  if (l.domain) return 'dom:' + l.domain.toLowerCase();
  return 'title:' + l.title.toLowerCase().trim();
}

function listingToLead(
  l: BusinessListing,
  play: Play,
  category: string,
): Partial<Lead> {
  const slug = slugify(l.title) || Math.random().toString(36).slice(2, 10);
  const id = 'prospect-' + (play.id + '-' + slug).slice(0, 80);
  const domain = l.domain || deriveDomain(l.url);
  const inferredEmail = inferEmail(domain);
  return {
    id,
    fullName: l.title,
    companyName: l.title,
    companyUrl: l.url,
    address: l.address,
    phone: l.phone,
    email: inferredEmail ?? '',
    emailInferred: Boolean(inferredEmail),
    sourceDetail:
      'DataForSEO: ' +
      (l.category ?? 'business listings') +
      (l.address ? ' — ' + l.address : ''),
    category,
    playId: play.id,
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
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

function inferEmail(domain: string | undefined): string | undefined {
  if (!domain) return undefined;
  return 'info@' + domain;
}

async function insertCandidates(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  candidates: Array<Partial<Lead>>,
  play: Play,
  category: string,
  nowIso: string,
  onProgress?: (
    done: number,
    total: number,
    lead: { id: string; fullName: string; companyName?: string },
  ) => void,
): Promise<number> {
  let inserted = 0;
  const total = candidates.length;
  let done = 0;
  for (const c of candidates) {
    done += 1;
    if (!c || typeof c !== 'object') continue;
    const lead: Lead = {
      id: c.id ?? 'prospect-' + Math.random().toString(36).slice(2, 12),
      fullName: (c.fullName ?? '').toString().trim() || 'Unknown contact',
      email: (c.email ?? '').toString().trim(),
      phone: c.phone,
      companyName: c.companyName,
      companyUrl: c.companyUrl,
      jobTitle: c.jobTitle,
      linkedinUrl: c.linkedinUrl,
      address: c.address,
      emailInferred: c.emailInferred === true,
      relatedContacts: c.relatedContacts,
      source: 'outreach_agent',
      sourceCategory: 'outreach',
      sourceDetail: c.sourceDetail ?? 'Play: ' + play.title,
      stage: 'new',
      intent: 'unknown',
      firstSeenAt: nowIso,
      lastTouchAt: nowIso,
      tags: [],
      activity: [],
      tier: 'prospect',
      category: c.category ?? category,
      playId: play.id,
      prospectStatus: 'pending',
    };
    const out = await upsertLead(supabase, lead);
    if (out) inserted += 1;
    // Tick every row so the counter in the UI modal visibly bumps up.
    onProgress?.(done, total, {
      id: lead.id,
      fullName: lead.fullName,
      companyName: lead.companyName,
    });
  }
  return inserted;
}

async function stampRun(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  play: Play,
  run: PlaySourceRun,
): Promise<Play> {
  const nowIso = run.at;
  const category = play.category ?? play.title;
  const nextScope = {
    ...(play.scope ?? { summary: '', bullets: [], updatedAt: nowIso }),
    sourcedAt: nowIso,
    sourcedCount: (play.scope?.sourcedCount ?? 0) + run.inserted,
    lastSourceRun: run,
    updatedAt: nowIso,
  };
  const summary = run.error
    ? 'Source Prospects (' + run.agent + ') failed: ' + run.error
    : run.inserted > 0
      ? 'Source Prospects (' +
        run.agent +
        '): ' +
        run.inserted +
        ' row(s) added to funnel "' +
        category +
        '"'
      : 'Source Prospects (' + run.agent + ') ran — no rows added';
  const next: Play = {
    ...play,
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
  await supabase.from('dashboard_plays').update({ payload: next }).eq('id', next.id);
  return next;
}

// ---------------------------------------------------------------------------
// Provider dispatch — Google Places is preferred, DFS is fallback
// ---------------------------------------------------------------------------

/**
 * Run a single planner query against whichever provider is configured.
 * Preference order:
 *   1. Google Places (New) Text Search — strict geofence via regionCode +
 *      optional includedType filter. Low noise, high precision.
 *   2. DataForSEO business_listings — legacy fallback. Wider coverage but
 *      looser matching; we still post-filter geographically in the caller.
 *
 * If both providers are configured and Google returns zero listings, we
 * fall through to DFS for that query only — the operator still gets SOMETHING
 * to review instead of an empty panel. Costs are summed across providers.
 */
async function runProviderQuery(
  q: SearchQuery,
  cap: number,
  opts: { gpConnected: boolean; dfsConnected: boolean },
): Promise<{ listings: BusinessListing[]; cost: number; source: 'google_places' | 'dataforseo' }> {
  const limit = Math.min(q.limit ?? 20, cap);
  if (opts.gpConnected) {
    try {
      const res = await searchPlaces({
        query: q.description,
        locationName: q.locationName,
        limit,
        includedType: q.includedType,
      });
      if (res.listings.length > 0 || !opts.dfsConnected) {
        return { ...res, source: 'google_places' };
      }
      // Google returned zero — fall through to DFS if available.
    } catch (err) {
      console.warn('[source-prospects] Google Places failed, falling back:', (err as Error).message);
      if (!opts.dfsConnected) throw err;
    }
  }
  if (opts.dfsConnected) {
    const res = await searchBusinessListings({
      description: q.description,
      locationName: q.locationName,
      limit: Math.min(limit, 50),
    });
    return { ...res, source: 'dataforseo' };
  }
  throw new Error('No search provider configured');
}

