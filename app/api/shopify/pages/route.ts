import { NextResponse } from 'next/server';
import {
  isShopifyConnected,
  listShopifyPages,
  updatePageMetadata,
  ShopifyApiError,
} from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pages = await listShopifyPages();
    return NextResponse.json({
      mock: !isShopifyConnected(),
      count: pages.length,
      pages,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: err instanceof ShopifyApiError ? err.status || 500 : 500 },
    );
  }
}

/**
 * PATCH /api/shopify/pages
 * Body: { pageId, metaTitle?, metaDescription?, title?, bodyHtml? }
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body?.pageId) {
      return NextResponse.json(
        { error: 'Missing required field: pageId' },
        { status: 400 },
      );
    }
    const result = await updatePageMetadata(body);
    return NextResponse.json(result);
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
