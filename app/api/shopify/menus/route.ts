import { NextResponse } from 'next/server';
import { isShopifyConnected, listMenus, ShopifyApiError } from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const menus = await listMenus();
    return NextResponse.json({
      mock: !isShopifyConnected(),
      count: menus.length,
      menus,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: err instanceof ShopifyApiError ? err.status || 500 : 500 },
    );
  }
}
