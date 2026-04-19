import { NextResponse } from 'next/server';
import {
  isShopifyConnected,
  listAbandonedCheckouts,
  ShopifyApiError,
} from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/shopify/abandoned?first=50
 * Returns abandoned checkouts — surfaced as Leads inside the dashboard.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const first = Math.min(250, Number(url.searchParams.get('first') ?? '50'));
    const checkouts = await listAbandonedCheckouts({ first });
    return NextResponse.json({
      mock: !isShopifyConnected(),
      count: checkouts.length,
      checkouts,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: err instanceof ShopifyApiError ? err.status || 500 : 500 },
    );
  }
}
