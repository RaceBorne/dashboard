/**
 * Marketing flows worker tick.
 *
 * Fires on the vercel.json schedule. Pulls a batch of due runs from
 * dashboard_mkt_flow_runs and advances each by one step. Idempotent
 * — running back-to-back ticks just shrinks the queue.
 *
 * Auth: Vercel cron requests carry Authorization: Bearer $CRON_SECRET.
 * In dev (CRON_SECRET unset) we let the request through so a manual
 * curl can drain the queue.
 */

import { NextResponse } from 'next/server';

import { processDueRuns } from '@/lib/marketing/flows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  // Cap per tick — keeps the cron well under Vercel's max function
  // duration even when the backlog is large.
  const result = await processDueRuns({ limit: 50 });
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: Request) {
  return GET(req);
}
