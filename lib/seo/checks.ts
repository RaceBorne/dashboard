/**
 * SEO Health checks.
 *
 * Each check is a pure function that takes a typed entity and returns
 * either `null` (passed) or a `Partial<ScanFinding>` (failed). The
 * scanner is responsible for stitching the entity ref + check metadata
 * onto the result.
 *
 * Check IDs are stable strings — they appear in the URL of the SEO
 * Health detail panel and in the undo log, so renaming them is a
 * breaking change.
 *
 * Severity weights (used to compute the 0–100 score):
 *   A = critical (-10 each, capped at -50 per category)
 *   B = warn     (-3 each, capped at -25)
 *   C = nice-to-have (-1 each, capped at -10)
 *
 * Fix modes:
 *   safe-auto — no human review needed (alt text, handle case)
 *   review    — AI suggestion shown, user approves before write
 *   manual    — needs user attention; we just flag it
 */

import { containsBannedWord } from '@/lib/seo/copy-rules';
import type {
  CheckMeta,
  ScanFinding,
  EntityType,
} from './types';
import type {
  ShopifyProduct,
  ShopifyPage,
  ShopifyArticle,
} from '@/lib/integrations/shopify';

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const META_MIN = 120;
const META_MAX = 160;
const HANDLE_MAX = 50;

export const SEVERITY_WEIGHT: Record<CheckMeta['severity'], number> = {
  A: 10,
  B: 3,
  C: 1,
};

/**
 * Catalogue of every check the scanner can run.
 *
 * Indexed by check id so the fix engine can look up `meta` after a
 * scan without re-deriving it.
 */
export const CHECKS: Record<string, CheckMeta> = {
  'title-missing': {
    id: 'title-missing',
    title: 'Meta title missing',
    description: 'No SEO title set. Search engines will fall back to the default page title.',
    severity: 'A',
    fix: 'review',
  },
  'title-length': {
    id: 'title-length',
    title: 'Title length out of range',
    description: 'Meta title should be 30–60 characters so it renders fully in Google.',
    severity: 'B',
    fix: 'review',
  },
  'title-banned': {
    id: 'title-banned',
    title: 'Title contains banned word',
    description: 'Brand voice rules forbid certain marketing clichés in customer-facing copy.',
    severity: 'B',
    fix: 'review',
  },
  'title-no-brand': {
    id: 'title-no-brand',
    title: 'Title missing brand suffix',
    description: 'Titles should end in “| Evari” to consistently brand SERP results.',
    severity: 'C',
    fix: 'safe-auto',
  },
  'meta-missing': {
    id: 'meta-missing',
    title: 'Meta description missing',
    description: 'Without one, Google picks an arbitrary snippet from the page.',
    severity: 'A',
    fix: 'review',
  },
  'meta-length': {
    id: 'meta-length',
    title: 'Meta description out of range',
    description: 'Aim for 120–160 characters — under-fills feel thin, over-fills get truncated.',
    severity: 'B',
    fix: 'review',
  },
  'meta-banned': {
    id: 'meta-banned',
    title: 'Meta contains banned word',
    description: 'Brand voice rules forbid certain marketing clichés.',
    severity: 'B',
    fix: 'review',
  },
  'alt-missing': {
    id: 'alt-missing',
    title: 'Image missing alt text',
    description: 'Every product image should describe what is in it for accessibility + SEO.',
    severity: 'A',
    fix: 'safe-auto',
  },
  'handle-uppercase': {
    id: 'handle-uppercase',
    title: 'Handle has uppercase characters',
    description: 'URL handles should be lowercase to avoid duplicate-content issues.',
    severity: 'B',
    fix: 'safe-auto',
  },
  'handle-too-long': {
    id: 'handle-too-long',
    title: 'Handle is overly long',
    description: 'Long handles make for ugly URLs and dilute keyword weight.',
    severity: 'C',
    fix: 'safe-auto',
  },
  'handle-stopwords': {
    id: 'handle-stopwords',
    title: 'Handle contains stop words',
    description: '"and", "the", "of" etc. add noise to URLs without SEO value.',
    severity: 'C',
    fix: 'safe-auto',
  },
};

const STOPWORDS = new Set([
  'and', 'the', 'of', 'a', 'an', 'to', 'for', 'in', 'on', 'with', 'or',
]);

// ---------------------------------------------------------------------------
// Generic SEO checks (work on anything with title + seo + handle)
// ---------------------------------------------------------------------------

interface Seoable {
  id: string;
  handle: string;
  title: string;
  seo: { title: string | null; description: string | null };
}

function checkTitle(e: Seoable): Array<Partial<ScanFinding>> {
  const out: Array<Partial<ScanFinding>> = [];
  const t = e.seo.title;
  if (!t || t.trim().length === 0) {
    out.push({ check: CHECKS['title-missing'], detail: 'No meta title set.' });
    // Skip the other title checks if missing — they'd be noisy.
    return out;
  }
  const len = t.length;
  if (len < TITLE_MIN || len > TITLE_MAX) {
    out.push({
      check: CHECKS['title-length'],
      detail: `Title is ${len} characters (want ${TITLE_MIN}–${TITLE_MAX}).`,
      context: { current: t, length: len },
    });
  }
  const banned = containsBannedWord(t);
  if (banned) {
    out.push({
      check: CHECKS['title-banned'],
      detail: `Contains banned word: "${banned}".`,
      context: { current: t, banned },
    });
  }
  if (!/\|\s*evari\s*$/i.test(t)) {
    out.push({
      check: CHECKS['title-no-brand'],
      detail: 'Title doesn\'t end in “| Evari”.',
      context: { current: t },
    });
  }
  return out;
}

