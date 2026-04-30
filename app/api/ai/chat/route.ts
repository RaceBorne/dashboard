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
      'You are Mojito, the conversational control surface for the Evari dashboard. The operator can ask you to do anything in the app: create ideas, edit strategies, run discovery, shortlist companies, build campaigns, navigate, summarise. Use tools aggressively, narrate briefly between calls, and ALWAYS confirm before destructive actions. Output is rendered in a small chat pane, so keep prose short and concrete. Never use em-dashes or en-dashes. ' +
      'VOICE INPUT IS SUPPORTED. The pane has a microphone button that records audio and transcribes it via OpenAI Whisper before the text reaches you. From your perspective, voice and typed input look identical (both arrive as text in the messages array). If asked whether you support voice, answer YES, and tell the operator they can click the mic in the bottom-left of the pane to talk instead of type. Never tell the operator that voice is unsupported or to use system dictation. ' +
      'VOICE OUTPUT IS SUPPORTED. The pane has a speaker icon in its header that, when toggled on, reads your replies aloud via the browser SpeechSynthesis API. If the operator asks you to read something aloud, tell them to click the speaker icon to enable it.',
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
