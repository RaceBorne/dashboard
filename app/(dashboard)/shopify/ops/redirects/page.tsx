import { TopBar } from '@/components/sidebar/TopBar';
import { RedirectsClient } from '@/components/shopify/RedirectsClient';
import {
  isShopifyConnected,
  listRedirects,
} from '@/lib/integrations/shopify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RedirectsPage() {
  const redirects = await listRedirects({ first: 200, maxPages: 5 });
  return (
    <>
      <TopBar title="URL redirects" subtitle={`${redirects.length} active`} />
      <div className="p-6 max-w-[1400px]">
        <RedirectsClient
          initial={redirects}
          mock={!isShopifyConnected()}
        />
      </div>
    </>
  );
}
