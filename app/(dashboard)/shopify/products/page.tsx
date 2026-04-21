import { TopBar } from '@/components/sidebar/TopBar';
import { ProductsClient } from '@/components/shopify/ProductsClient';
import {
  getStorefrontBaseUrl,
  isShopifyConnected,
  listProducts,
} from '@/lib/integrations/shopify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProductsPage() {
  const [products, storefrontBaseUrl] = await Promise.all([
    listProducts({ first: 100, maxPages: 3 }),
    getStorefrontBaseUrl(),
  ]);
  return (
    <>
      <TopBar title="Products" subtitle={`${products.length} products`} />
      <div className="p-6">
        <ProductsClient
          initial={products}
          mock={!isShopifyConnected()}
          storefrontBaseUrl={storefrontBaseUrl}
        />
      </div>
    </>
  );
}
