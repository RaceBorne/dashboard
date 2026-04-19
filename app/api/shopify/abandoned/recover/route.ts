import { NextResponse } from 'next/server';
import {
  sendAbandonedRecoveryEmail,
  ShopifyApiError,
} from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/shopify/abandoned/recover
 * Body: { checkoutId: string }
 *
 * Triggers the standard Shopify recovery email for an abandoned
 * checkout. Useful when the rep wants to nudge a hot lead manually.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.checkoutId) {
      return NextResponse.json(
        { error: 'checkoutId is required' },
        { status: 400 },
      );
    }
    const result = await sendAbandonedRecoveryEmail(body.checkoutId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: err instanceof ShopifyApiError ? err.status || 500 : 500 },
    );
  }
}
