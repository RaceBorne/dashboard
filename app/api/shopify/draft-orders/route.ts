import { NextResponse } from 'next/server';
import {
  isShopifyConnected,
  listDraftOrders,
  createDraftOrder,
  ShopifyApiError,
} from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const drafts = await listDraftOrders();
    return NextResponse.json({
      mock: !isShopifyConnected(),
      count: drafts.length,
      draftOrders: drafts,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: err instanceof ShopifyApiError ? err.status || 500 : 500 },
    );
  }
}

/**
 * POST /api/shopify/draft-orders
 * Body: { email?, phone?, note?, tags?, lineItems: [{ variantId?, title?, quantity, originalUnitPrice? }] }
 * Creates a new draft order — this is the primary write path for the bike builder.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!Array.isArray(body?.lineItems) || body.lineItems.length === 0) {
      return NextResponse.json(
        { error: 'lineItems is required and must be non-empty' },
        { status: 400 },
      );
    }
    const draft = await createDraftOrder(body);
    return NextResponse.json({ ok: true, draftOrder: draft });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        userErrors: err instanceof ShopifyApiError ? err.userErrors : undefined,
      },
      { status: 500 },
    );
  }
}
