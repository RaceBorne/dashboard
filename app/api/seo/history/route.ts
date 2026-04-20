import { NextResponse } from 'next/server';
import { getHistory } from '@/lib/seo/history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/seo/history?limit=180
 *
 * Returns the most recent scan + fix events in chronological order
 * (oldest first) so the UI can plot them directly.
 *
 * Default limit of 180 events = roughly six months at one scan + a few
 * fix batches per week. Cap at 500 to prevent someone hammering the DB.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = Number(url.searchParams.get('limit') ?? 180);
  const limit = Number.isFinite(raw) ? Math.max(1, Math.min(500, raw)) : 180;
  const events = await getHistory(limit);
  return NextResponse.json({ events });
}
