import { NextResponse } from 'next/server';
import { ingestKlaviyoRollup, isKlaviyoConnected } from '@/lib/integrations/klaviyo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET/POST /api/integrations/klaviyo/ingest
 *
 * Pulls campaigns, flows, lists, segments, and daily metrics from Klaviyo and
 * upserts into:
 *   - dashboard_klaviyo_campaigns
 *   - dashboard_klaviyo_flows
 *   - dashboard_klaviyo_lists
 *   - dashboard_klaviyo_metrics_days
 *
 * Optional query params:
 *   - days       (default 90, max 180) — metric rollup window
 *   - maxCampaigns (default 50, max 500)
 *   - maxFlows   (default 50, max 500)
 *   - maxLists   (default 100, max 500)
 */
async function run(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = clampInt(searchParams.get('days'), 90, 1, 180);
  const maxCampaigns = clampInt(searchParams.get('maxCampaigns'), 50, 10, 500);
  const maxFlows = clampInt(searchParams.get('maxFlows'), 50, 10, 500);
  const maxLists = clampInt(searchParams.get('maxLists'), 100, 10, 500);

  if (!isKlaviyoConnected()) {
    return NextResponse.json(
      {
        ok: false,
        connected: false,
        error: 'Klaviyo not connected — set KLAVIYO_API_KEY',
      },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  try {
    const result = await ingestKlaviyoRollup({ days, maxCampaigns, maxFlows, maxLists });
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
