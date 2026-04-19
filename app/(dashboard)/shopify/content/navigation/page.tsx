import { TopBar } from '@/components/sidebar/TopBar';
import { NavigationClient } from '@/components/shopify/NavigationClient';
import { isShopifyConnected, listMenus } from '@/lib/integrations/shopify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function NavigationPage() {
  const menus = await listMenus();
  return (
    <>
      <TopBar title="Navigation" subtitle={`${menus.length} menus`} />
      <div className="p-6 max-w-[1400px]">
        <NavigationClient menus={menus} mock={!isShopifyConnected()} />
      </div>
    </>
  );
}
