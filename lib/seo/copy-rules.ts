/**
 * Pure copy rules for Evari SEO (no AI, no Node-only modules).
 * Used by `lib/seo/checks.ts` and client components — keep this file
 * importable from the browser bundle.
 *
 * Words/phrases matched case-insensitively with word boundaries.
 * Source: section 7 of the Shopify build spec.
 */

export const BANNED_WORDS: readonly string[] = [
  'revolutionary',
  'game-changing',
  'game changing',
  'unleash',
  'conquer',
  'world-class',
  'world class',
  'industry-leading',
  'industry leading',
  'perfect for',
  'designed to offer',
  'aims to deliver',
  // "premium" as a noun is OK — only bad adjective constructions:
  'premium quality',
  'premium experience',
];

const BANNED_REGEX = new RegExp(
  `\\b(?:${BANNED_WORDS.map((w) => w.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})\\b`,
  'i',
);

/** True if the candidate copy contains any banned word/phrase. */
export function containsBannedWord(text: string): string | null {
  const m = text.match(BANNED_REGEX);
  return m ? m[0] : null;
}

/** Strip em / en / horizontal-bar dashes — the model occasionally slips. */
export function stripDashes(text: string): string {
  return text
    .replace(/[\u2013\u2014\u2015]/g, '. ')
    .replace(/\s+\.\s+/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Trim trailing whitespace + quotes the model sometimes wraps output in. */
export function unquote(text: string): string {
  return text.trim().replace(/^["']+|["']+$/g, '').trim();
}
