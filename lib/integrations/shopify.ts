/**
 * Shopify Admin API adapter — stub.
 *
 * When SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_ACCESS_TOKEN are set, this module
 * will switch from returning mock data to live Shopify Admin GraphQL queries.
 *
 * Required Shopify scopes:
 *   read_products, write_products
 *   read_content, write_content
 *   read_customers, read_orders
 *   read_draft_orders, read_checkouts
 */

import { MOCK_LEADS } from '@/lib/mock/leads';
import { MOCK_PAGES } from '@/lib/mock/seo';

export function isShopifyConnected(): boolean {
  return Boolean(
    process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  );
}

export async function listAbandonedCheckouts() {
  if (!isShopifyConnected()) {
    return MOCK_LEADS.filter((l) => l.source === 'shopify_abandoned').map((l) => ({
      id: l.id,
      email: l.email,
      totalPrice: l.estimatedValue ?? 0,
      lineItems: [{ title: l.productInterest ?? 'unknown' }],
      abandonedAt: l.firstSeenAt,
    }));
  }
  // TODO: real implementation
  // const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${process.env.SHOPIFY_API_VERSION ?? '2025-01'}/graphql.json`;
  // ...
  throw new Error('Shopify live mode not yet implemented');
}

export async function listShopifyPages() {
  if (!isShopifyConnected()) {
    return MOCK_PAGES.filter((p) => p.shopifyId);
  }
  throw new Error('Shopify live mode not yet implemented');
}

export async function updatePageMetadata(args: {
  pageId: string;
  metaTitle?: string;
  metaDescription?: string;
}) {
  if (!isShopifyConnected()) {
    return { ok: true, dryRun: true, ...args };
  }
  throw new Error('Shopify live mode not yet implemented');
}
