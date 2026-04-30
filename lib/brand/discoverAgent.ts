/**
 * Discover Agent — a tool-calling research agent for finding
 * companies that match a play's strategic brief.
 *
 * The agent runs a generateText loop with five tools:
 *
 *   1. web_search          — Google organic SERP via DataForSEO. For
 *                            finding directory pages, listicles, and
 *                            company sites in the open web.
 *   2. find_business_listings — Google Places via DataForSEO. For
 *                            local-business matches.
 *   3. fetch_page          — Pull a URL, return the visible text.
 *                            Used to verify what a candidate company
 *                            actually does.
 *   4. add_candidate       — Append a verified match to the play's
 *                            shortlist row in Supabase. Called
 *                            progressively as the agent finds matches,
 *                            so partial results survive timeouts.
 *   5. mark_done           — Optional explicit termination signal.
 *
 * The agent reads the brief + picks, plans its own search queries,
 * iterates between SERP / Places / fetch_page until it has enough
 * verified candidates, and persists each via add_candidate.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateText, stepCountIs, tool } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import {
  isDataForSeoConnected,
  searchBusinessListings,
  webSearchQuery,
} from '@/lib/integrations/dataforseo';
import { buildSystemPrompt, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { getOrCreateBrief } from '@/lib/marketing/strategy';
import {
  appendResearchLog,
  formatResearchLogForPrompt,
  readResearchLog,
} from '@/lib/marketing/researchLog';
import type { Play } from '@/lib/types';

const MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

export interface DiscoverAgentResult {
  inserted: number;
  steps: number;
  costUsd: number;
  agent: 'tool-loop' | 'skipped';
  skipReason?: string;
}

interface ToolCallLog {
  tool: string;
  query?: string;
  url?: string;
  domain?: string;
  ok: boolean;
}

/**
 * Run the discover agent for a single play. Persists candidates via
 * add_candidate as it finds them, so even if the lambda dies mid-loop,
 * partial results are saved.
 */
