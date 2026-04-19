import { NextResponse } from 'next/server';
import {
  isShopifyConnected,
  listProducts,
  updateProduct,
  ShopifyApiError,
} from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/shopify/products?query=status:active&first=50
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const first = Math.min(250, Number(url.searchParams.get('first') ?? '50'));
    const query = url.searchParams.get('query') ?? undefined;
    const products = await listProducts({ first, query });
    return NextResponse.json({
      mock: !isShopifyConnected(),
      count: products.length,
      products,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: err instanceof ShopifyApiError ? err.status || 500 : 500 },
    );
  }
}

/**
 * PATCH /api/shopify/products
 * Body: { id, title?, descriptionHtml?, seoTitle?, seoDescription?, tags?, status? }
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body?.id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 },
      );
    }
    const product = await updateProduct(body);
    return NextResponse.json({ ok: true, product });
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
