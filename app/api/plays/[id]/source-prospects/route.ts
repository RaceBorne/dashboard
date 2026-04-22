import { generateText, stepCountIs, tool } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay, upsertLead } from '@/lib/dashboard/repository';
import {
  isDataForSeoConnected,
  searchBusinessListings,
  webSearchQuery,
  type BusinessListing,
} from '@/lib/integrations/dataforseo';
import {
  isGooglePlacesConnected,
  searchPlaces,
} from '@/lib/integrations/googleplaces';
import { buildSystemPrompt, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import type { Lead, Play, PlaySourceRun } from '@/lib/types';

const RESEARCH_MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';
// Tool loop can do many sequential calls; let Vercel keep the request open.
export const maxDuration = 300;

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
 *   planning           — Claude is researching the play
 *   searching          — a research-agent tool call is in flight (includes { query, index })
 *   search-done        — a research-agent tool call returned (includes { query, found, source, ... })
 *   all-searches-done  — research finished, candidates parsed (includes { foundTotal, uniqueTotal, costTotal })
 *   inserting          — writing Lead rows to Supabase (includes { total })
 *   inserted-progress  — progress tick per row (includes { done, total, lead })
 *   done               — final success (includes { play, inserted, found, costUsd })
 *   error              — terminal failure (includes { message })
 *
 * Body: `{ candidates?: Lead[], search?: { description, locationName, limit } }`
 *  - If `candidates` is provided the route skips research and inserts the
 *    pasted rows verbatim.
 *  - If `search` is provided it bypasses the research agent and runs a single
 *    Google Places / DataForSEO business-listings query (operator debug path).
 *  - Otherwise the research agent (Claude + web_search + find_business_listings
 *    tool-loop) compiles named candidates for the play's scope.
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
      const gpConnected = isGooglePlacesConnected();
      const dfsConnected = isDataForSeoConnected();

      // -------- Operator debug path: { search: { description, locationName } }
      // Bypasses the research agent and runs a single Google Places / DFS
      // business-listings query. Useful for spot-checking a specific keyword.
      if (body.search?.description && body.search?.locationName) {
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
            'No search provider configured. Set GOOGLE_PLACES_API_KEY or DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD.',
          );
          return;
        }
        const q: SearchQuery = {
          description: body.search.description,
          locationName: body.search.locationName,
          limit: body.search.limit ?? 20,
          includedType: body.search.includedType,
        };
        emit({
          phase: 'searching',
          message: 'Searching "' + q.description + '" in ' + q.locationName + '…',
          query: q,
          index: 1,
          total: 1,
        });
        let listings: BusinessListing[] = [];
        let cost = 0;
        let source: 'google_places' | 'dataforseo' = 'dataforseo';
        try {
          const res = await runProviderQuery(q, cap, { gpConnected, dfsConnected });
          listings = res.listings;
          cost = res.cost;
          source = res.source;
        } catch (err) {
          const msg = (err as Error).message;
          const agentLabel: PlaySourceRun['agent'] = gpConnected ? 'google_places' : 'dataforseo';
          const run: PlaySourceRun = {
            at: nowIso,
            agent: agentLabel,
            description: q.description,
            locationName: q.locationName,
            inserted: 0,
            error: msg,
            durationMs: Date.now() - startedAt,
          };
          await stampRun(supabase, play, run);
          fail('Search failed: ' + msg);
          return;
        }
        const country = extractCountryToken(q.locationName);
        const seen = new Map<string, BusinessListing>();
        for (const l of listings) {
          if (country && !listingMatchesCountry(l, country)) continue;
          const key = dedupeKey(l);
          if (!seen.has(key)) seen.set(key, l);
        }
        const unique = Array.from(seen.values());
        emit({
          phase: 'search-done',
          message:
            '"' + q.description + '" via ' + source + ' returned ' + listings.length + ' listing(s).',
          query: q,
          found: listings.length,
          source,
          foundTotal: listings.length,
          uniqueTotal: unique.length,
          costUsd: cost,
          costTotal: cost,
          index: 1,
          total: 1,
        });
        emit({
          phase: 'all-searches-done',
          message:
            unique.length + ' unique prospect(s) from a single query. Cost $' + cost.toFixed(3) + '.',
          foundTotal: listings.length,
          uniqueTotal: unique.length,
          costTotal: cost,
        });
        const agentLabel: PlaySourceRun['agent'] = gpConnected ? 'google_places' : 'dataforseo';
        if (unique.length === 0) {
          const run: PlaySourceRun = {
            at: nowIso,
            agent: agentLabel,
            description: q.description,
            locationName: q.locationName,
            found: 0,
            inserted: 0,
            costUsd: cost,
            durationMs: Date.now() - startedAt,
          };
          const saved = await stampRun(supabase, play, run);
          emit({
            phase: 'done',
            message: 'No listings returned for "' + q.description + '".',
            play: saved,
            inserted: 0,
            found: 0,
            agent: agentLabel,
            queries: [q],
            costUsd: cost,
          });
          controller.close();
          return;
        }
        const candidates: Array<Partial<Lead>> = unique.map((l) =>
          listingToLead(l, play, category, source),
        );
        emit({
          phase: 'inserting',
          message: 'Writing ' + candidates.length + ' prospect row(s)…',
          total: candidates.length,
        });
        const inserted = await insertCandidates(
          supabase,
          candidates,
          play,
          category,
          nowIso,
          (done, total, lead) => emit({ phase: 'inserted-progress', done, total, lead }),
        );
        const run: PlaySourceRun = {
          at: nowIso,
          agent: agentLabel,
          description: q.description,
          locationName: q.locationName,
          found: unique.length,
          inserted,
          costUsd: cost,
          durationMs: Date.now() - startedAt,
        };
        const saved = await stampRun(supabase, play, run);
        emit({
          phase: 'done',
          play: saved,
          inserted,
          found: unique.length,
          agent: agentLabel,
          queries: [q],
          costUsd: cost,
        });
        controller.close();
        return;
      }

      // -------- Default: research agent --------------------------------------
      // Claude + web_search + find_business_listings tool-loop. Works for both
      // venue-based verticals (clinics, dealers) AND organisation-based ones
      // (owner clubs, member networks, professional bodies, HNW directories).
      if (!hasAIGatewayCredentials()) {
        const run: PlaySourceRun = {
          at: nowIso,
          agent: 'research',
          inserted: 0,
          error: 'AI gateway not configured',
          durationMs: Date.now() - startedAt,
        };
        await stampRun(supabase, play, run);
        fail(
          'AI gateway not configured. Send { search: { description, locationName } } to bypass the research agent.',
        );
        return;
      }
      if (!dfsConnected) {
        const run: PlaySourceRun = {
          at: nowIso,
          agent: 'research',
          inserted: 0,
          error: 'DataForSEO not configured (research agent needs web_search + business listings)',
          durationMs: Date.now() - startedAt,
        };
        await stampRun(supabase, play, run);
        fail(
          'DataForSEO not configured — research agent needs web_search and find_business_listings.',
        );
        return;
      }
      emit({
        phase: 'planning',
        message:
          'Claude is researching named prospects for "' + (play.category ?? play.title) + '"…',
      });
      let researchListings: BusinessListing[] = [];
      let researchCost = 0;
      let researchToolCalls = 0;
      try {
        const res = await researchCandidates(play, emit);
        researchListings = res.listings;
        researchCost = res.cost;
        researchToolCalls = res.toolCalls;
      } catch (err) {
        const msg = (err as Error).message;
        const run: PlaySourceRun = {
          at: nowIso,
          agent: 'research',
          inserted: 0,
          error: 'Research agent failed: ' + msg,
          durationMs: Date.now() - startedAt,
        };
        await stampRun(supabase, play, run);
        fail('Research agent failed: ' + msg);
        return;
      }
      emit({
        phase: 'all-searches-done',
        message:
          'Research complete — ' +
          researchListings.length +
          ' unique candidate(s) from ' +
          researchToolCalls +
          ' tool call(s). Cost $' +
          researchCost.toFixed(3) +
          '.',
        foundTotal: researchListings.length,
        uniqueTotal: researchListings.length,
        costTotal: researchCost,
      });
      if (researchListings.length === 0) {
        const run: PlaySourceRun = {
          at: nowIso,
          agent: 'research',
          found: 0,
          inserted: 0,
          costUsd: researchCost,
          durationMs: Date.now() - startedAt,
        };
        const saved = await stampRun(supabase, play, run);
        emit({
          phase: 'done',
          message: 'Research agent returned no usable candidates.',
          play: saved,
          inserted: 0,
          found: 0,
          agent: 'research',
          costUsd: researchCost,
        });
        controller.close();
        return;
      }
      const researchCandidatesList: Array<Partial<Lead>> = researchListings.map((l) =>
        listingToLead(l, play, category, 'research'),
      );
      emit({
        phase: 'inserting',
        message:
          'Writing ' + researchCandidatesList.length + ' researched prospect(s) to the funnel…',
        total: researchCandidatesList.length,
      });
      const researchInserted = await insertCandidates(
        supabase,
        researchCandidatesList,
        play,
        category,
        nowIso,
        (done, total, lead) => emit({ phase: 'inserted-progress', done, total, lead }),
      );
      const researchRun: PlaySourceRun = {
        at: nowIso,
        agent: 'research',
        found: researchListings.length,
        inserted: researchInserted,
        costUsd: researchCost,
        durationMs: Date.now() - startedAt,
      };
      const researchSaved = await stampRun(supabase, play, researchRun);
      emit({
        phase: 'done',
        play: researchSaved,
        inserted: researchInserted,
        found: researchListings.length,
        agent: 'research',
        costUsd: researchCost,
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
 * The research agent. Lets Claude use web_search + find_business_listings
 * iteratively to compile a long, named list of real prospects for the play.
 *
 * Why this is better than the old keyword-fan-out planner:
 * - Old planner only emitted 3-6 short Google-Places-friendly keywords, then
 *   ran them through venue-only data sources (Google Places, DFS business
 *   listings). That misses entire categories — owner clubs, member orgs,
 *   professional networks, HNW directories — because those don't exist as
 *   "venues" in either provider.
 * - The research agent, in contrast, can web_search for any of those long-
 *   tail organisation lists ("UK Porsche owners club", "British supercar
 *   owners associations", etc.) AND fall back to find_business_listings for
 *   anything venue-shaped, picking the right tool per angle.
 *
 * The model emits a final JSON payload it has curated from tool results;
 * we dedupe by domain or name and map to BusinessListing so the existing
 * insertCandidates pipeline takes over unchanged.
 */
async function researchCandidates(
  play: Play,
  emit: (event: Record<string, unknown>) => void,
): Promise<{ listings: BusinessListing[]; cost: number; toolCalls: number }> {
  const system = await buildSystemPrompt({
    voice: 'analyst',
    task:
      'Research a comprehensive, named, high-recall list of real UK prospect organisations / businesses / clubs / practices for an outreach Play. Use web_search FIRST for anything community / member / owner-club / association / professional-body / directory shaped — Google Places does not index those well. Use find_business_listings for venue-based verticals (gyms, clinics, dealerships, studios). Then emit a single JSON object with the curated, deduped candidates.',
  });

  const prompt = [
    'PLAY',
    '----',
    'Title: ' + play.title,
    'Category: ' + (play.category ?? play.title),
    '',
    'Strategy:',
    JSON.stringify(play.strategy ?? {}, null, 2),
    '',
    'Scope:',
    JSON.stringify(play.scope ?? {}, null, 2),
    '',
    'YOUR JOB',
    '--------',
    'Compile a long, named list of real prospect organisations for this Play.',
    'Aim for 40-80 unique, named entries. Comprehensive recall matters more',
    'than perfect precision — if in doubt, include it; the operator will',
    'triage in the funnel.',
    '',
    'HOW TO RESEARCH',
    '---------------',
    '1. Plan the angles up front in your head. For an "owner clubs" Play,',
    '   that means every marque (Porsche, Ferrari, Lamborghini, Aston, Bentley,',
    "   McLaren, Maserati, Bugatti, Rolls-Royce, …), every region (national,",
    '   London/Home Counties, Cotswolds, Cheshire, Yorkshire, …), every',
    "   sub-type (concours, track-day, regional, marque-specific). For a",
    "   'private knee clinics' Play, that means national chains, regional",
    '   independents, every major hospital trust with a private wing, etc.',
    '2. For each angle pick the right tool:',
    '   - web_search FIRST for owner clubs, member orgs, associations,',
    '     professional bodies, directories, HNW networks.',
    '   - find_business_listings for venue-based verticals (gyms, clinics,',
    '     dealers, studios, surgeries).',
    '3. Iterate. Cover every obvious sub-angle. Do not stop after 3-5 calls',
    '   if the list is still short — keep researching until coverage feels',
    '   comprehensive (or you are about to hit your tool budget).',
    '4. When done, emit ONE final JSON object with your curated candidates.',
    '',
    'OUTPUT FORMAT',
    '-------------',
    'Return ONLY a JSON object, no prose, no markdown fences:',
    '{',
    '  "candidates": [',
    '    {',
    '      "name": string,',
    '      "website"?: string,',
    '      "phone"?: string,',
    '      "address"?: string,',
    '      "type"?: string,',
    '      "region"?: string,',
    '      "notes"?: string',
    '    },',
    '    ...',
    '  ]',
    '}',
    '',
    'RULES',
    '-----',
    '- Every candidate must be a real, named organisation or business — never',
    '  a role ("club secretary"), never a person, never a generic category.',
    '- Dedupe as you go (case-insensitive on name).',
    '- Stay inside the Play scope geography (read play.scope.summary).',
    '- Prefer the official root URL when known; omit website if you are not sure.',
  ].join('\n');

  const toolState = { calls: 0, cost: 0 };

  const tools = {
    web_search: tool({
      description:
        'Google-style organic search. Use for owner clubs, member associations, professional networks, directories, HNW communities, and any other organisation that does not live on Google Maps. Returns title + url + domain + snippet for each hit.',
      inputSchema: z.object({
        query: z.string().min(2).describe('Google search query'),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, limit }) => {
        toolState.calls += 1;
        const idx = toolState.calls;
        emit({
          phase: 'searching',
          message: 'web_search: "' + query + '"',
          query: { description: query, locationName: 'web', tool: 'web_search' },
          index: idx,
        });
        try {
          const { hits, cost } = await webSearchQuery({ query, limit: limit ?? 10 });
          toolState.cost += cost;
          emit({
            phase: 'search-done',
            message: 'web_search returned ' + hits.length + ' hit(s) for "' + query + '".',
            query: { description: query, locationName: 'web', tool: 'web_search' },
            found: hits.length,
            source: 'web_search',
            costUsd: cost,
            costTotal: toolState.cost,
            index: idx,
          });
          return {
            query,
            costUsd: cost,
            hits: hits.map((h) => ({
              rank: h.rank,
              title: h.title,
              url: h.url,
              domain: h.domain,
              snippet: h.snippet,
            })),
          };
        } catch (err) {
          const msg = (err as Error).message;
          emit({
            phase: 'search-done',
            message: 'web_search failed for "' + query + '": ' + msg,
            query: { description: query, tool: 'web_search' },
            found: 0,
            error: msg,
            costTotal: toolState.cost,
            index: idx,
          });
          return { error: msg };
        }
      },
    }),
    find_business_listings: tool({
      description:
        'Find real businesses matching a keyword in a location. Returns title, domain, phone, address, category. Use for venue-based verticals — clinics, gyms, dealerships, studios, surgeries.',
      inputSchema: z.object({
        description: z
          .string()
          .min(2)
          .describe('Short Google-style keyword, e.g. "private knee clinic"'),
        locationName: z
          .string()
          .optional()
          .describe('Location, e.g. "United Kingdom" or "London, England, United Kingdom"'),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ description, locationName, limit }) => {
        toolState.calls += 1;
        const idx = toolState.calls;
        const loc = locationName ?? 'United Kingdom';
        emit({
          phase: 'searching',
          message: 'find_business_listings: "' + description + '" in ' + loc,
          query: { description, locationName: loc, tool: 'find_business_listings' },
          index: idx,
        });
        try {
          const { listings, cost } = await searchBusinessListings({
            description,
            locationName: loc,
            limit: limit ?? 20,
          });
          toolState.cost += cost;
          emit({
            phase: 'search-done',
            message:
              'find_business_listings returned ' + listings.length + ' listing(s) for "' + description + '".',
            query: { description, locationName: loc, tool: 'find_business_listings' },
            found: listings.length,
            source: 'find_business_listings',
            costUsd: cost,
            costTotal: toolState.cost,
            index: idx,
          });
          return {
            query: { description, locationName: loc },
            costUsd: cost,
            listings: listings.map((l) => ({
              title: l.title,
              url: l.url,
              domain: l.domain,
              phone: l.phone,
              address: l.address,
              category: l.category,
            })),
          };
        } catch (err) {
          const msg = (err as Error).message;
          emit({
            phase: 'search-done',
            message: 'find_business_listings failed for "' + description + '": ' + msg,
            query: { description, tool: 'find_business_listings' },
            found: 0,
            error: msg,
            costTotal: toolState.cost,
            index: idx,
          });
          return { error: msg };
        }
      },
    }),
  };

  let finalText = '';
  try {
    const { text } = await generateText({
      model: gateway(RESEARCH_MODEL),
      system,
      prompt,
      tools,
      stopWhen: stepCountIs(12),
    });
    finalText = text;
  } catch (err) {
    if (!process.env.ANTHROPIC_API_KEY || !isResearchRetryable(err)) throw err;
    const bareModel = RESEARCH_MODEL.replace(/^anthropic\//, '');
    const { text } = await generateText({
      model: anthropic(bareModel),
      system,
      prompt,
      tools,
      stopWhen: stepCountIs(12),
    });
    finalText = text;
  }

  // Extract the first {...} block — model sometimes wraps prose around it.
  let parsed: Record<string, unknown> | undefined;
  const match = finalText.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      parsed = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      // fall through
    }
  }
  if (!parsed) {
    throw new Error('Research agent did not return parseable JSON candidates');
  }

  const raw = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const seen = new Map<string, BusinessListing>();
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const rec = c as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!name) continue;
    const website = typeof rec.website === 'string' && rec.website.trim().length > 0
      ? rec.website.trim()
      : undefined;
    const phone = typeof rec.phone === 'string' && rec.phone.trim().length > 0
      ? rec.phone.trim()
      : undefined;
    const address = typeof rec.address === 'string' && rec.address.trim().length > 0
      ? rec.address.trim()
      : undefined;
    const type = typeof rec.type === 'string' && rec.type.trim().length > 0
      ? rec.type.trim()
      : undefined;
    const region = typeof rec.region === 'string' && rec.region.trim().length > 0
      ? rec.region.trim()
      : undefined;
    const notes = typeof rec.notes === 'string' && rec.notes.trim().length > 0
      ? rec.notes.trim()
      : undefined;
    const domain = deriveDomain(website);
    const key = domain ? 'dom:' + domain.toLowerCase() : 'name:' + name.toLowerCase();
    if (seen.has(key)) continue;
    const categoryParts = [type, region, notes].filter(Boolean).join(' · ');
    seen.set(key, {
      title: name,
      url: website,
      domain,
      phone,
      address,
      category: categoryParts || undefined,
    });
  }

  return {
    listings: Array.from(seen.values()),
    cost: toolState.cost,
    toolCalls: toolState.calls,
  };
}

function isResearchRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'GatewayRateLimitError') return true;
  if (err.name === 'GatewayAuthenticationError') return true;
  if (err.name === 'GatewayInternalServerError') return true;
  const m = err.message.toLowerCase();
  return (
    m.includes('rate limit') ||
    m.includes('free credits') ||
    m.includes('insufficient credit') ||
    m.includes('429') ||
    m.includes('502') ||
    m.includes('503') ||
    m.includes('504')
  );
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
  source: 'research' | 'google_places' | 'dataforseo' = 'dataforseo',
): Partial<Lead> {
  const slug = slugify(l.title) || Math.random().toString(36).slice(2, 10);
  const id = 'prospect-' + (play.id + '-' + slug).slice(0, 80);
  // fullName is intentionally left blank — the company's title isn't a
  // person's name, and the operator (or the contact-enrichment pass) will
  // fill in a real contact. Same for email: no inferred info@domain here,
  // only verbatim real addresses added later.
  const sourceLabel =
    source === 'research'
      ? 'Researched'
      : source === 'google_places'
        ? 'Google Places'
        : 'DataForSEO';
  return {
    id,
    fullName: '',
    companyName: l.title,
    companyUrl: l.url,
    address: l.address,
    phone: l.phone,
    email: '',
    emailInferred: false,
    sourceDetail:
      sourceLabel +
      ': ' +
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
      fullName: (c.fullName ?? '').toString().trim(),
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

