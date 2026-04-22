import { generateText, stepCountIs, tool } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  isDataForSeoConnected,
  webSearchQuery,
} from '@/lib/integrations/dataforseo';
import { buildSystemPrompt, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import type { DiscoveredCompany, DiscoverEmail, DiscoverSignal } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ENRICH_MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

/**
 * POST /api/discover/enrich/[domain]?force=1
 *
 * SSE-streaming enrichment for a single company. Fills in description, logo,
 * orgType, employee band, hq, socials, technologies, signals, emails.
 *
 * Cache short-circuit: if we already have a record < 30 days old, stream
 * `{ phase: 'done', cached: true, company }` and exit — unless ?force=1.
 *
 * Events:
 *   start           — enrichment kicking off
 *   fetching        — scraping a page
 *   searching       — running a web_search
 *   search-done     — a search returned (with { query, hits })
 *   synth           — calling the model to synthesise the record
 *   done            — final payload { company }
 *   error           — terminal failure
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ domain: string }> },
) {
  const { domain: rawDomain } = await params;
  const domain = normaliseDomain(rawDomain);
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(event: Record<string, unknown>): void {
        controller.enqueue(encoder.encode('data: ' + JSON.stringify(event) + '\n\n'));
      }
      function fail(message: string, status = 500): void {
        emit({ phase: 'error', message, status });
        controller.close();
      }

      if (!domain) {
        fail('Invalid domain', 400);
        return;
      }

      const supabase = createSupabaseAdmin();
      if (!supabase) {
        fail('Supabase admin client unavailable');
        return;
      }

      // -------- Cache short-circuit --------------------------------------
      if (!force) {
        const { data } = await supabase
          .from('dashboard_discovered_companies')
          .select('payload')
          .eq('domain', domain)
          .maybeSingle();
        const cached = (data?.payload ?? null) as DiscoveredCompany | null;
        if (cached && cached.enrichedAt) {
          const ageMs = Date.now() - new Date(cached.enrichedAt).getTime();
          if (ageMs < 30 * 24 * 3600 * 1000) {
            emit({ phase: 'done', cached: true, company: cached });
            controller.close();
            return;
          }
        }
      }

      if (!hasAIGatewayCredentials()) {
        fail('AI gateway not configured');
        return;
      }

      emit({ phase: 'start', domain });

      try {
        const result = await runEnrichment(domain, (evt) => emit(evt));
        const enrichedAt = new Date().toISOString();
        const company: DiscoveredCompany = { ...result, domain, enrichedAt };
        const { error: writeErr } = await supabase
          .from('dashboard_discovered_companies')
          .upsert({
            domain,
            payload: company,
            updated_at: enrichedAt,
          });
        if (writeErr) {
          console.warn('[discover/enrich] persist failed', writeErr);
        }
        emit({ phase: 'done', cached: false, company });
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Enrichment failed';
        console.warn('[discover/enrich] fatal', err);
        fail(msg);
      }
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
// Enrichment — Claude tool loop over the open web + company homepage
// ---------------------------------------------------------------------------

type Emit = (event: Record<string, unknown>) => void;

async function runEnrichment(
  domain: string,
  emit: Emit,
): Promise<Omit<DiscoveredCompany, 'domain' | 'enrichedAt'>> {
  const task =
    `Build a structured company profile for ${domain}. Visit the site, run targeted web searches, then output one JSON object matching the schema below.\n\n` +
    `Rules:\n` +
    `- Only record facts you can verify from your tool outputs. If a field is unclear, leave it blank.\n` +
    `- For employeeBand, use one of: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+".\n` +
    `- For orgType, pick one of: corporation, club, nonprofit, practice, other.\n` +
    `- For signals, return up to 5 recent items (hires, news, launches, investment) with short titles + dates when known.\n` +
    `- For emails, return every verifiable @${domain} address you encounter, with the role bucket and a source URL.\n` +
    `- Do not invent people. If nobody is named publicly, leave emails[].name empty for role addresses.\n\n` +
    `Output exactly one JSON object (no prose) wrapped in <json>...</json>:\n` +
    `{\n` +
    `  "name": string,\n` +
    `  "description": string, // 1-3 sentences\n` +
    `  "category": string, // industry label\n` +
    `  "orgType"?: "corporation"|"club"|"nonprofit"|"practice"|"other",\n` +
    `  "employeeBand"?: string,\n` +
    `  "employeeCount"?: number,\n` +
    `  "foundedYear"?: number,\n` +
    `  "hq"?: { "city"?: string, "region"?: string, "country"?: string, "full"?: string },\n` +
    `  "phone"?: string,\n` +
    `  "socials"?: { "linkedin"?: string, "facebook"?: string, "instagram"?: string, "twitter"?: string, "youtube"?: string, "tiktok"?: string },\n` +
    `  "technologies"?: string[],\n` +
    `  "signals"?: [{ "type": string, "title": string, "url"?: string, "date"?: string, "summary"?: string }],\n` +
    `  "emails"?: [{ "address": string, "bucket"?: string, "label"?: string, "name"?: string, "jobTitle"?: string, "source"?: string, "confidence"?: string, "sourceUrl"?: string }],\n` +
    `  "keywords"?: string[],\n` +
    `  "sources"?: string[]\n` +
    `}`;

  const system = await buildSystemPrompt({ voice: 'analyst', task });
  const prompt = `Domain: ${domain}`;

  const sources = new Set<string>();

  const tools = {
    fetch_page: tool({
      description:
        'Fetch a URL and return its plain-text content. Use this for pages on the company site (home, about, contact, team, press).',
      inputSchema: z.object({
        url: z.string().url(),
      }),
      execute: async ({ url }) => {
        emit({ phase: 'fetching', url });
        sources.add(url);
        try {
          const html = await fetchAndClean(url);
          return { url, text: html.slice(0, 20_000) };
        } catch (err) {
          return { url, error: err instanceof Error ? err.message : 'fetch failed' };
        }
      },
    }),
    web_search: tool({
      description:
        'Google-search the open web. Use this to find LinkedIn profiles, press releases, recent hires, tech-stack mentions, and @' +
        domain +
        ' email addresses.',
      inputSchema: z.object({
        query: z.string().min(2),
        limit: z.number().int().min(1).max(15).optional(),
      }),
      execute: async ({ query, limit }) => {
        if (!isDataForSeoConnected()) {
          return { error: 'DataForSEO not configured' };
        }
        emit({ phase: 'searching', query });
        const { hits } = await webSearchQuery({
          query,
          limit: Math.min(limit ?? 10, 15),
        });
        emit({ phase: 'search-done', query, hits: hits.length });
        for (const h of hits.slice(0, 5)) sources.add(h.url);
        return {
          query,
          hits: hits.map((h) => ({
            rank: h.rank,
            title: h.title,
            url: h.url,
            domain: h.domain,
            snippet: h.snippet,
          })),
        };
      },
    }),
  };

  emit({ phase: 'synth' });

  const text = await runWithFallback({ system, task, prompt, tools });
  const parsed = parseJsonEnvelope(text);
  if (!parsed) {
    throw new Error('Model returned no JSON payload');
  }

  const normalised = normaliseCompany(parsed, domain);
  if (sources.size > 0) {
    normalised.sources = Array.from(sources).slice(0, 20);
  }
  return normalised;
}

async function runWithFallback(opts: {
  system: string;
  task: string;
  prompt: string;
  tools: Record<string, unknown>;
}): Promise<string> {
  const system = opts.system;
  try {
    const { text } = await generateText({
      model: gateway(ENRICH_MODEL),
      system,
      prompt: opts.prompt,
      // @ts-expect-error ai-sdk tool shape is loosely typed here
      tools: opts.tools,
      stopWhen: stepCountIs(18),
    });
    return text;
  } catch (err) {
    if (!process.env.ANTHROPIC_API_KEY || !isRetryable(err)) throw err;
    const bareModel = ENRICH_MODEL.replace(/^anthropic\//, '');
    const { text } = await generateText({
      model: anthropic(bareModel),
      system,
      prompt: opts.prompt,
      // @ts-expect-error ai-sdk tool shape is loosely typed here
      tools: opts.tools,
      stopWhen: stepCountIs(18),
    });
    return text;
  }
}

function isRetryable(err: unknown): boolean {
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

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseJsonEnvelope(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  // Prefer <json>…</json>
  const tagged = raw.match(/<json>([\s\S]*?)<\/json>/i);
  const candidate = tagged ? tagged[1].trim() : tryExtractJsonBlock(raw);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function tryExtractJsonBlock(raw: string): string | null {
  // Strip markdown fences
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  // Pick the first balanced {...}
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) return raw.slice(first, last + 1);
  return null;
}

function normaliseCompany(
  raw: Record<string, unknown>,
  domain: string,
): Omit<DiscoveredCompany, 'domain' | 'enrichedAt'> {
  const name = asString(raw.name) || domain.split('.')[0];
  const description = asString(raw.description);
  const category = asString(raw.category);
  const orgType = coerceOrgType(raw.orgType);
  const employeeBand = asString(raw.employeeBand);
  const employeeCount = asNumber(raw.employeeCount);
  const foundedYear = asNumber(raw.foundedYear);
  const phone = asString(raw.phone);

  const hqRaw = raw.hq as Record<string, unknown> | undefined;
  const hq = hqRaw
    ? {
        city: asString(hqRaw.city) || undefined,
        region: asString(hqRaw.region) || undefined,
        country: asString(hqRaw.country) || undefined,
        full: asString(hqRaw.full) || undefined,
      }
    : undefined;

  const sRaw = raw.socials as Record<string, unknown> | undefined;
  const socials = sRaw
    ? {
        linkedin: asString(sRaw.linkedin) || undefined,
        facebook: asString(sRaw.facebook) || undefined,
        instagram: asString(sRaw.instagram) || undefined,
        twitter: asString(sRaw.twitter) || undefined,
        youtube: asString(sRaw.youtube) || undefined,
        tiktok: asString(sRaw.tiktok) || undefined,
      }
    : undefined;

  const technologies = asStringArray(raw.technologies);
  const keywords = asStringArray(raw.keywords);
  const sourcesArr = asStringArray(raw.sources);

  const signalsRaw = Array.isArray(raw.signals) ? (raw.signals as unknown[]) : [];
  const signals: DiscoverSignal[] = [];
  for (const s of signalsRaw.slice(0, 5)) {
    if (!s || typeof s !== 'object') continue;
    const so = s as Record<string, unknown>;
    const title = asString(so.title);
    if (!title) continue;
    signals.push({
      type: coerceSignalType(so.type),
      title,
      url: asString(so.url) || undefined,
      date: asString(so.date) || undefined,
      summary: asString(so.summary) || undefined,
    });
  }

  const emailsRaw = Array.isArray(raw.emails) ? (raw.emails as unknown[]) : [];
  const emails: DiscoverEmail[] = [];
  const seenAddr = new Set<string>();
  for (const e of emailsRaw) {
    if (!e || typeof e !== 'object') continue;
    const eo = e as Record<string, unknown>;
    const address = asString(eo.address)?.trim().toLowerCase();
    if (!address) continue;
    if (seenAddr.has(address)) continue;
    seenAddr.add(address);
    emails.push({
      address,
      bucket: coerceBucket(eo.bucket),
      label: asString(eo.label) || undefined,
      name: asString(eo.name) || undefined,
      jobTitle: asString(eo.jobTitle) || undefined,
      source: coerceEmailSource(eo.source),
      confidence: coerceConfidence(eo.confidence),
      sourceUrl: asString(eo.sourceUrl) || undefined,
    });
  }

  return {
    name,
    description: description || undefined,
    category: category || undefined,
    orgType,
    employeeBand: employeeBand || undefined,
    employeeCount,
    foundedYear,
    hq,
    phone: phone || undefined,
    socials,
    technologies: technologies.length ? technologies : undefined,
    keywords: keywords.length ? keywords : undefined,
    signals: signals.length ? signals : undefined,
    emails: emails.length ? emails : undefined,
    sources: sourcesArr.length ? sourcesArr : undefined,
  };
}

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  return '';
}
function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v);
  return undefined;
}
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter((s) => s.length > 0);
}
function coerceOrgType(v: unknown): DiscoveredCompany['orgType'] {
  const s = asString(v).toLowerCase();
  if (['corporation', 'club', 'nonprofit', 'practice', 'other'].includes(s)) {
    return s as DiscoveredCompany['orgType'];
  }
  return undefined;
}
function coerceSignalType(v: unknown): DiscoverSignal['type'] {
  const s = asString(v).toLowerCase();
  const allowed: DiscoverSignal['type'][] = [
    'hire',
    'news',
    'event',
    'launch',
    'hiring',
    'investment',
    'press',
    'other',
  ];
  return (allowed.includes(s as DiscoverSignal['type']) ? s : 'other') as DiscoverSignal['type'];
}
function coerceBucket(v: unknown): DiscoverEmail['bucket'] {
  const s = asString(v).toLowerCase();
  if (['support', 'sales', 'media', 'generic', 'personal'].includes(s)) {
    return s as DiscoverEmail['bucket'];
  }
  return undefined;
}
function coerceEmailSource(v: unknown): DiscoverEmail['source'] {
  const s = asString(v).toLowerCase();
  if (['scraped', 'mailto', 'inferred', 'ai'].includes(s)) {
    return s as DiscoverEmail['source'];
  }
  return undefined;
}
function coerceConfidence(v: unknown): DiscoverEmail['confidence'] {
  const s = asString(v).toLowerCase();
  if (['high', 'medium', 'low'].includes(s)) {
    return s as DiscoverEmail['confidence'];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Fetch + text extraction
// ---------------------------------------------------------------------------

async function fetchAndClean(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (compatible; EvariDiscoverBot/1.0; +https://evari.cc)',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('text/html') && !ct.includes('text/plain')) {
    throw new Error(`Unsupported content-type: ${ct || 'unknown'}`);
  }
  const html = await res.text();
  return htmlToText(html);
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
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

function normaliseDomain(input: string): string {
  const s = (input || '').trim().toLowerCase();
  if (!s) return '';
  try {
    const url = s.startsWith('http') ? new URL(s) : new URL('https://' + s);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}