function checkMeta(e: Seoable): Array<Partial<ScanFinding>> {
  const out: Array<Partial<ScanFinding>> = [];
  const m = e.seo.description;
  if (!m || m.trim().length === 0) {
    out.push({ check: CHECKS['meta-missing'], detail: 'No meta description set.' });
    return out;
  }
  const len = m.length;
  if (len < META_MIN || len > META_MAX) {
    out.push({
      check: CHECKS['meta-length'],
      detail: `Description is ${len} characters (want ${META_MIN}–${META_MAX}).`,
      context: { current: m, length: len },
    });
  }
  const banned = containsBannedWord(m);
  if (banned) {
    out.push({
      check: CHECKS['meta-banned'],
      detail: `Contains banned word: "${banned}".`,
      context: { current: m, banned },
    });
  }
  return out;
}

function checkHandle(e: Seoable): Array<Partial<ScanFinding>> {
  const out: Array<Partial<ScanFinding>> = [];
  const h = e.handle;
  if (!h) return out;
  if (h !== h.toLowerCase()) {
    out.push({
      check: CHECKS['handle-uppercase'],
      detail: `Handle "${h}" contains uppercase letters.`,
      context: { current: h, suggested: h.toLowerCase() },
    });
  }
  if (h.length > HANDLE_MAX) {
    out.push({
      check: CHECKS['handle-too-long'],
      detail: `Handle is ${h.length} characters (want ≤ ${HANDLE_MAX}).`,
      context: { current: h, length: h.length },
    });
  }
  const parts = h.split('-');
  const stop = parts.filter((p) => STOPWORDS.has(p));
  if (stop.length > 0) {
    const cleaned = parts.filter((p) => !STOPWORDS.has(p)).join('-');
    out.push({
      check: CHECKS['handle-stopwords'],
      detail: `Handle contains stop words: ${stop.join(', ')}.`,
      context: { current: h, suggested: cleaned, stopwords: stop },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-entity check sets
// ---------------------------------------------------------------------------

export function checkProduct(p: ShopifyProduct): Array<Partial<ScanFinding>> {
  const out: Array<Partial<ScanFinding>> = [
    ...checkTitle(p),
    ...checkMeta(p),
    ...checkHandle(p),
  ];
  if (p.featuredImage && (p.featuredImage.altText ?? '').trim().length === 0) {
    out.push({
      check: CHECKS['alt-missing'],
      detail: 'Featured image has no alt text.',
      context: { imageUrl: p.featuredImage.url },
    });
  }
  return out;
}

export function checkPage(p: ShopifyPage): Array<Partial<ScanFinding>> {
  return [...checkTitle(p), ...checkMeta(p), ...checkHandle(p)];
}

export function checkArticle(a: ShopifyArticle): Array<Partial<ScanFinding>> {
  const out: Array<Partial<ScanFinding>> = [
    ...checkTitle(a),
    ...checkMeta(a),
    ...checkHandle(a),
  ];
  if (a.image && (a.image.altText ?? '').trim().length === 0) {
    out.push({
      check: CHECKS['alt-missing'],
      detail: 'Featured image has no alt text.',
      context: { imageUrl: a.image.url },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Score + grouping helpers
// ---------------------------------------------------------------------------

/**
 * Compute a 0–100 score for a set of findings. Each severity bucket
 * contributes a capped negative — one missing-title in a 100-product
 * catalogue shouldn't tank the score, but 50 missing titles certainly
 * should.
 */
export function computeScore(
  findings: ScanFinding[],
  entityCount: number,
): number {
  if (entityCount === 0) return 100;
  const buckets: Record<string, number> = { A: 0, B: 0, C: 0 };
  for (const f of findings) {
    buckets[f.check.severity] += 1;
  }
  // Penalty per check, normalised to per-entity rate.
  const aPenalty = Math.min(50, (buckets.A / entityCount) * 100);
  const bPenalty = Math.min(25, (buckets.B / entityCount) * 30);
  const cPenalty = Math.min(10, (buckets.C / entityCount) * 15);
  return Math.max(0, Math.round(100 - aPenalty - bPenalty - cPenalty));
}

export function findingByCheck(findings: ScanFinding[]): Map<string, ScanFinding[]> {
  const out = new Map<string, ScanFinding[]>();
  for (const f of findings) {
    const arr = out.get(f.check.id) ?? [];
    arr.push(f);
    out.set(f.check.id, arr);
  }
  return out;
}

export function entityTypeLabel(t: EntityType): string {
  switch (t) {
    case 'product': return 'Product';
    case 'page': return 'Page';
    case 'article': return 'Article';
  }
}
