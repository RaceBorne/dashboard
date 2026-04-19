import Link from 'next/link';
import { TopBar } from '@/components/sidebar/TopBar';
import {
  SeoHubClient,
  rowFromArticle,
  rowFromPage,
  rowFromProduct,
  type SeoHubRow,
} from '@/components/shopify/SeoHubClient';
import {
  getStorefrontBaseUrl,
  isShopifyConnected,
  listArticles,
  listProducts,
  listShopifyPages,
} from '@/lib/integrations/shopify';
import { Activity } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * /shopify/seo — the all-content SEO hub.
 *
 * Side-by-side view of every product/page/article SEO field, with the
 * shared drawer for inline edit + AI generate. SEO Health (the audit
 * engine with auto-fix) lives at /shopify/seo-health.
 */
export default async function SeoHubPage() {
  const [storefrontBaseUrl, products, pages, articles] = await Promise.all([
    getStorefrontBaseUrl(),
    listProducts({ first: 100, maxPages: 3 }),
    listShopifyPages({ first: 100, maxPages: 3 }),
    listArticles({ first: 100, maxPages: 3 }),
  ]);

  const rows: SeoHubRow[] = [
    ...products.map((p) => rowFromProduct(p, storefrontBaseUrl)),
    ...pages.map((p) => rowFromPage(p, storefrontBaseUrl)),
    ...articles.map((a) => rowFromArticle(a, storefrontBaseUrl)),
  ];

  return (
    <>
      <TopBar
        title="SEO"
        subtitle={`${rows.length} entities`}
        rightSlot={
          <Link
            href="/shopify/seo-health"
            className="inline-flex items-center gap-1.5 text-xs text-evari-gold hover:text-evari-gold/80"
          >
            <Activity className="h-3.5 w-3.5" />
            SEO Health
          </Link>
        }
      />
      <div className="p-6 max-w-[1500px]">
        <SeoHubClient initial={rows} mock={!isShopifyConnected()} />
      </div>
    </>
  );
}
