import { NextResponse } from 'next/server';
import {
  isShopifyConnected,
  listOrders,
  ShopifyApiError,
} from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/shopify/orders?query=financial_status:paid&first=50
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const first = Math.min(250, Number(url.searchParams.get('first') ?? '50'));
    const query = url.searchParams.get('query') ?? undefined;
    const orders = await listOrders({ first, query });
    return NextResponse.json({
      mock: !isShopifyConnected(),
      count: orders.length,
      orders,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: err instanceof ShopifyApiError ? err.status || 500 : 500 },
    );
  }
}
