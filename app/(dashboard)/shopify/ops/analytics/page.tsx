import { TopBar } from '@/components/sidebar/TopBar';
import { AnalyticsClient } from '@/components/shopify/AnalyticsClient';
import {
  isShopifyConnected,
  listSalesByDay,
} from '@/lib/integrations/shopify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AnalyticsPage() {
  const connected = isShopifyConnected();
  let sales: Awaited<ReturnType<typeof listSalesByDay>> = [];
  let fetchError: string | null = null;

  try {
    sales = await listSalesByDay({ days: 30 });
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <TopBar title="Analytics" subtitle="Last 30 days" />
      <div className="p-6 max-w-[1400px]">
        <AnalyticsClient
          initial={sales}
          mock={!connected}
          fetchError={connected ? fetchError : null}
        />
      </div>
    </>
  );
}
