import { gateway } from '@ai-sdk/gateway';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import type { DiscoverFilters } from '@/lib/types';
import { webSearchQuery, searchBusinessListings, isDataForSeoConnected } from '@/lib/integrations/dataforseo';
import { searchPlaces, isGooglePlacesConnected } from '@/lib/integrations/googleplaces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/discover/agent
 *
 * Body: { filters: DiscoverFilters, prompt: string }
 *
 * Streams SSE events describing a tool-using agent loop that:
 *   1. understands the user's short brief ("supercar clubs in UK"),
 *   2. runs multiple search queries across web / business-listings / Places,
 *   3. extracts specific candidate domains + proposes tightened filters.
 *
 * Emits events:
 *   { phase: 'start' }
 *   { phase: 'status', message }
 *   { phase: 'search',  tool, query }
 *   { phase: 'found',   tool, count }
 *   { phase: 'candidate', domain, title, source }
 *   { phase: 'done',    filters, domains, reasoning }
 *   { phase: 'error',   message }
 */

interface IncomingBody {
  filters: DiscoverFilters;
  prompt: string;
}

const FilterGroupSchema = z
  .object({
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
  })
  .partial();

const FiltersSchema = z
  .object({
    location: FilterGroupSchema.optional(),
    industry: FilterGroupSchema.optional(),
    keywords: FilterGroupSchema.optional(),
    companyName: FilterGroupSchema.optional(),
    companyType: FilterGroupSchema.optional(),
    similarTo: z.array(z.string()).optional(),
    sizeBands: z.array(z.string()).optional(),
    savedOnly: z.boolean().optional(),
  })
  .partial();

interface AgentResult {
  filters: DiscoverFilters;
  domains: Array<{ domain: string; title?: string; category?: string; source: string }>;
  reasoning?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<IncomingBody>;
  const current = body.filters ?? {};
  const prompt = (body.prompt ?? '').trim();

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(event: Record<string, unknown>): void {
        controller.enqueue(encoder.encode('data: ' + JSON.stringify(event) + '\n\n'));
      }

      if (!prompt) {
        emit({ phase: 'error', message: 'prompt required' });
        controller.close();
        return;
      }

      emit({ phase: 'start' });
      emit({ phase: 'status', message: 'Understanding your brief…' });

      // Running ledger of discovered candidates — deduped by domain.
      const found = new Map<string, { domain: string; title?: string; category?: string; source: string }>();

      function addCandidate(c: { domain?: string | null; title?: string; category?: string; source: string }) {
        const d = (c.domain ?? '').toLowerCase().replace(/^www\./, '').trim();
        if (!d || !/\./.test(d)) return;
        if (found.has(d)) return;
        found.set(d, { domain: d, title: c.title, category: c.category, source: c.source });
        emit({ phase: 'candidate', domain: d, title: c.title, source: c.source });
      }

      // --------------------------------------------------------------
      // Tool definitions — each tool emits status events as it works.
      // --------------------------------------------------------------

