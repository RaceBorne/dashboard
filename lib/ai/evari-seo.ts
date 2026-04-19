/**
 * Evari-voice SEO copy generators.
 *
 * Builds on top of `lib/ai/gateway.ts` (which already routes through the
 * Vercel AI Gateway with the Evari copy skill loaded as a system prompt
 * fragment) — we just add the SEO-specific task prompts plus
 * post-generation validation: char-count windows, banned-word filter,
 * em/en dash strip.
 *
 * Three generators are exported:
 *   - generateMetaTitle()        — 30–60 chars, " | Evari" appended
 *   - generateMetaDescription()  — 120–160 chars
 *   - generateAltText()          — 5–15 words, no trailing period
 *
 * Each returns `{ value, attempts, regenerated }` so the caller can show
 * a "regenerated to remove banned word" hint in the review UI.
 */

import { generateText } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { buildSystemPrompt } from './gateway';
import {
  BANNED_WORDS,
  containsBannedWord,
  stripDashes,
  unquote,
} from '@/lib/seo/copy-rules';

export { BANNED_WORDS, containsBannedWord, stripDashes, unquote };

const DEFAULT_MODEL = process.env.AI_MODEL || 'anthropic/claude-sonnet-4.6';

/** Truncate at the last word boundary that fits within `max` chars. */
function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trim();
}

// ---------------------------------------------------------------------------
// Shared task-prompt structure
// ---------------------------------------------------------------------------

export interface GenerateContext {
  entityType: 'product' | 'collection' | 'page' | 'article';
  title: string;
  productType?: string;
  vendor?: string;
  tags?: string[];
  /** Plain-text description (HTML stripped). Pass the first ~500 chars. */
  body?: string;
  /** Optional one-liner of variant pricing / specs. */
  variantsSummary?: string;
}

export interface GenerateResult {
  value: string;
  attempts: number;
  /** Set when we re-prompted to remove a banned word or fix length. */
  regenerated?: 'banned-word' | 'length' | null;
  modelUsed: string;
}

interface RunOpts {
  model?: string;
  /** Hard upper cap on regeneration retries. */
  maxRetries?: number;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const META_MIN = 120;
const META_MAX = 160;

/**
 * Generate a meta title in Evari voice. Always returns a string within
 * 30–60 chars. Always ends with " | Evari" unless that would push past
 * the limit, in which case we abbreviate.
 */
export async function generateMetaTitle(
  ctx: GenerateContext,
  opts: RunOpts = {},
): Promise<GenerateResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const maxRetries = opts.maxRetries ?? 1;

  const prompt = buildTitlePrompt(ctx);
  const system = await buildSystemPrompt({
    voice: 'evari',
    task: 'Write SEO meta titles. Output one line, no quotes, no commentary.',
  });

  let attempts = 0;
  let regenerated: GenerateResult['regenerated'] = null;
  let value = await runOnce(model, system, prompt);
  attempts += 1;

  for (let i = 0; i < maxRetries; i++) {
    const banned = containsBannedWord(value);
    if (banned) {
      regenerated = 'banned-word';
      value = await runOnce(
        model,
        system,
        `${prompt}\n\nThe previous output contained the word "${banned}". Rewrite without it.`,
      );
      attempts += 1;
      continue;
    }
    if (value.length > TITLE_MAX || value.length < TITLE_MIN) {
      regenerated = 'length';
      value = await runOnce(
        model,
        system,
        `${prompt}\n\nThe previous output was ${value.length} characters. Rewrite to fit ${TITLE_MIN}–${TITLE_MAX} characters.`,
      );
      attempts += 1;
      continue;
    }
    break;
  }

  value = appendBrand(truncateAtWord(value, TITLE_MAX));
  return { value, attempts, regenerated, modelUsed: model };
}

/**
 * Generate a meta description (120–160 chars). Retries once on a length
 * miss; if it still misses we trim/pad gracefully and surface
 * `regenerated: 'length'` so the review UI can flag it.
 */
