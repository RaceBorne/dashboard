import { NextResponse } from 'next/server';
import { ingestGSCRollup, isGSCConnected } from '@/lib/integrations/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST (or GET) /api/integrations/google/gsc/ingest
 *
 * Full nightly rollup for the configured GSC property:
 *   - Pulls last 28 days of top queries and top pages
 *   - Overwrites public.dashboard_gsc_queries_28d + public.dashboard_gsc_pages_28d
 *
 * Designed to be called by Vercel Cron (nightly) or manually from the browser
 * for ad-hoc refreshes. Idempotent — each run fully replaces the previous
 * snapshot for the current site_url.
 *
 * Optional query params:
 *   - days (default 28, max 90)
 *   - maxQueries (default 1000, max 5000)
 *   - maxPages (default 500, max 5000)
 */
async function runIngest(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = clampInt(searchParams.get('days'), 28, 1, 90);
  const maxQueries = clampInt(searchParams.get('maxQueries'), 1000, 10, 5000);
  const maxPages = clampInt(searchParams.get('maxPages'), 500, 10, 5000);

  if (!isGSCConnected()) {
    return NextResponse.json(
      {
        ok: false,
        connected: false,
        error: 'GSC not connected — check env vars',
      },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  try {
    const result = await ingestGSCRollup({ days, maxQueries, maxPages });
    return NextResponse.json({
      ok: true,
      connected: true,
      durationMs: Date.now() - startedAt,
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        connected: true,
        durationMs: Date.now() - startedAt,
        error: msg,
      },
      { status: 500 },
    );
  }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export const GET = runIngest;
export const POST = runIngest;
