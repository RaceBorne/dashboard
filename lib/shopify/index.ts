/**
 * Shopify barrel module.
 *
 * Re-exports the existing GraphQL client + domain adapter so all Shopify
 * code can import from a single `@/lib/shopify` path. Adds the REST
 * helper (used for endpoints with no GraphQL equivalent — redirects bulk
 * import, theme assets) and a leaky-bucket-aware throttle wrapper for
 * tight loops like the SEO scanner.
 *
 * Anything that lives in `lib/integrations/shopify*.ts` is kept there so
 * legacy imports continue to work; this module is the new home for code
 * that builds on top of it.
 */

import {
  shopifyGraphql,
  shopifyApiVersion,
  isShopifyConnected,
  ShopifyApiError,
  type ShopifyCost,
  type ShopifyRequestResult,
} from '@/lib/integrations/shopify-client';

export * from '@/lib/integrations/shopify-client';
export * from '@/lib/integrations/shopify';

// ---------------------------------------------------------------------------
// REST helper
// ---------------------------------------------------------------------------

/**
 * Fetch against the Admin REST API. The dashboard prefers GraphQL for
 * everything Shopify supports, but a few admin features (theme asset
 * upload, redirects bulk import) only ship in REST. Returns the raw
 * Response so callers can branch on status / parse JSON themselves.
 */
export async function shopifyREST(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!isShopifyConnected()) {
    throw new ShopifyApiError(
      'Shopify not connected. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN.',
    );
  }
  const domain = process.env.SHOPIFY_STORE_DOMAIN!.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
  const url = `https://${domain}/admin/api/${shopifyApiVersion()}/${path.replace(/^\/+/, '')}`;
  return fetch(url, {
    ...init,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  });
}

// ---------------------------------------------------------------------------
// Soft throttle for chained GraphQL calls
// ---------------------------------------------------------------------------

/**
 * Shopify GraphQL uses a leaky-bucket cost system: every shop has a 1000
 * point bucket that refills at 50 points/sec on Basic Shopify, more on
 * higher plans. Each query response includes
 *   `extensions.cost.throttleStatus.currentlyAvailable`.
 * If we go below the safety threshold we sleep until the bucket has
 * recovered enough headroom for the next call. This keeps long scans
 * (SEO audit walking every product) from ever hitting a 429.
 */
export interface ThrottleOptions {
  /**
   * Sleep until the bucket has at least this many points left. Default 200
   * — enough to cover most product/order/customer reads on Basic Shopify.
   */
  minHeadroom?: number;
  /** Cap on how long we'll sleep in a single wait. Default 5000ms. */
  maxSleepMs?: number;
}

export async function awaitThrottle(
  cost: ShopifyCost | undefined,
  opts: ThrottleOptions = {},
): Promise<void> {
  if (!cost) return;
  const headroom = opts.minHeadroom ?? 200;
  const maxSleep = opts.maxSleepMs ?? 5000;
  const { currentlyAvailable, restoreRate } = cost.throttleStatus;
  if (currentlyAvailable >= headroom) return;
  const deficit = headroom - currentlyAvailable;
  const sleepSec = Math.min(deficit / Math.max(1, restoreRate), maxSleep / 1000);
  await new Promise((r) => setTimeout(r, Math.ceil(sleepSec * 1000)));
}

/**
 * Throttle-aware GraphQL wrapper. Drop-in replacement for
 * `shopifyGraphql` when running long sequential loops.
 *
 *   const { data } = await shopifyGraphqlThrottled<T>(query, vars);
 *
 * The wrapper sleeps after the call (not before) so the next call has
 * enough bucket headroom to run.
 */
export async function shopifyGraphqlThrottled<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  opts: ThrottleOptions & { signal?: AbortSignal } = {},
): Promise<ShopifyRequestResult<T>> {
  const result = await shopifyGraphql<T>(query, variables, { signal: opts.signal });
  await awaitThrottle(result.cost, opts);
  return result;
}