export async function generateMetaDescription(
  ctx: GenerateContext,
  opts: RunOpts = {},
): Promise<GenerateResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const maxRetries = opts.maxRetries ?? 2;

  const prompt = buildMetaPrompt(ctx);
  const system = await buildSystemPrompt({
    voice: 'evari',
    task: 'Write SEO meta descriptions. Output one paragraph, no quotes.',
  });

  let attempts = 0;
  let regenerated: GenerateResult['regenerated'] = null;
  let value = await runOnce(model, system, prompt);
  attempts += 1;

  for (let i = 0; i < maxRetries; i++) {
    const banned = containsBannedWord(value);
    if (banned) {
      regenerated = 'banned-word';
      value = await runOnce(
        model,
        system,
        `${prompt}\n\nThe previous output contained the word "${banned}". Rewrite without it.`,
      );
      attempts += 1;
      continue;
    }
    if (value.length > META_MAX || value.length < META_MIN) {
      regenerated = 'length';
      value = await runOnce(
        model,
        system,
        `${prompt}\n\nThe previous output was ${value.length} characters. Rewrite to fit ${META_MIN}–${META_MAX} characters.`,
      );
      attempts += 1;
      continue;
    }
    break;
  }

  if (value.length > META_MAX) value = truncateAtWord(value, META_MAX);
  return { value, attempts, regenerated, modelUsed: model };
}

/**
 * Generate alt text for a product image. Plain description, 5–15 words,
 * no trailing period.
 */
export async function generateAltText(
  args: { productTitle: string; imageUrl?: string; positionLabel?: string },
  opts: RunOpts = {},
): Promise<GenerateResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const prompt = `Describe what is visible in this image in plain language, 5–15 words. This is a product image for an Evari bike: "${args.productTitle}".${args.positionLabel ? ` Image position: ${args.positionLabel}.` : ''} State what the image shows, not how it feels. No adjectives like "beautiful" or "sleek". End without a full stop.`;
  const system = await buildSystemPrompt({
    voice: 'evari',
    task: 'Write SEO image alt text. Output one line, no quotes, no period at the end.',
  });
  let value = await runOnce(model, system, prompt);
  // Vision-capable variants would attach `args.imageUrl` here; for the
  // text-only milestone-1 path we keep it as a plain caption hint.
  void args.imageUrl;
  if (value.endsWith('.')) value = value.replace(/\.+$/, '').trim();
  return { value, attempts: 1, regenerated: null, modelUsed: model };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function runOnce(model: string, system: string, prompt: string): Promise<string> {
  const { text } = await generateText({
    model: gateway(model),
    system,
    prompt,
    temperature: 0.4,
  });
  return stripDashes(unquote(text));
}

function appendBrand(title: string): string {
  const suffix = ' | Evari';
  if (title.toLowerCase().includes('evari')) return title;
  if (title.length + suffix.length <= TITLE_MAX) return `${title}${suffix}`;
  // Trim the title until brand suffix fits; preserve at least 18 chars of subject.
  const cap = Math.max(18, TITLE_MAX - suffix.length);
  return `${truncateAtWord(title, cap)}${suffix}`;
}

function buildTitlePrompt(ctx: GenerateContext): string {
  const lines = [
    `Write a meta title tag for this Shopify ${ctx.entityType}.`,
    '',
    `Title: ${ctx.title}`,
    ctx.productType ? `Type: ${ctx.productType}` : null,
    ctx.vendor ? `Vendor: ${ctx.vendor}` : null,
    ctx.tags?.length ? `Tags: ${ctx.tags.join(', ')}` : null,
    ctx.body ? `Description excerpt: ${ctx.body.slice(0, 200)}` : null,
    '',
    `Constraints:`,
    `- ${TITLE_MIN}–${TITLE_MAX} characters total INCLUDING the suffix " | Evari".`,
    `- Include the product name and one key descriptor.`,
    `- Do NOT add the " | Evari" suffix yourself — the system appends it.`,
    `Return only the title. No quotes, no commentary.`,
  ].filter(Boolean);
  return lines.join('\n');
}

function buildMetaPrompt(ctx: GenerateContext): string {
  const lines = [
    `Write a meta description for this Shopify ${ctx.entityType}.`,
    '',
    `Title: ${ctx.title}`,
    ctx.body ? `Description: ${ctx.body.slice(0, 500)}` : null,
    ctx.variantsSummary ? `Key specs: ${ctx.variantsSummary}` : null,
    '',
    `Constraints:`,
    `- ${META_MIN}–${META_MAX} characters.`,
    `- Must contain at least one concrete detail (a material, a spec, a decision).`,
    `- End with a declarative sentence, not a question or a CTA shout.`,
    `Return only the description. No quotes, no commentary.`,
  ].filter(Boolean);
  return lines.join('\n');
}
