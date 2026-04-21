import { TopBar } from '@/components/sidebar/TopBar';
import { AbandonedClient } from '@/components/shopify/AbandonedClient';
import {
  isShopifyConnected,
  listAbandonedCheckouts,
} from '@/lib/integrations/shopify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AbandonedPage() {
  const carts = await listAbandonedCheckouts({ first: 100, maxPages: 3 });
  const totalValue = carts.reduce((s, c) => s + c.totalPrice, 0);
  return (
    <>
      <TopBar
        title="Abandoned checkouts"
        subtitle={`${carts.length} carts · GBP ${totalValue.toFixed(0)} unrecovered`}
      />
      <div className="p-6">
        <AbandonedClient initial={carts} mock={!isShopifyConnected()} />
      </div>
    </>
  );
}
