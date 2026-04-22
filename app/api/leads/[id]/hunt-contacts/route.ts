import { generateText, stepCountIs, tool } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getLead } from '@/lib/dashboard/repository';
import {
  isDataForSeoConnected,
  webSearchQuery,
} from '@/lib/integrations/dataforseo';
import { buildSystemPrompt, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import type { CompanyContact } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const HUNT_MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

/**
 * POST /api/leads/[id]/hunt-contacts
 *
 * Claude research agent that hunts the open web for email addresses tied to a
 * prospect's domain. Goes wider than the existing /enrich-contacts route —
 * that one scrapes only the company's own site; this one Google-searches for
 * anywhere on the web where a `@{domain}` email or named employee shows up
 * (LinkedIn public pages, press releases, news articles, directory listings,
 * conference speaker bios, etc.).
 *
 * Streams SSE so the UI can show live progress:
 *   planning          — research is starting
 *   searching         — a tool call is in flight (includes { query, index, tool })
 *   search-done       — a tool call returned (includes { query, found, source })
 *   all-searches-done — research finished, candidates parsed (incl. { total, costTotal })
 *   done              — final payload (incl. { candidates, costUsd })
 *   error             — terminal failure
 *
 * Does NOT save. Returns candidates in the `done` event so the UI can render
 * a picker; the operator confirms selections and a separate
 * /api/leads/[id]/append-contacts call persists them.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(event: Record<string, unknown>): void {
        controller.enqueue(
          encoder.encode('data: ' + JSON.stringify(event) + '\n\n'),
        );
      }
      function fail(message: string, status = 500): void {
        emit({ phase: 'error', message, status });
        controller.close();
      }

      const supabase = createSupabaseAdmin();
      if (!supabase) {
        fail('Supabase admin client unavailable');
        return;
      }
      const lead = await getLead(supabase, id);
      if (!lead) {
        fail('Lead not found', 404);
        return;
      }
      if (!hasAIGatewayCredentials()) {
        fail('AI gateway not configured');
        return;
      }
      if (!isDataForSeoConnected()) {
        fail('DataForSEO not configured (research agent needs web_search)');
        return;
      }
      const domain = deriveDomain(lead.companyUrl);
      if (!domain) {
        fail('Prospect has no companyUrl — cannot hunt by domain', 400);
        return;
      }

      try {
        const existingEmails = collectExistingEmails(lead);
        emit({
          phase: 'planning',
          message:
            'Hunting the open web for emails on ' + domain +
            (existingEmails.length > 0
              ? ' (skipping ' + existingEmails.length + ' already known)'
              : ''),
          domain,
        });

        const res = await huntContacts({
          domain,
          companyName: lead.companyName || lead.fullName || domain,
          existingEmails,
          emit,
        });

        emit({
          phase: 'all-searches-done',
          message:
            'Research complete — ' +
            res.candidates.length +
            ' candidate(s) from ' +
            res.toolCalls +
            ' tool call(s). Cost $' +
            res.cost.toFixed(3) +
            '.',
          total: res.candidates.length,
          costTotal: res.cost,
        });
        emit({
          phase: 'done',
          candidates: res.candidates,
          costUsd: res.cost,
          domain,
        });
        controller.close();
      } catch (err) {
        fail('Hunt failed: ' + (err as Error).message);
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
// The research agent itself
// ---------------------------------------------------------------------------

interface HuntedContact {
  name?: string;
  jobTitle?: string;
  email: string;
  confidence?: 'high' | 'medium' | 'low';
  sourceUrl?: string;
  sourceTitle?: string;
  snippet?: string;
}

async function huntContacts(opts: {
  domain: string;
  companyName: string;
  existingEmails: string[];
  emit: (event: Record<string, unknown>) => void;
}): Promise<{ candidates: HuntedContact[]; cost: number; toolCalls: number }> {
  const { domain, companyName, existingEmails, emit } = opts;

  const system = await buildSystemPrompt({
    voice: 'analyst',
    task:
      'Hunt the open web for real, named email contacts whose address ends in @' +
      domain +
      '. Use web_search freely; aim for comprehensive coverage. Return ONE final JSON object with the best candidates. Do NOT save anything — the operator will pick which to keep.',
  });

  const knownEmailsBlock = existingEmails.length > 0
    ? '\n\nAlready on file — do NOT return these:\n' +
      existingEmails.map((e) => '- ' + e).join('\n')
    : '';

  const prompt = [
    'TARGET',
    '------',
    'Company: ' + companyName,
    'Domain:  ' + domain,
    '',
    'YOUR JOB',
    '--------',
    'Find as many real, named email addresses on @' + domain + ' as you can.',
    'Also surface named people who work there WITHOUT an email yet — the',
    'operator will still want their names. Aim for 10-30 candidates.',
    '',
    'SEARCH IDEAS',
    '------------',
    'Mix and match:',
    '  - "@' + domain + '"                      (literal email hunt)',
    '  - "' + companyName + '" email',
    '  - site:linkedin.com/in "' + companyName + '"',
    '  - site:linkedin.com "' + companyName + '" email',
    '  - "' + domain + '" team                   (find team pages)',
    '  - "' + domain + '" contact',
    '  - "' + domain + '" press',
    '  - "' + companyName + '" consultant   (for clinics)',
    '  - "' + companyName + '" director    (for companies / clubs)',
    '  - "' + companyName + '" committee   (for clubs / associations)',
    '  - "' + companyName + '" spokesperson',
    '  - "' + domain + '" filetype:pdf    (annual reports, brochures, programmes)',
    '',
    'Run 5-10 web_searches that cover the angles that most plausibly surface',
    'named employees or contact pages for this specific business. Read the',
    'snippets carefully — emails often hide there in plain text. If a snippet',
    'mentions a role but no email, still record the person (name + title).',
    '',
    'OUTPUT FORMAT',
    '-------------',
    'Return ONLY a JSON object, no prose, no markdown fences:',
    '{',
    '  "candidates": [',
    '    {',
    '      "name": string,',
    '      "jobTitle"?: string,',
    '      "email": string,            // MUST end in @' + domain + ' OR be a related-domain address you have verified as belonging to the same org',
    '      "confidence"?: "high" | "medium" | "low",  // how sure you are this email is real + active',
    '      "sourceUrl"?: string,       // page you found it on',
    '      "sourceTitle"?: string,',
    '      "snippet"?: string          // <=200 chars, the quote that contained the email',
    '    },',
    '    ...',
    '  ]',
    '}',
    '',
    'RULES',
    '-----',
    '- Every "email" must be a real email you saw in a source, OR left blank',
    '  as an empty string "" if you only found the person by name.',
    '- NEVER guess or invent an email you did not see. No pattern inference.',
    '- NEVER return role/shared inboxes like info@, contact@, admin@, sales@,',
    '  membership@, press@, media@. Only named-person mailboxes.',
    '- If the email does NOT end in @' + domain + ', include a "snippet" that',
    '  makes clear why it still belongs to this organisation.',
    '- Dedupe on email (case-insensitive).',
    knownEmailsBlock,
  ].join('\n');

  const toolState = { calls: 0, cost: 0 };

  const tools = {
    web_search: tool({
      description:
        'Google-style organic search. Use 5-10 times across different angles. Returns title + url + domain + snippet for each hit.',
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
          query: { description: query, tool: 'web_search' },
          index: idx,
        });
        try {
          const { hits, cost } = await webSearchQuery({ query, limit: limit ?? 10 });
          toolState.cost += cost;
          emit({
            phase: 'search-done',
            message:
              'web_search returned ' + hits.length + ' hit(s) for "' + query + '".',
            query: { description: query, tool: 'web_search' },
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
            message: 'web_search failed: ' + msg,
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
    fetch_page: tool({
      description:
        'Fetch a single web page and return its plain-text content (HTML stripped). Use sparingly — only when a web_search snippet mentions a promising team/contact/about page but the emails are not in the snippet itself. Max 1 call per distinct URL.',
      inputSchema: z.object({
        url: z.string().url().describe('Absolute URL to fetch'),
      }),
      execute: async ({ url }) => {
        toolState.calls += 1;
        const idx = toolState.calls;
        emit({
          phase: 'searching',
          message: 'fetch_page: ' + url,
          query: { description: url, tool: 'fetch_page' },
          index: idx,
        });
        try {
          const text = await fetchAndClean(url);
          emit({
            phase: 'search-done',
            message: 'fetch_page returned ' + text.length + ' chars from ' + url + '.',
            query: { description: url, tool: 'fetch_page' },
            found: text.length > 0 ? 1 : 0,
            source: 'fetch_page',
            costUsd: 0,
            costTotal: toolState.cost,
            index: idx,
          });
          return { url, text: text.slice(0, 20_000) };
        } catch (err) {
          const msg = (err as Error).message;
          emit({
            phase: 'search-done',
            message: 'fetch_page failed: ' + msg,
            query: { description: url, tool: 'fetch_page' },
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
      model: gateway(HUNT_MODEL),
      system,
      prompt,
      tools,
      stopWhen: stepCountIs(14),
    });
    finalText = text;
  } catch (err) {
    if (!process.env.ANTHROPIC_API_KEY || !isRetryable(err)) throw err;
    const bareModel = HUNT_MODEL.replace(/^anthropic\//, '');
    const { text } = await generateText({
      model: anthropic(bareModel),
      system,
      prompt,
      tools,
      stopWhen: stepCountIs(14),
    });
    finalText = text;
  }

  const match = finalText.match(/\{[\s\S]*\}/);
  let parsed: Record<string, unknown> | undefined;
  if (match) {
    try {
      parsed = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      // fall through
    }
  }
  if (!parsed) {
    throw new Error('Hunt agent did not return parseable JSON');
  }

  const raw = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const existingSet = new Set(existingEmails.map((e) => e.toLowerCase()));
  const seen = new Set<string>();
  const out: HuntedContact[] = [];

  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const rec = c as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    const email = typeof rec.email === 'string' ? rec.email.trim() : '';
    const emailLower = email.toLowerCase();
    if (email && existingSet.has(emailLower)) continue;
    if (email && isRoleEmail(email)) continue;
    const key = email ? 'e:' + emailLower : name ? 'n:' + name.toLowerCase() : '';
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      name: name || undefined,
      jobTitle: typeof rec.jobTitle === 'string' && rec.jobTitle.trim().length > 0
        ? rec.jobTitle.trim()
        : undefined,
      email,
      confidence:
        rec.confidence === 'high' || rec.confidence === 'medium' || rec.confidence === 'low'
          ? rec.confidence
          : undefined,
      sourceUrl: typeof rec.sourceUrl === 'string' && rec.sourceUrl.trim().length > 0
        ? rec.sourceUrl.trim()
        : undefined,
      sourceTitle: typeof rec.sourceTitle === 'string' && rec.sourceTitle.trim().length > 0
        ? rec.sourceTitle.trim()
        : undefined,
      snippet: typeof rec.snippet === 'string' && rec.snippet.trim().length > 0
        ? rec.snippet.trim().slice(0, 200)
        : undefined,
    });
  }

  return {
    candidates: out,
    cost: toolState.cost,
    toolCalls: toolState.calls,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url.startsWith('http') ? url : 'https://' + url);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return undefined;
  }
}

function collectExistingEmails(
  lead: { email?: string; orgProfile?: { contacts?: CompanyContact[] } },
): string[] {
  const set = new Set<string>();
  if (lead.email) set.add(lead.email.toLowerCase().trim());
  for (const c of lead.orgProfile?.contacts ?? []) {
    if (c.email) set.add(c.email.toLowerCase().trim());
  }
  return Array.from(set).filter(Boolean);
}

const ROLE_LOCALS = new Set<string>([
  'info',
  'contact',
  'hello',
  'hi',
  'enquiries',
  'enquiry',
  'inquiries',
  'inquiry',
  'admin',
  'administration',
  'office',
  'reception',
  'mail',
  'email',
  'hq',
  'team',
  'support',
  'help',
  'ops',
  'sales',
  'marketing',
  'membership',
  'members',
  'secretary',
  'treasurer',
  'press',
  'media',
  'bookings',
  'events',
  'feedback',
  'general',
  'club',
  'webmaster',
  'noreply',
  'no-reply',
  'donotreply',
]);

function isRoleEmail(email: string): boolean {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (!local) return false;
  if (ROLE_LOCALS.has(local)) return true;
  const stem = local.split(/[.\-_]/)[0];
  return ROLE_LOCALS.has(stem ?? '');
}

async function fetchAndClean(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; EvariDashboard/1.0; +https://evari.cc)',
        Accept: 'text/html,application/xhtml+xml,text/plain',
      },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const contentType = res.headers.get('content-type') ?? '';
    const body = await res.text();
    if (contentType.includes('text/plain')) return collapseWhitespace(body);
    return htmlToText(body);
  } finally {
    clearTimeout(timeout);
  }
}

function htmlToText(html: string): string {
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/href\s*=\s*"mailto:([^"]+)"/gi, ' email: $1 ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;/gi, "'");
  return collapseWhitespace(s);
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
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
