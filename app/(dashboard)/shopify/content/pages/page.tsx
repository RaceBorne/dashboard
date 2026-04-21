import { TopBar } from '@/components/sidebar/TopBar';
import { PagesClient } from '@/components/shopify/PagesClient';
import {
  getStorefrontBaseUrl,
  isShopifyConnected,
  listShopifyPages,
} from '@/lib/integrations/shopify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PagesIndexPage() {
  const [pages, storefrontBaseUrl] = await Promise.all([
    listShopifyPages({ first: 100 }),
    getStorefrontBaseUrl(),
  ]);
  return (
    <>
      <TopBar title="Pages" subtitle={`${pages.length} pages`} />
      <div className="p-6">
        <PagesClient
          initial={pages}
          mock={!isShopifyConnected()}
          storefrontBaseUrl={storefrontBaseUrl}
        />
      </div>
    </>
  );
}
