import { ShopifySubNav } from '@/components/shopify/ShopifySubNav';

/**
 * Wraps every /shopify/* route with the Shopify sub-navigation strip.
 * Sits inside the dashboard layout (which already provides the global
 * sidebar), so this layout only adds the second-level nav.
 */
export default function ShopifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <ShopifySubNav />
      {children}
    </div>
  );
}
