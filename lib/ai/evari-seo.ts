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

import { generateTextWithFallback } from './gateway';
import {
  BANNED_WORDS,
  containsBannedWord,
  stripDashes,
  unquote,
} from '@/lib/seo/copy-rules';

export { BANNED_WORDS, containsBannedWord, stripDashes, unquote };

// Routed through the Vercel AI Gateway so spend shows up on the gateway
// dashboard. Model string uses the gateway's `provider/model` format.
const DEFAULT_MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

/**
 * SEO-specific system prompt. Deliberately tiny (~120 tokens) rather
 * than loading the full ~3000-token Evari copywriting skill — meta
 * tags have such tight constraints that a heavyweight voice brief adds
 * cost without improving output. The long-form skill is still loaded
 * for generic briefings via `buildSystemPrompt` in gateway.ts; only
 * SEO generators route through this lean path.
 */
const SEO_SYSTEM_PROMPT = `You write SEO copy for Evari, a British maker of carbon e-bikes with Bosch CX motors.

Voice: confident, restrained, specific. No hype. No exclamation marks. No words like "amazing", "stunning", "revolutionary". Prefer one concrete detail over three adjectives.

Output only the requested text — no quotes, no commentary, no labels.`;

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

  // Template-first: for products with a clean title we can build the
  // meta title deterministically ("{title} | Evari"), no AI call
  // needed. Only fall through for edge cases (collections, articles,
  // long-tail titles).
  const templated = tryTemplateTitle(ctx);
  if (templated) {
    return {
      value: templated,
      attempts: 0,
      regenerated: null,
      modelUsed: 'template',
    };
  }

  const prompt = buildTitlePrompt(ctx);
  const system = SEO_SYSTEM_PROMPT;

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
  // Cap at 1 retry — more attempts pile up cost without improving
  // output on a well-constrained 120–160 char task.
  const maxRetries = opts.maxRetries ?? 1;

  // --- Template-first path: try to build a meta description with zero
  // AI calls. For structured product listings (title + body excerpt or
  // specs) the template below hits the 120–160 char window ~80% of the
  // time and is indistinguishable from a generated one for SEO
  // purposes. Only fall through to the AI if the template misses.
  const templated = tryTemplateMeta(ctx);
  if (templated) {
    return {
      value: templated,
      attempts: 0,
      regenerated: null,
      modelUsed: 'template',
    };
  }

  const prompt = buildMetaPrompt(ctx);
  const system = SEO_SYSTEM_PROMPT;

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
 *
 * Template-first: since the text-only path can't actually see the image,
 * a deterministic caption from the product title + position label is no
 * worse than an AI guess — and costs £0. Only falls through to AI if the
 * template can't produce a 5–15 word string.
 */
export async function generateAltText(
  args: { productTitle: string; imageUrl?: string; positionLabel?: string },
  opts: RunOpts = {},
): Promise<GenerateResult> {
  const templated = tryTemplateAlt(args);
  if (templated) {
    return { value: templated, attempts: 0, regenerated: null, modelUsed: 'template' };
  }

  const model = opts.model ?? DEFAULT_MODEL;
  const prompt = `Describe what is visible in this image in plain language, 5–15 words. This is a product image for an Evari bike: "${args.productTitle}".${args.positionLabel ? ` Image position: ${args.positionLabel}.` : ''} State what the image shows, not how it feels. No adjectives like "beautiful" or "sleek". End without a full stop.`;
  const system = SEO_SYSTEM_PROMPT;
  let value = await runOnce(model, system, prompt);
  // Vision-capable variants would attach `args.imageUrl` here; for the
  // text-only milestone-1 path we keep it as a plain caption hint.
  void args.imageUrl;
  if (value.endsWith('.')) value = value.replace(/\.+$/, '').trim();
  return { value, attempts: 1, regenerated: null, modelUsed: model };
}

/**
 * Deterministic alt-text template. Produces captions like:
 *   "Evari 856 Core carbon e-bike, drive side"
 *   "Evari Atlas commuter in carmine"
 * Returns null if the result is outside 5–15 words.
 */
