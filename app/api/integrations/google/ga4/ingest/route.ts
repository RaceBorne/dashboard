import { NextResponse } from 'next/server';
import { ingestGA4Rollup, isGA4Connected } from '@/lib/integrations/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST (or GET) /api/integrations/google/ga4/ingest
 *
 * Pulls GA4 data and upserts into:
 *   - dashboard_traffic_days          (one row per day, default 365d history)
 *   - dashboard_traffic_sources       (truncated + reinserted, 28d)
 *   - dashboard_ga4_pages_28d         (per-property rollup, 28d)
 *   - dashboard_ga4_geo_28d           (per-property rollup, 28d)
 *   - dashboard_ga4_channels_28d      (per-property rollup, 28d)
 *   - dashboard_ga4_cities_28d        (per-property rollup, 28d)
 *   - dashboard_ga4_languages_28d     (per-property rollup, 28d)
 *   - dashboard_ga4_events_28d        (per-property rollup, 28d)
 *
 * Optional query params (all have sensible defaults):
 *   - days         (default 365, max 730) — scope for the day-level trend
 *   - maxSources   (default 50, max 500)
 *   - maxPages     (default 100, max 1000)
 *   - maxGeo       (default 250, max 1000)
 *   - maxChannels  (default 20, max 50)
 *   - maxCities    (default 200, max 1000)
 *   - maxLanguages (default 20, max 50)
 *   - maxEvents    (default 30, max 100)
 */
async function run(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = clampInt(searchParams.get('days'), 365, 1, 730);
  const maxSources = clampInt(searchParams.get('maxSources'), 50, 10, 500);
  const maxPages = clampInt(searchParams.get('maxPages'), 100, 10, 1000);
  const maxGeo = clampInt(searchParams.get('maxGeo'), 250, 10, 1000);
  const maxChannels = clampInt(searchParams.get('maxChannels'), 20, 5, 50);
  const maxCities = clampInt(searchParams.get('maxCities'), 200, 10, 1000);
  const maxLanguages = clampInt(searchParams.get('maxLanguages'), 20, 5, 50);
  const maxEvents = clampInt(searchParams.get('maxEvents'), 30, 5, 100);

  if (!isGA4Connected()) {
    return NextResponse.json(
      {
        ok: false,
        connected: false,
        error: 'GA4 not connected — set GA4_PROPERTY_ID',
      },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  try {
    const result = await ingestGA4Rollup({
      days,
      maxSources,
      maxPages,
      maxGeo,
      maxChannels,
      maxCities,
      maxLanguages,
      maxEvents,
    });
    return NextResponse.json({
      ok: true,
      connected: true,
      ...result,
      wallDurationMs: Date.now() - startedAt,
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

export const GET = run;
export const POST = run;
