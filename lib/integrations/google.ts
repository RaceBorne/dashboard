/**
 * Google adapters — stubs for GSC, GA4, and Gmail.
 *
 * All three share GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN.
 * Each surface adds its own ID:
 *   - GSC: GSC_SITE_URL
 *   - GA4: GA4_PROPERTY_ID
 *   - Gmail: GMAIL_USER_EMAIL + GMAIL_LABEL_NAME
 *
 * Setup:
 *   1. Create a Google Cloud project for the dashboard.
 *   2. Enable APIs: Search Console API, Google Analytics Data API, Gmail API.
 *   3. Create an OAuth 2.0 Client ID (Web). Authorised redirect URI:
 *        http://localhost:3000/api/google/callback (and the deployed URL).
 *   4. Run the one-time OAuth flow at /api/google/connect to capture a
 *      refresh_token; persist it to GOOGLE_REFRESH_TOKEN.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  listLandingPages,
  listSeoKeywords,
  listThreads,
  listTrafficDays,
  listTrafficSources,
} from '@/lib/dashboard/repository';

const requiredEnv = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'] as const;

function googleAuthReady(): boolean {
  return requiredEnv.every((k) => Boolean(process.env[k]));
}

export const isGSCConnected = () => googleAuthReady() && Boolean(process.env.GSC_SITE_URL);
export const isGA4Connected = () => googleAuthReady() && Boolean(process.env.GA4_PROPERTY_ID);
export const isGmailConnected = () => googleAuthReady() && Boolean(process.env.GMAIL_USER_EMAIL);

export async function fetchGA4Traffic30d() {
  if (!isGA4Connected()) return listTrafficDays(createSupabaseAdmin());
  throw new Error('GA4 live mode not yet implemented');
}

export async function fetchGA4Sources() {
  if (!isGA4Connected()) return listTrafficSources(createSupabaseAdmin());
  throw new Error('GA4 live mode not yet implemented');
}

export async function fetchGA4LandingPages() {
  if (!isGA4Connected()) return listLandingPages(createSupabaseAdmin());
  throw new Error('GA4 live mode not yet implemented');
}

export async function fetchGSCKeywords() {
  if (!isGSCConnected()) return listSeoKeywords(createSupabaseAdmin());
  throw new Error('GSC live mode not yet implemented');
}

export async function fetchGmailThreads() {
  if (!isGmailConnected()) return listThreads(createSupabaseAdmin());
  throw new Error('Gmail live mode not yet implemented');
}

export async function sendGmailReply(args: {
  threadId: string;
  toEmail: string;
  subject: string;
  bodyMarkdown: string;
}) {
  if (!isGmailConnected()) {
    return { ok: true, dryRun: true, ...args };
  }
  throw new Error('Gmail live mode not yet implemented');
}