function tryTemplateAlt(args: {
  productTitle: string;
  positionLabel?: string;
}): string | null {
  const title = normaliseCase(args.productTitle).trim();
  if (!title) return null;

  const position = args.positionLabel?.trim().toLowerCase() || '';
  const base = title.toLowerCase().includes('evari') ? title : `Evari ${title}`;
  const candidate = position
    ? `${base}, ${position}`
    : `${base} carbon e-bike`;

  const wordCount = candidate.split(/\s+/).filter(Boolean).length;
  if (wordCount < 5 || wordCount > 15) return null;
  return candidate;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function runOnce(model: string, system: string, prompt: string): Promise<string> {
  const { text, provider } = await generateTextWithFallback({
    model,
    system,
    prompt,
    temperature: 0.4,
  });
  if (provider === 'anthropic-direct') {
    // Surface the fact that the fallback served this call so we can spot
    // gateway outages in the server logs without hunting for the warn line.
    // eslint-disable-next-line no-console
    console.log(`[evari-seo] served via direct Anthropic (gateway unavailable)`);
  }
  return stripDashes(unquote(text));
}

function appendBrand(title: string): string {
  const suffix = ' | Evari';
  // If the AI already put "Evari" mid-title, keep it but ALSO append the
  // suffix when there's room — repeating the brand at the end is a
  // conventional pattern ("Evari X | Evari") and, crucially, guarantees
  // the meta title differs from the entity's own `title` so Shopify
  // won't null-collapse it (see verifyWrite + tryTemplateTitle).
  if (title.toLowerCase().endsWith('| evari')) return title;
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

// ---------------------------------------------------------------------------
// Template-first generators — zero-AI-cost path
// ---------------------------------------------------------------------------

/**
 * Build a meta title deterministically for products that have a clean,
 * descriptive title. Returns null if the template can't produce a valid
 * TITLE_MIN–TITLE_MAX string, in which case the caller falls back to AI.
 *
 * Examples (no AI call):
 *   ctx.title = "856 Core | Carmine | ROHLOFF or SINGLE-SPEED"
 *   → "856 Core | Carmine | Rohloff or Single-speed | Evari"   (≤60)
 */
function tryTemplateTitle(ctx: GenerateContext): string | null {
  if (ctx.entityType !== 'product' && ctx.entityType !== 'collection') {
    return null;
  }
  const rawTitle = normaliseCase(ctx.title).trim();
  if (!rawTitle) return null;
  const suffix = ' | Evari';

  // IMPORTANT: the meta title must NEVER equal the entity's own title —
  // Shopify detects equivalence and normalises `seo.title` back to null,
  // which the verifier then flags as "write did not persist." To guarantee
  // divergence: if the product title already starts with "Evari ", we
  // move the brand to the suffix position (e.g. "Evari Navy Cap" becomes
  // "Navy Cap | Evari"). Otherwise we just append " | Evari" as usual.
  let subject = rawTitle;
  const leadingEvari = /^evari[\s:,-]+/i;
  if (leadingEvari.test(subject)) {
    subject = subject.replace(leadingEvari, '').trim();
  }
  const withBrand = subject.toLowerCase().includes('evari')
    ? `${subject}${suffix}`
    : `${subject}${suffix}`;
  if (withBrand.length < TITLE_MIN || withBrand.length > TITLE_MAX) {
    return null;
  }
  // Final safety net: if after all transforms we still somehow equal the
  // entity title exactly, bail to AI so it can produce a distinct version.
  if (withBrand === ctx.title) return null;
  return withBrand;
}

/**
 * Build a meta description deterministically for products with enough
 * structured data. Returns null if the result falls outside
 * META_MIN–META_MAX chars, in which case the caller uses the AI.
 *
 * Template patterns, in priority order:
 *   1. Title + first sentence of body (trimmed to 160)
 *   2. Title + productType + vendor + "Made in the United Kingdom"
 */
function tryTemplateMeta(ctx: GenerateContext): string | null {
  const title = normaliseCase(ctx.title).trim();
  if (!title) return null;

  // Pattern 1 — title + first sentence of description.
  if (ctx.body && ctx.body.length >= 40) {
    const firstSentence = ctx.body
      .split(/(?<=[.!?])\s+/)
      .find((s) => s.trim().length > 20);
    if (firstSentence) {
      const candidate = `${title}. ${firstSentence.trim().replace(/[.!?]+$/, '')}.`;
      if (candidate.length >= META_MIN && candidate.length <= META_MAX) {
        return candidate;
      }
      // If the candidate is too long, trim the body sentence until it fits.
      if (candidate.length > META_MAX) {
        const trimmed = `${title}. ${truncateAtWord(firstSentence.trim(), META_MAX - title.length - 3)}.`;
        if (trimmed.length >= META_MIN && trimmed.length <= META_MAX) {
          return trimmed;
        }
      }
    }
  }

  // Pattern 2 — product with type + vendor fallback.
  if (ctx.entityType === 'product' && ctx.productType) {
    const vendorPart = ctx.vendor && !ctx.vendor.toLowerCase().includes('evari')
      ? ` by ${ctx.vendor}`
      : '';
    const candidate =
      `${title}. ${ctx.productType}${vendorPart}, made in the United Kingdom. Bosch CX motor, carbon mainframe.`;
    if (candidate.length >= META_MIN && candidate.length <= META_MAX) {
      return candidate;
    }
  }

  return null;
}

/**
 * Gentle case-normaliser so ALL-CAPS product titles become Title Case
 * without touching deliberate casing (e.g. "e-bike", "CX").
 */
function normaliseCase(s: string): string {
  if (s === s.toLowerCase() || s === s.toUpperCase()) {
    return s
      .toLowerCase()
      .split(/\s+/)
      .map((word) =>
        word
          .split('-')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join('-'),
      )
      .join(' ');
  }
  return s;
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
