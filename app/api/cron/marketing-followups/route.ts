/**
 * Daily cron: scan recent campaigns for low-engagement and write
 * follow-up suggestions to the inbox. Vercel triggers this once a day.
 */

import { NextResponse } from 'next/server';
import { scanCampaignsForFollowups } from '@/lib/marketing/followups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  const result = await scanCampaignsForFollowups();
  return NextResponse.json({ ok: true, ...result });
}
