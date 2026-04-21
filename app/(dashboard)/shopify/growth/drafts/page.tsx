import { TopBar } from '@/components/sidebar/TopBar';
import { DraftsClient } from '@/components/shopify/DraftsClient';
import {
  isShopifyConnected,
  listDraftOrders,
} from '@/lib/integrations/shopify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DraftsPage() {
  const drafts = await listDraftOrders({ first: 100, maxPages: 3 });
  return (
    <>
      <TopBar title="Draft orders" subtitle={`${drafts.length} drafts`} />
      <div className="p-6">
        <DraftsClient initial={drafts} mock={!isShopifyConnected()} />
      </div>
    </>
  );
}
