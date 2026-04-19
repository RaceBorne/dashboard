import { TopBar } from '@/components/sidebar/TopBar';
import { CustomersClient } from '@/components/shopify/CustomersClient';
import { isShopifyConnected, listCustomers } from '@/lib/integrations/shopify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CustomersPage() {
  const customers = await listCustomers({ first: 100, maxPages: 3 });
  return (
    <>
      <TopBar title="Customers" subtitle={`${customers.length} customers`} />
      <div className="p-6 max-w-[1400px]">
        <CustomersClient initial={customers} mock={!isShopifyConnected()} />
      </div>
    </>
  );
}