      const web_search = tool({
        description:
          'Run a Google organic web search via DataForSEO. Returns the top hits with {title,url,domain,snippet}. Every returned domain is automatically tracked as a potential candidate. Use this to find specific clubs / businesses / organisations that match the brief.',
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              'A narrow, targeted web query that names the entity you want to find, e.g. "supercar owners clubs UK", "private knee surgery clinics London", "cycling clubs Scotland membership".',
            ),
          limit: z.number().int().min(3).max(15).optional().describe('Number of organic hits (default 10).'),
        }),
        execute: async ({ query, limit = 10 }) => {
          emit({ phase: 'search', tool: 'web_search', query });
          if (!isDataForSeoConnected()) {
            emit({ phase: 'status', message: 'DataForSEO not connected — skipping web search' });
            return { hits: [] };
          }
          try {
            const { hits } = await webSearchQuery({ query, limit });
            emit({ phase: 'found', tool: 'web_search', count: hits.length, query });
            for (const h of hits) {
              if (h.domain && !isJunkDomain(h.domain)) {
                addCandidate({ domain: h.domain, title: h.title, source: 'web' });
              }
            }
            return {
              hits: hits.slice(0, limit).map((h) => ({
                title: h.title,
                url: h.url,
                domain: h.domain,
                snippet: h.snippet,
              })),
            };
          } catch (err) {
            emit({ phase: 'status', message: 'web search failed: ' + (err instanceof Error ? err.message : 'unknown') });
            return { hits: [] };
          }
        },
      });

      const business_listings = tool({
        description:
          'Search DataForSEO business listings (Google Maps + Yellow-Pages data) for businesses matching a free-text description in a location. Returns up to ~50 companies with {title, domain, category, address, phone}. Use this for findable local/SME businesses like shops, clinics, gyms, clubs.',
        inputSchema: z.object({
          description: z
            .string()
            .describe('Short business description, e.g. "supercar club", "orthopaedic private clinic", "bike shop".'),
          locationName: z
            .string()
            .optional()
            .describe('Location string, e.g. "United Kingdom", "London", "Scotland". Defaults to United Kingdom.'),
          limit: z.number().int().min(10).max(100).optional(),
        }),
        execute: async ({ description, locationName = 'United Kingdom', limit = 40 }) => {
          emit({ phase: 'search', tool: 'business_listings', query: description + ' — ' + locationName });
          if (!isDataForSeoConnected()) {
            emit({ phase: 'status', message: 'DataForSEO not connected — skipping listings' });
            return { listings: [] };
          }
          try {
            const { listings } = await searchBusinessListings({ description, locationName, limit });
            emit({ phase: 'found', tool: 'business_listings', count: listings.length, query: description });
            for (const l of listings) {
              if (l.domain && !isJunkDomain(l.domain)) {
                addCandidate({ domain: l.domain, title: l.title, category: l.category, source: 'listings' });
              }
            }
            return {
              listings: listings.slice(0, 25).map((l) => ({
                title: l.title,
                domain: l.domain,
                category: l.category,
                address: l.address,
              })),
            };
          } catch (err) {
            emit({ phase: 'status', message: 'listings failed: ' + (err instanceof Error ? err.message : 'unknown') });
            return { listings: [] };
          }
        },
      });

      const places_search = tool({
        description:
          'Search Google Places for businesses matching a free-text query. Often returns richer websites than business_listings. Use it when you need websites tied to reputable businesses (clubs, clinics, shops).',
        inputSchema: z.object({
          query: z
            .string()
            .describe('The Places text query, e.g. "private knee surgery clinic", "classic car club".'),
          locationName: z.string().optional(),
          limit: z.number().int().min(5).max(20).optional(),
        }),
        execute: async ({ query, locationName = 'United Kingdom', limit = 20 }) => {
          emit({ phase: 'search', tool: 'places_search', query: query + ' — ' + locationName });
          if (!isGooglePlacesConnected()) {
            emit({ phase: 'status', message: 'Google Places not connected — skipping' });
            return { places: [] };
          }
          try {
            const { listings } = await searchPlaces({ query, locationName, limit });
            emit({ phase: 'found', tool: 'places_search', count: listings.length, query });
            for (const l of listings) {
              if (l.domain && !isJunkDomain(l.domain)) {
                addCandidate({ domain: l.domain, title: l.title, category: l.category, source: 'places' });
              }
            }
            return {
              places: listings.slice(0, 20).map((l) => ({
                title: l.title,
                domain: l.domain,
                category: l.category,
                address: l.address,
              })),
            };
          } catch (err) {
            emit({ phase: 'status', message: 'places failed: ' + (err instanceof Error ? err.message : 'unknown') });
            return { places: [] };
          }
        },
      });

      let captured: AgentResult | null = null;

      const return_result = tool({
        description:
          'Return the final merged filter state plus any specific candidate domains you have identified. MUST be called exactly once at the end, after you have run searches. Merge — do not replace — the existing filter state.',
        inputSchema: z.object({
          filters: FiltersSchema,
          candidateDomains: z
            .array(z.string())
            .default([])
            .describe(
              'Specific domains you recommend as strong candidates based on what the tools returned. Lowercase, no protocol, no www.',
            ),
          reasoning: z
            .string()
            .max(400)
            .optional()
            .describe('One-sentence summary of the search strategy you used.'),
        }),
        execute: async ({ filters, candidateDomains, reasoning }) => {
          const extra = (candidateDomains ?? [])
            .map((d) => d.toLowerCase().replace(/^www\./, '').trim())
            .filter((d) => /\./.test(d));
          for (const d of extra) {
            if (!found.has(d)) addCandidate({ domain: d, source: 'agent' });
          }
          captured = {
            filters: filters as DiscoverFilters,
            domains: Array.from(found.values()),
            reasoning,
          };
          return { ok: true };
        },
      });

      // --------------------------------------------------------------
      // Agent prompt
      // --------------------------------------------------------------
      const system = [
        'You are a sourcing agent for Evari, a UK-based premium urban + e-cargo bike brand.',
        'Operators type a short, often casual brief such as "find supercar clubs in UK",',
        '"find yachts in UK", "private knee-surgery clinics in Surrey", "cycling associations",',
        '"boutique bike shops in Scotland". Your job is to turn that brief into a strong set of',
        'SPECIFIC candidate companies AND a tightened filter state for a DataForSEO-backed discovery UI.',
        '',
        'Workflow:',
        '1. Decide intent. What kind of entity is the user after (club, clinic, shop, association,',
        '   nonprofit, corporation)? Where (country, region)? Any strong qualifier (premium, private,',
        '   boutique)?',
        '2. Run 2–4 searches across the tools — mix web_search for enthusiast/community content and',
        '   business_listings / places_search for operational businesses. Vary the queries: try',
        '   synonyms ("club" vs "association" vs "owners group"), broader vs narrower wording, and',
        '   add regional qualifiers. Each tool call surfaces domains automatically, so cover different',
        '   angles rather than repeating the same phrasing.',
        '3. After you have enough coverage (usually 3 tool calls), call return_result with:',
        '      - merged filter state (existing filters + tightened values based on your findings)',
        '      - the 5–20 strongest candidateDomains (organisations you genuinely believe match the',
        '        brief, prioritising the ones that surfaced in multiple tools or look most relevant)',
        '      - a one-sentence reasoning summary',
        '',
        'Filter rules:',
        '- MERGE, never drop existing filters the user did not ask to remove.',
        '- Always populate location.include when the brief names a country/region.',
        '- Use industry.include for industries ("sports clubs", "orthopedic clinics", "bicycle shops").',
        '- Use keywords.include for qualifiers and niche terms ("supercar", "knee replacement", "boutique").',
        '- companyType.include ∈ ["corporation","club","nonprofit","practice","other"] — pick the',
        '  right one based on entity type.',
        '- sizeBands values ∈ ["1-10","11-50","51-200","201-500","501-1000","1001-5000","5000+"].',
        '- similarTo = seed domains (lowercased, no protocol, no www.).',
        '',
        'Pragmatics:',
        '- Skip low-quality domains (directories, wikis, article aggregators, news sites). Prefer the',
        '  actual club/business website.',
        '- If a tool returns 0 results, try rephrasing once, then move on.',
        '- Do not loop more than 4 tool calls total.',
      ].join('\n');

      const user = [
        'Current filters:',
        '```json',
        JSON.stringify(current, null, 2),
        '```',
        '',
        'Brief:',
        prompt,
      ].join('\n');

      // --------------------------------------------------------------
      // Run the agent (gateway first, direct fallback)
      // --------------------------------------------------------------
      async function runOnce(kind: 'gateway' | 'direct') {
        const model =
          kind === 'gateway'
            ? gateway('anthropic/claude-sonnet-4-5')
            : anthropic('claude-sonnet-4-5');
        await generateText({
          model,
          system,
          prompt: user,
          tools: { web_search, business_listings, places_search, return_result },
          stopWhen: stepCountIs(10),
        });
      }

      try {
        try {
          await runOnce('gateway');
        } catch (err) {
          if (!isRetryable(err)) throw err;
          emit({ phase: 'status', message: 'gateway failed, retrying direct…' });
          await runOnce('direct');
        }
      } catch (err) {
        emit({
          phase: 'error',
          message: err instanceof Error ? err.message : 'agent failed',
        });
        controller.close();
        return;
      }

      if (!captured) {
        // Agent never called return_result — build a best-effort result from what we found.
        emit({ phase: 'status', message: 'agent finished without explicit result — using raw findings' });
        captured = {
          filters: current,
          domains: Array.from(found.values()),
        };
      }

      emit({
        phase: 'done',
        filters: captured.filters,
        domains: captured.domains,
        reasoning: captured.reasoning,
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

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const JUNK_DOMAIN_PATTERNS = [
  /(^|\.)wikipedia\.org$/i,
  /(^|\.)wikihow\.com$/i,
  /(^|\.)reddit\.com$/i,
  /(^|\.)quora\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)pinterest\.(com|co\.uk)$/i,
  /(^|\.)yelp\.(com|co\.uk)$/i,
  /(^|\.)tripadvisor\.(com|co\.uk)$/i,
  /(^|\.)yell\.com$/i,
  /(^|\.)bbc\.co\.uk$/i,
  /(^|\.)news\.sky\.com$/i,
  /(^|\.)theguardian\.com$/i,
  /(^|\.)nytimes\.com$/i,
  /(^|\.)forbes\.com$/i,
  /(^|\.)linkedin\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)amazon\.(com|co\.uk)$/i,
  /(^|\.)ebay\.(com|co\.uk)$/i,
  /(^|\.)google\.(com|co\.uk)$/i,
  /(^|\.)apple\.com$/i,
];

function isJunkDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return JUNK_DOMAIN_PATTERNS.some((re) => re.test(d));
}

function isRetryable(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /429|5\d\d|timeout|fetch failed|network|overloaded|rate limit/i.test(msg) ||
    /gateway/i.test(msg)
  );
}
