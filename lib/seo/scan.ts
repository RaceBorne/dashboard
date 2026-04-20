/**
 * SEO Health scanner orchestrator.
 *
 * Walks every product, page and article in the connected Shopify store,
 * runs the per-entity checks, and returns a flat findings list plus a
 * 0–100 health score.
 *
 * Caching: result is held in module-level memory for fast reads on the
 * same instance. On Vercel/serverless, each invocation may be a
 * different instance — so we also persist the latest `ScanResult` to
 * Supabase (`dashboard_seo_health_scan`) when `SUPABASE_SERVICE_ROLE_KEY`
 * is set. `ensureScanHydrated()` loads that row into memory before
 * serving `/api/seo/*` or the SEO Health page so fixes and removals
 * survive refresh and cold starts.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
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
import { recordScanEvent } from './history';
import type {
  ScanEntityRef,
  ScanFinding,
  ScanResult,
  EntityType,
} from './types';

// ---------------------------------------------------------------------------
// In-memory cache + Supabase snapshot (single row)
// ---------------------------------------------------------------------------

const SCAN_SNAPSHOT_ID = 'default';

let cachedScan: ScanResult | null = null;

async function persistScanToStorage(scan: ScanResult): Promise<void> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.from('dashboard_seo_health_scan').upsert(
    {
      id: SCAN_SNAPSHOT_ID,
      payload: scan,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[seo/scan] Failed to persist scan snapshot:', error.message);
  }
}

async function loadScanFromStorage(): Promise<ScanResult | null> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('dashboard_seo_health_scan')
    .select('payload')
    .eq('id', SCAN_SNAPSHOT_ID)
    .maybeSingle();
  if (error || !data?.payload) return null;
  return data.payload as ScanResult;
}

/**
 * Load the last persisted scan from Supabase. Call before `getCachedScan()`
 * in API routes and server components.
 *
 * Default behaviour: only hits Supabase when the in-memory cache is empty.
 * Good for API routes, which mutate the cache themselves and so stay in
 * sync within their own module instance.
 *
 * Pass `{ force: true }` to always reload. The SEO Health page server
 * component needs this because the page module instance can hold a stale
 * `cachedScan` populated at an earlier render — Next.js dev keeps the
 * Node process warm, and HMR can split the page and API routes into
 * separate module instances, so the page's in-memory copy doesn't see
 * mutations made by `/api/seo/fix`. Forcing a reload on every page render
 * costs one Supabase round-trip and eliminates the refresh-shows-stale
 * bug.
 */
export async function ensureScanHydrated(
  opts: { force?: boolean } = {},
): Promise<void> {
  if (cachedScan && !opts.force) return;
  const loaded = await loadScanFromStorage();
  if (loaded) {
    cachedScan = loaded;
  }
}

export function getCachedScan(): ScanResult | null {
  return cachedScan;
}

export function setCachedScan(scan: ScanResult | null): void {
  cachedScan = scan;
  if (scan) {
    void persistScanToStorage(scan);
    // Append to history so the dashboard can chart score over time.
    // Fire-and-forget — history is additive, never load-bearing.
    void recordScanEvent(scan);
  }
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
  void persistScanToStorage(cachedScan);
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
  void persistScanToStorage(cachedScan);
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
  //
  // We use `allSettled` here instead of `all` so that a failure on one
  // entity type (most commonly articles, whose Admin-API schema has
  // changed a couple of times) doesn't nuke the whole scan — products
  // and pages should still be checkable.
  const [productsRes, pagesRes, articlesRes] = await Promise.allSettled([
    listProducts({ first: 100, maxPages: Math.ceil(max / 100) }),
    listShopifyPages({ first: 100, maxPages: Math.ceil(max / 100) }),
    listArticles({ first: 100, maxPages: Math.ceil(max / 100) }),
  ]);

  const products = productsRes.status === 'fulfilled' ? productsRes.value : [];
  const pages = pagesRes.status === 'fulfilled' ? pagesRes.value : [];
  const articles = articlesRes.status === 'fulfilled' ? articlesRes.value : [];

  const warnings: string[] = [];
  if (productsRes.status === 'rejected') {
    warnings.push(`Could not list products: ${errMsg(productsRes.reason)}`);
  }
  if (pagesRes.status === 'rejected') {
    warnings.push(`Could not list pages: ${errMsg(pagesRes.reason)}`);
  }
  if (articlesRes.status === 'rejected') {
    warnings.push(`Could not list articles: ${errMsg(articlesRes.reason)}`);
  }
  if (warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[seo/scan] Partial scan — some entity types failed:', warnings);
  }

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
    warnings: warnings.length > 0 ? warnings : undefined,
  };

  setCachedScan(result);
  return result;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Returns a cheap "is this scan stale?" hint for the UI. */
export function scanAgeMs(): number | null {
  if (!cachedScan) return null;
  return Date.now() - new Date(cachedScan.finishedAt).getTime();
}

export function shopifyConnected(): boolean {
  return isShopifyConnected();
}