export async function runDiscoverAgent(
  supabase: SupabaseClient,
  play: Play,
): Promise<DiscoverAgentResult> {
  if (!isDataForSeoConnected()) {
    return { inserted: 0, steps: 0, costUsd: 0, agent: 'skipped', skipReason: 'no-dataforseo' };
  }
  if (!hasAIGatewayCredentials()) {
    return { inserted: 0, steps: 0, costUsd: 0, agent: 'skipped', skipReason: 'no-ai' };
  }

  const brief = await getOrCreateBrief(play.id).catch(() => null);
  const priorResearch = await readResearchLog(supabase, play.id).catch(() => [] as Awaited<ReturnType<typeof readResearchLog>>);

  // Counters captured by closure.
  let inserted = 0;
  let cost = 0;
  const log: ToolCallLog[] = [];
  const seenDomains = new Set<string>();

  // Pre-seed seen with (a) whatever's already in this play's
  // shortlist and (b) the global no-go blocklist. Both protect the
  // operator from re-seeing rejected domains.
  const { data: existing } = await supabase
    .from('dashboard_play_shortlist')
    .select('domain')
    .eq('play_id', play.id);
  for (const r of (existing ?? []) as Array<{ domain: string | null }>) {
    if (r.domain) seenDomains.add(r.domain.toLowerCase().replace(/^www\./, ''));
  }
  const { data: blocked } = await supabase
    .from('dashboard_blocked_domains')
    .select('domain');
  for (const r of (blocked ?? []) as Array<{ domain: string | null }>) {
    if (r.domain) seenDomains.add(r.domain.toLowerCase().replace(/^www\./, ''));
  }

  const tools = {
    web_search: tool({
      description:
        'Search Google for company websites, industry directories, listicle pages (e.g. "best UK supercar clubs"), or trade press. Returns up to 20 organic results with title, URL, domain, and snippet. Use this first to find candidate companies.',
      inputSchema: z.object({
        query: z.string().min(2).describe('Google search query'),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, limit }) => {
        try {
          const { hits, cost: c } = await webSearchQuery({ query, limit: limit ?? 15 });
          cost += c;
          log.push({ tool: 'web_search', query, ok: true });
          appendResearchLog(supabase, play.id, {
            kind: 'agent_search',
            payload: { tool: 'web_search', query, count: hits.length },
          }).catch(() => {});
          return {
            query,
            count: hits.length,
            hits: hits.map((h) => ({
              rank: h.rank,
              title: h.title,
              url: h.url,
              domain: h.domain,
              snippet: h.snippet,
            })),
          };
        } catch (err) {
          log.push({ tool: 'web_search', query, ok: false });
          return { error: (err as Error).message };
        }
      },
    }),
    find_business_listings: tool({
      description:
        'Search Google Places by business category in a specific location. Returns local-business listings with title, domain, address, phone, category. Best for finding companies that exist as physical businesses (boat builders, dealers, clinics, clubs).',
      inputSchema: z.object({
        description: z
          .string()
          .min(2)
          .describe('Google Places business category, e.g. "Boat builder", "Yacht broker", "Bicycle shop"'),
        locationName: z
          .string()
          .describe('DataForSEO location string, e.g. "Hertfordshire, England, United Kingdom"'),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async ({ description, locationName, limit }) => {
        try {
          const { listings, cost: c } = await searchBusinessListings({
            description,
            locationName,
            limit: limit ?? 50,
          });
          cost += c;
          log.push({ tool: 'find_business_listings', query: description + ' in ' + locationName, ok: true });
          appendResearchLog(supabase, play.id, {
            kind: 'agent_search',
            payload: { tool: 'find_business_listings', query: description + ' in ' + locationName, count: listings.length },
          }).catch(() => {});
          return {
            count: listings.length,
            listings: listings.slice(0, limit ?? 50).map((l) => ({
              title: l.title,
              domain: l.domain,
              url: l.url,
              address: l.address,
              category: l.category,
              phone: l.phone,
            })),
          };
        } catch (err) {
          log.push({ tool: 'find_business_listings', query: description, ok: false });
          return { error: (err as Error).message };
        }
      },
    }),
    fetch_page: tool({
      description:
        'Fetch a webpage and return its visible text content (first ~3000 chars). Use to verify what a candidate company actually does before adding them. Especially useful when a SERP result is ambiguous from the title alone.',
      inputSchema: z.object({
        url: z.string().url().describe('Full URL to fetch, e.g. "https://example.com/about"'),
      }),
      execute: async ({ url }) => {
        try {
          const text = await fetchPageText(url);
          log.push({ tool: 'fetch_page', url, ok: true });
          return { url, length: text.length, text: text.slice(0, 3000) };
        } catch (err) {
          log.push({ tool: 'fetch_page', url, ok: false });
          return { error: (err as Error).message };
        }
      },
    }),
    add_candidate: tool({
      description:
        'Add a verified candidate company to the play shortlist. Call this for every company you confirm matches the brief. Always call this progressively as you find matches; do not wait until the end.',
      inputSchema: z.object({
        domain: z.string().describe('Bare domain, no protocol or www'),
        name: z.string().describe('Company name as you would write it'),
        location: z.string().optional().describe('Address or city + country'),
        industry: z.string().optional().describe('Short industry or category label'),
        fitReason: z
          .string()
          .describe('One-line reason this company matches the brief, plain prose, no em-dashes'),
        fitScore: z.number().int().min(0).max(100).optional(),
      }),
      execute: async ({ domain, name, location, industry, fitReason, fitScore }) => {
        const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        if (!cleanDomain || !cleanDomain.includes('.')) {
          return { ok: false, error: 'invalid domain' };
        }
        if (seenDomains.has(cleanDomain)) {
          return { ok: false, error: 'duplicate', domain: cleanDomain };
        }
        seenDomains.add(cleanDomain);
        const logoUrl = 'https://logo.clearbit.com/' + cleanDomain;
        const { error: upsertErr } = await supabase
          .from('dashboard_play_shortlist')
          .upsert(
            {
              play_id: play.id,
              domain: cleanDomain,
              name: name.slice(0, 200),
              industry: industry?.slice(0, 100) ?? null,
              location: location?.slice(0, 300) ?? null,
              description: fitReason.slice(0, 500),
              fit_score: typeof fitScore === 'number' ? fitScore : 70,
              fit_band: typeof fitScore === 'number' && fitScore >= 80 ? 'very_good' : 'good',
              logo_url: logoUrl,
              status: 'candidate',
            },
            { onConflict: 'play_id,domain', ignoreDuplicates: false },
          );
        if (upsertErr) {
          log.push({ tool: 'add_candidate', domain: cleanDomain, ok: false });
          return { ok: false, error: upsertErr.message };
        }
        inserted += 1;
        log.push({ tool: 'add_candidate', domain: cleanDomain, ok: true });
        return { ok: true, domain: cleanDomain, totalInserted: inserted };
      },
    }),
    mark_done: tool({
      description:
        'Call this when you have added enough candidates and want to stop the agent loop early. Pass a short summary.',
      inputSchema: z.object({
        summary: z.string().describe('What you found, in one sentence'),
      }),
      execute: async ({ summary }) => {
        return { ok: true, summary, totalInserted: inserted };
      },
    }),
  };

  const briefSummary = brief
    ? [
        brief.synopsisText && brief.synopsisText.trim().length > 0
          ? 'Synopsis (the canonical strategy paragraph the operator wrote):\n' + brief.synopsisText
          : '',
        brief.idealCustomer && brief.idealCustomer.trim().length > 0
          ? 'Ideal customer / buyer persona:\n' + brief.idealCustomer
          : '',
        brief.industries.length > 0 ? 'Sectors picked on Market analysis: ' + brief.industries.join(', ') : '',
        brief.geographies && brief.geographies.length > 0
          ? 'Geographies picked: ' + brief.geographies.join(', ')
          : (brief.geography ? 'Geography (single string): ' + brief.geography : ''),
        brief.companySizes && brief.companySizes.length > 0
          ? 'Target company sizes: ' + brief.companySizes.join(', ')
          : '',
        brief.revenues && brief.revenues.length > 0
          ? 'Target revenue bands: ' + brief.revenues.join(', ')
          : '',
        brief.targetAudience.length > 0 ? 'Roles to email: ' + brief.targetAudience.join(', ') : '',
        brief.channels.length > 0 ? 'Channels in mix: ' + brief.channels.join(', ') : '',
        brief.messaging && brief.messaging.length > 0
          ? 'Messaging angles:\n' + brief.messaging.map((m, i) => `  ${i + 1}. ${m.angle}` + (m.line ? ` (${m.line})` : '')).join('\n')
          : '',
        brief.successMetrics && brief.successMetrics.length > 0
          ? 'Success metrics:\n' + brief.successMetrics.map((m, i) => `  ${i + 1}. ${m.name}` + (m.target ? ` -> ${m.target}` : '')).join('\n')
          : '',
        brief.objective && brief.objective.trim().length > 0 ? 'Objective: ' + brief.objective : '',
        brief.campaignName && brief.campaignName.trim().length > 0 ? 'Campaign: ' + brief.campaignName : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    : '(no strategy brief yet, infer everything from the title and pitch)';

  const task =
    [
      'You are a research analyst on a 5-minute deadline. The brief below is ground truth. Find 20 to 30 verified company matches and call add_candidate on each. SPEED MATTERS more than perfection.',
      '',
      'Use parallel tool calls aggressively: in a single response you can call web_search AND find_business_listings simultaneously, and you can call add_candidate 10+ times in one response. Batch your work.',
      '',
      'Default loop (this is the optimal sequence; do not deviate unless the brief specifically demands it):',
      '  1. ONE web_search for an industry list or directory (e.g. "list of UK superyacht builders 2024").',
      '  2. ONE find_business_listings for the right category in the right location (e.g. "Bicycle shop" in "Hertfordshire, England, United Kingdom").',
      '  3. From those two calls you should have 30 to 80 candidates. For each that is OBVIOUSLY a fit from name + snippet + category alone, call add_candidate IMMEDIATELY. Do not fetch_page.',
      '  4. Only fetch_page when the candidate is genuinely ambiguous (e.g. a generic-looking domain you cannot place). Cap fetch_page at 3 calls total.',
      '  5. If after step 3 you have fewer than 15 added, run ONE more web_search with a different angle.',
      '  6. Stop and call mark_done when you have 20+ adds, or you have run 3+ tool calls without adding anything.',
      '',
      'Hard rules:',
      '- Add_candidate is your goal, not search. Every search should produce 5+ adds.',
      '- Skip aggregator domains: wikipedia, linkedin, facebook, twitter, glassdoor, yell, yelp, tripadvisor, gov.uk, news outlets, marketplaces (amazon, ebay).',
      '- fitReason must reference WHY they match: tier, geography, size, signal. Plain prose, no em-dashes.',
      '- If the brief says UK, NEVER add a US company. Geography is non-negotiable.',
    ].join('\n');

  const prompt = [
    'Play title: ' + play.title,
    'Brief: ' + (play.brief ?? '(no brief)'),
    '',
    'Strategic brief:',
    briefSummary,
    '',
    'Prior research from earlier stages (Market analysis, Target profile, Synopsis):',
    formatResearchLogForPrompt(priorResearch),
    '',
    'Already in the shortlist (do not re-add):',
    Array.from(seenDomains).slice(0, 40).join(', ') || '(none)',
    '',
    'Run the optimal loop now. Aim for 20 verified adds. Move fast. Call mark_done when complete.',
  ].join('\n');

  const system = await buildSystemPrompt({ voice: 'analyst', task });

  let steps = 0;
  const stopAfter = stepCountIs(15);
  const onStepFinish = () => { steps += 1; };
  try {
    try {
      await generateText({
        model: gateway(MODEL),
        system,
        prompt,
        tools,
        stopWhen: stopAfter,
        onStepFinish,
      });
    } catch (err) {
      if (!process.env.ANTHROPIC_API_KEY || !isRetryable(err)) throw err;
      const bare = MODEL.replace(/^anthropic\//, '');
      await generateText({
        model: anthropic(bare),
        system,
        prompt,
        tools,
        stopWhen: stopAfter,
        onStepFinish,
      });
    }
  } catch {
    // Even on error we have whatever was already added via add_candidate.
  }

  return {
    inserted,
    steps,
    costUsd: cost,
    agent: 'tool-loop',
  };
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'GatewayRateLimitError') return true;
  if (err.name === 'GatewayAuthenticationError') return true;
  if (err.name === 'GatewayInternalServerError') return true;
  const m = err.message.toLowerCase();
  return (
    m.includes('rate limit') ||
    m.includes('insufficient credit') ||
    m.includes('429') ||
    m.includes('502') ||
    m.includes('503') ||
    m.includes('504')
  );
}

/**
 * Lightweight page fetcher. No JS execution, no headless browser.
 * Returns the visible text of the page with HTML/scripts stripped,
 * truncated to 8000 characters to keep context use sane.
 */
async function fetchPageText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Pretend to be a real browser so we don't get bot-blocked.
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
      throw new Error('non-html content-type: ' + ct);
    }
    const html = await res.text();
    return stripHtml(html).slice(0, 8000);
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
