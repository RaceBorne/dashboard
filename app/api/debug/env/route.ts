import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/env
 *
 * Returns a map of every integration env var -> boolean presence.
 * No values leak — just true/false so Craig can confirm from the
 * browser what the running Node process actually has loaded.
 *
 * Remove once the env confusion is resolved.
 */
export async function GET() {
  const keys = [
    'SHOPIFY_STORE_DOMAIN',
    'SHOPIFY_ADMIN_ACCESS_TOKEN',
    'SHOPIFY_API_VERSION',
    'NEXT_PUBLIC_STOREFRONT_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GMAIL_USER_EMAIL',
    'GSC_SITE_URL',
    'GA4_PROPERTY_ID',
    'PAGESPEED_API_KEY',
    'GOOGLE_PLACES_API_KEY',
    'DATAFORSEO_LOGIN',
    'DATAFORSEO_PASSWORD',
    'KLAVIYO_API_KEY',
    'AI_GATEWAY_API_KEY',
    'ANTHROPIC_API_KEY',
    'CONNECTOR_ENCRYPTION_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'META_ACCESS_TOKEN',
    'INSTAGRAM_BUSINESS_ACCOUNT_ID',
    'LINKEDIN_ACCESS_TOKEN',
    'LINKEDIN_ORGANIZATION_URN',
    'TIKTOK_ACCESS_TOKEN',
  ];

  const presence: Record<string, boolean> = {};
  const lengths: Record<string, number> = {};
  for (const k of keys) {
    const v = process.env[k] ?? '';
    presence[k] = v.length > 0;
    lengths[k] = v.length;
  }

  return NextResponse.json({
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV ?? null,
    vercel: Boolean(process.env.VERCEL),
    presence,
    lengths,
  });
}
