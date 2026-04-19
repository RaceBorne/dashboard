import { NextResponse } from 'next/server';
import { getShopifyStatus } from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/shopify/status
 *
 * Returns whether Shopify is connected and if so, basic shop info.
 * Used by the Wireframe page + Connections panel to show live status.
 */
export async function GET() {
  const status = await getShopifyStatus();
  return NextResponse.json(status);
}
