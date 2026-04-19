/**
 * SEO Health scanner orchestrator.
 *
 * Walks every product, page and article in the connected Shopify store,
 * runs the per-entity checks, and returns a flat findings list plus a
 * 0–100 health score.
 *
 * Caching: result is held in module-level memory until the next scan.
 * The /api/seo/scan endpoint reads/writes via `getCachedScan` /
 * `setCachedScan`. This is "good enough" caching for a single-tenant
 * internal dashboard — production multi-tenant would back this with
 * Vercel KV or similar.
 */

import {
  getStorefrontBaseUrl,
  isShopifyConnected,
  listArticles,
  listProducts,
  listShopifyPages,
} from '@/lib/integrations/shopify';
import {
  checkArticle,
  checkPage,
  checkProduct,
  computeScore,
} from './checks';
import type {
  ScanEntityRef,
  ScanFinding,
  ScanResult,
  EntityType,
} from './types';

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let cachedScan: ScanResult | null = null;

export function getCachedScan(): ScanResult | null {
  return cachedScan;
}

export function setCachedScan(scan: ScanResult | null): void {
  cachedScan = scan;
}

/**
 * Update findings inside the cached scan after a fix. Removes findings
 * whose ids are in `removeIds` and recomputes the score.
 */
export function applyFixesToCache(removeIds: string[]): ScanResult | null {
  if (!cachedScan) return null;
  const remove = new Set(removeIds);
  const remaining = cachedScan.findings.filter((f) => !remove.has(f.id));
  const totalEntities =
    cachedScan.scanned.products + cachedScan.scanned.pages + cachedScan.scanned.articles;
  cachedScan = {
    ...cachedScan,
    findings: remaining,
    score: computeScore(remaining, totalEntities),
  };
  return cachedScan;
}

/**
 * Mutate a single finding in-place after fix or rollback. If `replace`
 * is null the finding is removed entirely.
 */
export function replaceFindingInCache(
  id: string,
  replace: ScanFinding | null,
): ScanResult | null {
  if (!cachedScan) return null;
  const findings = cachedScan.findings
    .map((f) => (f.id === id ? replace : f))
    .filter((f): f is ScanFinding => f != null);
  const totalEntities =
    cachedScan.scanned.products + cachedScan.scanned.pages + cachedScan.scanned.articles;
  cachedScan = {
    ...cachedScan,
    findings,
    score: computeScore(findings, totalEntities),
  };
  return cachedScan;
}

// ---------------------------------------------------------------------------
// Entity → ScanEntityRef
// ---------------------------------------------------------------------------

function makeRef(
  storeBase: string,
  type: EntityType,
  id: string,
  handle: string,
  title: string,
  storefrontPath: string,
): ScanEntityRef {
  const base = storeBase.replace(/\/+$/, '');
  const path = storefrontPath.startsWith('/') ? storefrontPath : `/${storefrontPath}`;
  return {
    type,
    id,
    handle,
    title,
    url: `${base}${path}`,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface RunScanOptions {
  /** Cap how many entities we walk per type. Default 1000 (all). */
  maxPerType?: number;
}

export async function runScan(opts: RunScanOptions = {}): Promise<ScanResult> {
  const startedAt = new Date();
  const max = opts.maxPerType ?? 1000;
  const storeBase = await getStorefrontBaseUrl();

  // Pull everything in parallel. Each list function already paginates
  // internally up to its `maxPages` cap.
  const [products, pages, articles] = await Promise.all([
    listProducts({ first: 100, maxPages: Math.ceil(max / 100) }),
    listShopifyPages({ first: 100, maxPages: Math.ceil(max / 100) }),
    listArticles({ first: 100, maxPages: Math.ceil(max / 100) }),
  ]);

  const findings: ScanFinding[] = [];

  for (const p of products) {
    const ref = makeRef(
      storeBase,
      'product',
      p.id,
      p.handle,
      p.title,
      `/products/${p.handle}`,
    );
    for (const partial of checkProduct(p)) {
      if (!partial.check) continue;
      findings.push({
        id: `product:${p.id}:${partial.check.id}`,
        entity: ref,
        check: partial.check,
        detail: partial.detail ?? '',
        context: partial.context,
      });
    }
  }

  for (const p of pages) {
    const ref = makeRef(storeBase, 'page', p.id, p.handle, p.title, `/pages/${p.handle}`);
    for (const partial of checkPage(p)) {
      if (!partial.check) continue;
      findings.push({
        id: `page:${p.id}:${partial.check.id}`,
        entity: ref,
        check: partial.check,
        detail: partial.detail ?? '',
        context: partial.context,
      });
    }
  }

  for (const a of articles) {
    const ref = makeRef(
      storeBase,
      'article',
      a.id,
      a.handle,
      a.title,
      `/blogs/${a.blog.handle}/${a.handle}`,
    );
    for (const partial of checkArticle(a)) {
      if (!partial.check) continue;
      findings.push({
        id: `article:${a.id}:${partial.check.id}`,
        entity: ref,
        check: partial.check,
        detail: partial.detail ?? '',
        context: partial.context,
      });
    }
  }

  const finishedAt = new Date();
  const totalEntities = products.length + pages.length + articles.length;
  const result: ScanResult = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    scanned: {
      products: products.length,
      pages: pages.length,
      articles: articles.length,
    },
    score: computeScore(findings, totalEntities),
    findings,
  };

  setCachedScan(result);
  return result;
}

/** Returns a cheap "is this scan stale?" hint for the UI. */
export function scanAgeMs(): number | null {
  if (!cachedScan) return null;
  return Date.now() - new Date(cachedScan.finishedAt).getTime();
}

export function shopifyConnected(): boolean {
  return isShopifyConnected();
}
