import { NextResponse } from 'next/server';
import {
  isShopifyConnected,
  listRedirects,
  createRedirect,
  ShopifyApiError,
} from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const redirects = await listRedirects();
    return NextResponse.json({
      mock: !isShopifyConnected(),
      count: redirects.length,
      redirects,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: err instanceof ShopifyApiError ? err.status || 500 : 500 },
    );
  }
}

/**
 * POST /api/shopify/redirects
 * Body: { path: "/old-url", target: "/products/evari-tour" }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.path || !body?.target) {
      return NextResponse.json(
        { error: 'Both path and target are required' },
        { status: 400 },
      );
    }
    const redirect = await createRedirect(body.path, body.target);
    return NextResponse.json({ ok: true, redirect });
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
