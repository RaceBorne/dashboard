import { NextResponse } from 'next/server';
import {
  isShopifyConnected,
  listDiscounts,
  createBasicDiscountCode,
  ShopifyApiError,
} from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const discounts = await listDiscounts();
    return NextResponse.json({
      mock: !isShopifyConnected(),
      count: discounts.length,
      discounts,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: err instanceof ShopifyApiError ? err.status || 500 : 500 },
    );
  }
}

/**
 * POST /api/shopify/discounts
 * Body: {
 *   title: string;
 *   code: string;
 *   percentage?: number;       // 0-1, e.g. 0.1 for 10%
 *   amount?: { amount: string; currencyCode: string };
 *   startsAt?: string;
 *   endsAt?: string;
 *   usageLimit?: number;
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.title || !body?.code) {
      return NextResponse.json(
        { error: 'title and code are required' },
        { status: 400 },
      );
    }
    if (body.percentage == null && body.amount == null) {
      return NextResponse.json(
        { error: 'Provide either percentage or amount' },
        { status: 400 },
      );
    }
    const discount = await createBasicDiscountCode(body);
    return NextResponse.json({ ok: true, discount });
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
