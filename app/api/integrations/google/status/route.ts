import { NextResponse } from 'next/server';
import { isGA4Connected, isGSCConnected, isGmailConnected } from '@/lib/integrations/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/google/status
 *
 * Lightweight diagnostic. Returns which Google-related env vars are present
 * (as booleans — never the values themselves) plus the three "connected"
 * shortcuts the rest of the app uses. Handy for confirming what's wired up
 * in production without shipping secrets anywhere.
 */
export async function GET() {
  const env = {
    GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    GOOGLE_REFRESH_TOKEN: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
    GA4_PROPERTY_ID: Boolean(process.env.GA4_PROPERTY_ID),
    GSC_SITE_URL: Boolean(process.env.GSC_SITE_URL),
    GMAIL_USER_EMAIL: Boolean(process.env.GMAIL_USER_EMAIL),
  };
  return NextResponse.json({
    env,
    connected: {
      ga4: isGA4Connected(),
      gsc: isGSCConnected(),
      gmail: isGmailConnected(),
    },
  });
}
