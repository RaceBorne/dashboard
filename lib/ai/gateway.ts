/**
 * AI provider + system-prompt builder.
 *
 * Primary route: the Vercel AI Gateway (`@ai-sdk/gateway`) so all spend is
 * visible on the gateway dashboard and billing flows through Vercel.
 *
 * Fallback route: direct Anthropic (`@ai-sdk/anthropic`) when the gateway
 * rate-limits or errors on auth/credit. The fallback is used automatically
 * by `generateTextWithFallback()` — callers don't need to branch. Set
 * ANTHROPIC_API_KEY in .env.local to enable it; without the key the
 * original gateway error is rethrown.
 *
 * Why both: the gateway's free-credit pool occasionally rate-limits during
 * "abuse events" (Vercel's wording), which kills bulk SEO fixes mid-batch.
 * The direct Anthropic route has its own rate budget so it acts as a
 * pressure valve. Any request served by the fallback is logged so we can
 * see the split.
 */
import { generateText, streamText } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { anthropic } from '@ai-sdk/anthropic';
import { loadEvariCopySkill } from './skill';
import { getBrandBriefForPrompt } from '@/lib/brand/brandBrief';

// Default to Haiku 4.5 — cheap, fast, plenty smart for our copy tasks.
// Gateway model string uses the `provider/model` format; the direct SDK
// takes the bare model name, so the fallback strips the `anthropic/` prefix.
const DEFAULT_MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

/**
 * Returns true if we have a path to an LLM. Either the gateway (via OIDC
 * or a gateway key) OR direct Anthropic is sufficient — the wrapper will
 * try whichever is available.
 */
export function hasAIGatewayCredentials(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.AI_GATEWAY_API_KEY ||
      process.env.VERCEL_OIDC_TOKEN,
  );
}

interface SystemPromptOptions {
  voice?: 'evari' | 'analyst';
  task: string;
}

export async function buildSystemPrompt({ voice = 'evari', task }: SystemPromptOptions) {
  const sections: string[] = [];

  sections.push(
    `You are an assistant inside the Evari Dashboard, a private operations cockpit for the founder of Evari Speed Bikes (evari.cc). The audience for everything you produce is Craig, the founder.`,
  );

  // Brand grounding: every call gets the brief so the AI never asks Craig
  // to explain who Evari is, what the product is, or who the customer is.
  const brandBrief = await getBrandBriefForPrompt();
  sections.push(brandBrief);

  sections.push(`Today's task: ${task}`);

  if (voice === 'evari') {
    const skill = await loadEvariCopySkill();
    sections.push('---');
    sections.push('# Evari Copy Voice — load before writing customer-facing or marketing prose.');
    sections.push(skill);
  } else {
    sections.push(
      'Tone: an analyst briefing the founder. Specific, calm, honest. No hype. No padding. Numbers cited. Lead with the answer.',
    );
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Gateway-with-fallback wrapper
// ---------------------------------------------------------------------------

export interface GenerateWithFallbackOpts {
  model: string;
  system: string;
  prompt: string;
  temperature?: number;
}

export interface GenerateWithFallbackResult {
  text: string;
  /** Which provider actually served this call. Use for observability. */
  provider: 'gateway' | 'anthropic-direct';
}

/**
 * Try the gateway first. On a rate-limit / credit error (and when
 * ANTHROPIC_API_KEY is configured), silently retry against direct
 * Anthropic. Any other gateway error is rethrown — we only fall back
 * for errors a second attempt on a different backend can actually fix.
 */
export async function generateTextWithFallback(
  opts: GenerateWithFallbackOpts,
): Promise<GenerateWithFallbackResult> {
  try {
    const { text } = await generateText({
      model: gateway(opts.model),
      system: opts.system,
      prompt: opts.prompt,
      temperature: opts.temperature,
    });
    return { text, provider: 'gateway' };
  } catch (err) {
    if (!process.env.ANTHROPIC_API_KEY) {
      // No fallback configured — caller gets the original gateway error.
      throw err;
    }
    if (!isFallbackWorthy(err)) {
      throw err;
    }
    // Strip the "anthropic/" prefix — the direct SDK takes the bare model
    // name (`claude-haiku-4-5`), whereas the gateway wants the namespaced
    // form (`anthropic/claude-haiku-4-5`).
    const bareModel = opts.model.replace(/^anthropic\//, '');
    const reason = err instanceof Error ? err.message.slice(0, 120) : String(err);
    // eslint-disable-next-line no-console
    console.warn(
      `[ai] gateway failed — falling back to direct Anthropic. reason="${reason}"`,
    );
    const { text } = await generateText({
      model: anthropic(bareModel),
      system: opts.system,
      prompt: opts.prompt,
      temperature: opts.temperature,
    });
    return { text, provider: 'anthropic-direct' };
  }
}

/**
 * True for errors where retrying against a different backend might
 * actually succeed — rate limits, auth failures, credit exhaustion,
 * transient 5xx. False for prompt-shaped errors (invalid request,
 * content policy) where retrying won't help.
 */
function isFallbackWorthy(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'GatewayRateLimitError') return true;
  if (err.name === 'GatewayAuthenticationError') return true;
  if (err.name === 'GatewayInternalServerError') return true;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('rate limit') ||
    msg.includes('free credits') ||
    msg.includes('not enough credit') ||
    msg.includes('insufficient credit') ||
    msg.includes('429') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504')
  );
}

// ---------------------------------------------------------------------------
// Public briefing helpers (kept stable for existing callers)
// ---------------------------------------------------------------------------

interface GenerateOpts {
  task: string;
  prompt: string;
  voice?: 'evari' | 'analyst';
  model?: string;
}

export async function generateBriefing(opts: GenerateOpts) {
  const system = await buildSystemPrompt({ voice: opts.voice ?? 'analyst', task: opts.task });
  const { text } = await generateTextWithFallback({
    model: opts.model || DEFAULT_MODEL,
    system,
    prompt: opts.prompt,
  });
  return text;
}

/**
 * Streaming path stays gateway-only for now — mid-stream fallback would
 * need to restart the stream from scratch and re-emit already-rendered
 * tokens, which breaks the UI's token-at-a-time display. Briefings are
 * low-volume (not bulk), so rate limits bite less here than on the SEO
 * fix path.
 */
export function streamBriefing(opts: GenerateOpts) {
  return (async () => {
    const system = await buildSystemPrompt({ voice: opts.voice ?? 'analyst', task: opts.task });
    return streamText({
      model: gateway(opts.model || DEFAULT_MODEL),
      system,
      prompt: opts.prompt,
    });
  })();
}
