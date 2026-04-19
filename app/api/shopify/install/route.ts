import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/shopify/install?shop=<store>.myshopify.com
 *
 * Initiates the Shopify OAuth handshake. Redirects the merchant's browser
 * to Shopify's consent screen with our client_id, requested scopes and
 * the localhost callback URL. Shopify then bounces back to
 * /api/shopify/callback with `code`, `shop`, `hmac` and `state`, where
 * the existing callback route exchanges the code for an offline access
 * token and writes it to .env.local.
 *
 * Why this route exists:
 *   The Shopify Dev Dashboard's "Install app" button redirects to the
 *   app's `app_url` (currently https://evari.cc — the marketing site),
 *   which has no OAuth initiator. Visiting this route directly bypasses
 *   that and runs the install flow against localhost as we want for dev.
 *
 * Scopes are hardcoded to match what `lib/integrations/shopify.ts`
 * actually uses today. If you add a new Shopify feature that needs an
 * additional scope, add it both here and in the Dev Dashboard's
 * Configuration page, then re-run the install.
 */

const SHOPIFY_SCOPES = [
  'read_products',
  'write_products',
  'read_content',
  'write_content',
  'read_customers',
  'read_orders',
  'read_draft_orders',
  'write_draft_orders',
  'read_checkouts',
  'read_redirects',
  'write_redirects',
].join(',');

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop');
  if (!shop || !/^[a-z0-9-]+\.myshopify\.com$/i.test(shop)) {
    return NextResponse.json(
      {
        error:
          'Missing or invalid ?shop param. ' +
          'Expected something like ?shop=zgx6s7-ww.myshopify.com',
      },
      { status: 400 },
    );
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          'SHOPIFY_CLIENT_ID is not set in .env.local. ' +
          'Add it from the Dev Dashboard Configuration page and restart the dev server.',
      },
      { status: 500 },
    );
  }

  // Build the redirect URI from the incoming request so this works whether
  // we're on http://localhost:3000 or any forwarded host (e.g. ngrok).
  const redirectUri = new URL('/api/shopify/callback', req.nextUrl.origin).toString();

  const state = crypto.randomBytes(16).toString('hex');

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent(SHOPIFY_SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  const res = NextResponse.redirect(authUrl);
  // CSRF nonce — callback can verify this against the `state` query param
  // Shopify echoes back. Short-lived; one install handshake.
  res.cookies.set('shopify_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
