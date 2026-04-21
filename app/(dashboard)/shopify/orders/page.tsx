import { TopBar } from '@/components/sidebar/TopBar';
import { OrdersClient } from '@/components/shopify/OrdersClient';
import { isShopifyConnected, listOrders } from '@/lib/integrations/shopify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OrdersPage() {
  const orders = await listOrders({ first: 100, maxPages: 3 });
  return (
    <>
      <TopBar title="Orders" subtitle={`${orders.length} orders`} />
      <div className="p-6">
        <OrdersClient initial={orders} mock={!isShopifyConnected()} />
      </div>
    </>
  );
}
