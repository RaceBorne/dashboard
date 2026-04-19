import { TopBar } from '@/components/sidebar/TopBar';
import { DiscountsClient } from '@/components/shopify/DiscountsClient';
import { isShopifyConnected, listDiscounts } from '@/lib/integrations/shopify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DiscountsPage() {
  const discounts = await listDiscounts({ first: 100 });
  return (
    <>
      <TopBar title="Discounts" subtitle={`${discounts.length} discounts`} />
      <div className="p-6 max-w-[1400px]">
        <DiscountsClient initial={discounts} mock={!isShopifyConnected()} />
      </div>
    </>
  );
}
