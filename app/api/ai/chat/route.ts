/**
 * POST /api/ai/chat
 *
 * Streaming Mojito chat endpoint. The single brain behind the AI
 * Assistant pane. Streams tool-call events and text deltas back to the
 * client using the Vercel AI SDK's UI-message stream protocol so the
 * pane can render tool pills and the assistant's reply token-by-token.
 *
 * Body shape:
 * {
 *   messages: [{ role, content }, ...],   // full conversation, last entry is the new user turn
 *   pane: {
 *     route: '/plays/abc/strategy',
 *     routePlayId: 'abc' | null,
 *     surface: 'plays' | 'campaigns' | ...,
 *     surfaceContext?: { ... },           // free-form notes from useAISurface
 *   }
 * }
 */
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { anthropic } from '@ai-sdk/anthropic';

import { buildSystemPrompt, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { buildTools, type PaneContext } from '@/lib/ai/tools/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = process.env.AI_ASSISTANT_MODEL || 'anthropic/claude-sonnet-4-5';

/** Strip a /plays/{id}/... pathname to its play id, or null. */
function inferPlayIdFromRoute(route: string): string | null {
  const m = /^\/plays\/(play-[a-z0-9-]+)/i.exec(route ?? '');
  return m ? m[1] : null;
}

interface Body {
  messages: UIMessage[];
  pane: {
    route?: string;
    routePlayId?: string | null;
    surface?: string;
    surfaceContext?: Record<string, unknown> | null;
    contextName?: string | null;
  };
}

export async function POST(req: Request) {
  if (!hasAIGatewayCredentials()) {
    return new Response(
      JSON.stringify({ ok: false, error: 'AI not configured' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !Array.isArray(body.messages)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'messages[] required' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const route = (body.pane?.route ?? '').trim();
  const pane: PaneContext = {
    route,
    routePlayId: body.pane?.routePlayId ?? inferPlayIdFromRoute(route),
    surface: body.pane?.surface ?? 'home',
    surfaceContext: body.pane?.surfaceContext ?? null,
    contextName: body.pane?.contextName ?? null,
  };

  const tools = buildTools(pane);

  const baseSystem = await buildSystemPrompt({
    voice: 'analyst',
    task:
      'You are Mojito, the operator\'s conversational copilot inside the Evari dashboard. The operator is Craig, who goes by Mad Dog. Talk to him like a smart, warm colleague, not a briefing officer. ' +
      '\n\n' +
      'TONE FIRST. Default voice is HUMAN and CONVERSATIONAL. Short sentences. Contractions. Use his name (Mad Dog) sparingly and naturally, the way a friend would, not at the start of every reply. Never start a reply with a status report or a bulleted list. If he greets you, greet him back the way a person would, then ask what he wants to do. Match his energy: when he is casual, you are casual; when he is asking for hard data or a brief, you can drop into analyst mode. ' +
      '\n\n' +
      'BREVITY. Output is being read aloud as well as displayed. Keep replies SHORT, usually one to three sentences. Never dump a long status report unless he asks for one. If you have something long to say, lead with the headline and stop, let him pull the thread. Lists, headers, em-dashes, en-dashes, and emoji are all banned. ' +
      '\n\n' +
      'TOOLS ARE INVISIBLE. Use the tool registry whenever it helps you do real work, but DO NOT narrate tool plumbing back to the operator. Never say "I called listIdeas", just say what you found in plain English. After a tool call returns, summarise the answer in one sentence. When he asks for an action, do it, then confirm in one line. ' +
      '\n\n' +
      'CONFIRMATIONS. Reversible operations: just do them. Destructive operations (deleteIdea, deleteCampaign, sendCampaign, sendReply): one short confirmation question, no lecture. ' +
      '\n\n' +
      'VOICE I/O. Voice input and voice output both work in this pane. Mic button records a single utterance, headphones button is hands-free live mode, speaker icon in the header toggles spoken replies. If asked, just say yes and point at the right icon. Never tell the operator that voice is unsupported.',
  });

  // Page awareness block: remind the model where the user is right
  // now, what surface, and what id we already have. Keeps it from
  // calling getCurrentPage() on every turn for trivial questions.
  const pageBlock = [
    '# Current page',
    'Route: ' + (pane.route || '(unknown)'),
    'Surface: ' + pane.surface,
    pane.routePlayId ? 'Inferred play id: ' + pane.routePlayId : 'No play id inferred from route.',
    pane.surfaceContext && Object.keys(pane.surfaceContext).length > 0
      ? 'Surface context: ' + JSON.stringify(pane.surfaceContext).slice(0, 1500)
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const system = baseSystem + '\n\n' + pageBlock + '\n\n' +
    'When the user uses pronouns like "this", "that", or "the X", assume they mean whatever is on the current page unless they say otherwise. Resolve play / campaign ids from the inferred values above before falling back to listIdeas / findCampaign.';

  // streamText returns a streaming result. Try gateway, fall back to
  // direct Anthropic on rate-limit / credit errors. Mid-stream fallback
  // is not supported, so we only fall back if the gateway throws BEFORE
  // any tokens are produced.
  let result;
  try {
    result = streamText({
      model: gateway(MODEL),
      system,
      messages: convertToModelMessages(body.messages),
      tools,
      stopWhen: stepCountIs(20),
    });
  } catch (e) {
    if (!process.env.ANTHROPIC_API_KEY || !isRetryable(e)) throw e;
    const bare = MODEL.replace(/^anthropic\//, '');
    result = streamText({
      model: anthropic(bare),
      system,
      messages: convertToModelMessages(body.messages),
      tools,
      stopWhen: stepCountIs(20),
    });
  }

  return result.toUIMessageStreamResponse();
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'GatewayRateLimitError') return true;
  if (err.name === 'GatewayAuthenticationError') return true;
  if (err.name === 'GatewayInternalServerError') return true;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('rate limit') ||
    msg.includes('free credits') ||
    msg.includes('not enough credit') ||
    msg.includes('429') ||
    msg.includes('502') ||
    msg.includes('503')
  );
}
