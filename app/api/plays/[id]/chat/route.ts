import { NextResponse } from 'next/server';
import { generateText, stepCountIs } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { anthropic } from '@ai-sdk/anthropic';
import { tool } from 'ai';
import { z } from 'zod';
import { buildSystemPrompt, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay } from '@/lib/dashboard/repository';
import { listCachedGmailThreads } from '@/lib/integrations/gmail';
import {
  isDataForSeoConnected,
  searchBusinessListings,
  webSearchQuery,
} from '@/lib/integrations/dataforseo';
import type { GmailThreadSummary, Play, PlayChatMessage } from '@/lib/types';

export const runtime = 'nodejs';
// Tool loop can do 2–4 sequential calls; give it headroom.
export const maxDuration = 120;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const DEFAULT_MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

/**
 * POST /api/plays/[id]/chat
 *
 * Per-play "Spitball with Claude" chat. The assistant is grounded in the
 * brand brief (from gateway.buildSystemPrompt) and the play's own context.
 * It can reach for two tools mid-conversation:
 *
 *   - `web_search`          — Google-style organic results for any query
 *   - `find_business_listings` — real companies matching a keyword + location
 *
 * The tool loop runs for up to 5 sequential steps before we force a final
 * text reply.
 *
 * Persistence: each exchange (user prompt + assistant reply) is appended
 * to `play.payload.chat` in `dashboard_plays` and `updatedAt` is bumped.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    history?: ChatMessage[];
  };
  const message = (body.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: 'empty message' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  const [play, gmailContext] = await Promise.all([
    getPlay(supabase, id),
    safeGmailContext(),
  ]);
  if (!play) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }

  const prompt = [
    `Play title: ${play.title}`,
    `Stage: ${play.stage}`,
    '',
    'Brief:',
    play.brief,
    '',
    play.research.length > 0
      ? 'Research notes so far:\n' +
        play.research.map((r) => `- ${r.title}: ${r.body}`).join('\n')
      : '',
    play.targets.length > 0
      ? `Targets so far (${play.targets.length}):\n` +
        play.targets
          .map((t) => `- ${t.name}${t.org ? ' @ ' + t.org : ''}${t.status ? ' [' + t.status + ']' : ''}`)
          .join('\n')
      : '',
    play.messaging.length > 0
      ? `Messaging drafts (${play.messaging.length}):\n` +
        play.messaging
          .map((m) => `- ${m.channel}${m.subject ? ' · "' + m.subject + '"' : ''}`)
          .join('\n')
      : '',
    gmailContext,
    '',
    '---',
    'Conversation so far:',
    ...(body.history ?? play.chat.map(({ role, content }) => ({ role, content })))
      .slice(-10)
      .map((m) => `${m.role === 'user' ? 'Craig' : 'You'}: ${m.content}`),
    '',
    `Craig: ${message}`,
  ]
    .filter(Boolean)
    .join('\n');

  const task =
    'Help Craig develop this play. You already know everything about Evari and who buys the 856, never ask him who our customer is or what our wedge is. Your job is strategy + research. If you need real companies, call find_business_listings. If you need fresh public info (competitors, news, market sizing, customer terminology), call web_search. Then fold what you find back into a concrete next-step answer. Reply in plain prose paragraphs, never markdown: no headings, no **bold**, no ## hashes, no bullet points, no numbered lists. The Spitball UI prints text raw, so any markdown shows as literal characters and looks broken. Keep replies punchy and decision-oriented. No em-dashes, ever; use commas or full stops.';

  const now = new Date().toISOString();
  const userMsg: PlayChatMessage = {
    id: 'c-' + Math.random().toString(36).slice(2, 10),
    role: 'user',
    content: message,
    at: now,
  };

  let markdown: string;
  let mock = false;
  const toolsUsed: string[] = [];

  if (!hasAIGatewayCredentials()) {
    mock = true;
    markdown =
      `**Offline — AI Gateway not wired.** I can see this play ("${play.title}", stage: ${play.stage}) and the ${play.research.length} research notes / ${play.targets.length} targets already in it. Once you run \`vercel link\` + \`vercel env pull\`, I\'ll reply here with real context.`;
  } else {
    try {
      const result = await runChatWithTools({ prompt, task, toolsUsed });
      markdown = result.text;
    } catch (err) {
      console.warn('[plays/chat] tool loop failed', err);
      mock = true;
      markdown = 'Something went wrong calling the AI Gateway. Check the logs or try again.';
    }
  }

  const assistantMsg: PlayChatMessage = {
    id: 'c-' + Math.random().toString(36).slice(2, 10),
    role: 'assistant',
    content: markdown,
    at: new Date().toISOString(),
  };

  const nextPlay: Play = {
    ...play,
    chat: [...play.chat, userMsg, assistantMsg],
    updatedAt: assistantMsg.at,
  };

  const { error: writeErr } = await supabase
    .from('dashboard_plays')
    .update({ payload: nextPlay })
    .eq('id', id);
  if (writeErr) {
    console.warn('[plays/chat] failed to persist chat exchange', writeErr);
  }

  return NextResponse.json({
    ok: true,
    mock,
    markdown,
    toolsUsed,
    userMessage: userMsg,
    assistantMessage: assistantMsg,
  });
}

// ---------------------------------------------------------------------------
// Tool loop
// ---------------------------------------------------------------------------

interface RunOpts {
  prompt: string;
  task: string;
  toolsUsed: string[];
}

async function runChatWithTools(opts: RunOpts): Promise<{ text: string }> {
  const system = await buildSystemPrompt({ voice: 'analyst', task: opts.task });

  const tools = {
    web_search: tool({
      description:
        'Search Google for real-world information about companies, markets, people, trends, or terminology. Use this when you need facts beyond your training data — e.g. current competitors, recent launches, industry sizing, customer language.',
      inputSchema: z.object({
        query: z.string().min(2).describe('Google search query'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('How many results to return (default 10)'),
      }),
      execute: async ({ query, limit }) => {
        if (!isDataForSeoConnected()) {
          return { error: 'DataForSEO is not configured — web_search unavailable.' };
        }
        opts.toolsUsed.push('web_search:' + query);
        const { hits, cost } = await webSearchQuery({ query, limit: limit ?? 10 });
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
      },
    }),
    find_business_listings: tool({
      description:
        'Find real businesses matching a keyword in a location. Returns title, domain, phone, address, category. Use this when Craig asks for candidate companies, or when the play needs a concrete prospect list (e.g. "luxury yacht brokerages in the UK", "private knee-surgery clinics in London", "premium concierge firms near Mayfair").',
      inputSchema: z.object({
        description: z
          .string()
          .min(2)
          .describe('Keyword-style description of what we\'re looking for'),
        locationName: z
          .string()
          .optional()
          .describe('Location string, e.g. "United Kingdom", "London, England, United Kingdom"'),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async ({ description, locationName, limit }) => {
        if (!isDataForSeoConnected()) {
          return { error: 'DataForSEO is not configured — find_business_listings unavailable.' };
        }
        opts.toolsUsed.push('find_business_listings:' + description);
        const { listings, cost } = await searchBusinessListings({
          description,
          locationName: locationName ?? 'United Kingdom',
          limit: limit ?? 20,
        });
        return {
          query: { description, locationName: locationName ?? 'United Kingdom' },
          costUsd: cost,
          listings: listings.slice(0, limit ?? 20).map((l) => ({
            title: l.title,
            url: l.url,
            domain: l.domain,
            phone: l.phone,
            address: l.address,
            category: l.category,
          })),
        };
      },
    }),
  };

  // Try gateway first; fall back to direct Anthropic on rate-limit / auth / 5xx.
  try {
    const { text } = await generateText({
      model: gateway(DEFAULT_MODEL),
      system,
      prompt: opts.prompt,
      tools,
      stopWhen: stepCountIs(5),
    });
    return { text };
  } catch (err) {
    if (!process.env.ANTHROPIC_API_KEY || !isRetryable(err)) throw err;
    const bareModel = DEFAULT_MODEL.replace(/^anthropic\//, '');
    const { text } = await generateText({
      model: anthropic(bareModel),
      system,
      prompt: opts.prompt,
      tools,
      stopWhen: stepCountIs(5),
    });
    return { text };
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
// Gmail context helper (unchanged)
// ---------------------------------------------------------------------------

async function safeGmailContext(): Promise<string> {
  try {
    const [support, klaviyoReply, outbound] = await Promise.all([
      listCachedGmailThreads({ category: 'support', limit: 8 }),
      listCachedGmailThreads({ category: 'klaviyo-reply', limit: 4 }),
      listCachedGmailThreads({ category: 'outbound', limit: 3 }),
    ]);
    const threads = [...support, ...klaviyoReply, ...outbound];
    if (threads.length === 0) return '';
    return (
      'Recent customer context (from Gmail, last 30 days):\n' +
      threads.map((t) => `- [${t.category}] ${formatGmailRow(t)}`).join('\n')
    );
  } catch {
    return '';
  }
}

function formatGmailRow(t: GmailThreadSummary): string {
  const when = t.lastMessageAt.slice(0, 10);
  const subject = t.subject.replace(/\s+/g, ' ').trim().slice(0, 120);
  const snippet = t.snippet.replace(/\s+/g, ' ').trim().slice(0, 160);
  return `${when} · "${subject}" — ${snippet}`;
}
