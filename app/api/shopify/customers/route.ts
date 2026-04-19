import { NextResponse } from 'next/server';
import {
  isShopifyConnected,
  listCustomers,
  ShopifyApiError,
} from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/shopify/customers?query=email:@gmail.com&first=100
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const first = Math.min(250, Number(url.searchParams.get('first') ?? '100'));
    const query = url.searchParams.get('query') ?? undefined;
    const customers = await listCustomers({ first, query });
    return NextResponse.json({
      mock: !isShopifyConnected(),
      count: customers.length,
      customers,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: err instanceof ShopifyApiError ? err.status || 500 : 500 },
    );
  }
}
