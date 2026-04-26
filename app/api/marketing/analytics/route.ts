import { NextResponse } from 'next/server';

import { getAnalytics, type AnalyticsRange } from '@/lib/marketing/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED: AnalyticsRange[] = ['7d', '30d', '90d', 'all'];

/**
 * GET /api/marketing/analytics?range=7d|30d|90d|all   (default 30d)
 * → AnalyticsSummary
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get('range') ?? '30d';
  const range = (ALLOWED.includes(raw as AnalyticsRange) ? raw : '30d') as AnalyticsRange;
  const summary = await getAnalytics(range);
  return NextResponse.json(summary);
}
