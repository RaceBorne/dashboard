/**
 * GET /api/marketing/followups       — pending suggestions for inbox.
 * POST /api/marketing/followups/scan — manual scan trigger (also runs on cron).
 */

import { NextResponse } from 'next/server';
import { listPendingFollowups, scanCampaignsForFollowups } from '@/lib/marketing/followups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const suggestions = await listPendingFollowups();
  return NextResponse.json({ ok: true, suggestions });
}

export async function POST() {
  const result = await scanCampaignsForFollowups();
  return NextResponse.json({ ok: true, ...result });
}
