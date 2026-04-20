import { NextResponse } from 'next/server';
import {
  fetchGSCSiteList,
  fetchGSCTopQueries,
  isGSCConnected,
} from '@/lib/integrations/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/integrations/google/gsc/ping?days=28&limit=10
 *
 * Cheap health-check for the Search Console integration. Runs one live
 * searchAnalytics.query call against the configured GSC property and returns
 * the top queries along with shape info so we can prove the OAuth refresh
 * token + site URL + scopes are all wired up.
 *
 * Even an empty rows array is a successful ping — it means we authenticated,
 * talked to GSC, and GSC returned nothing (common for freshly-verified sites
 * still in their 48h data-processing window).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const daysRaw = Number(searchParams.get('days') ?? '28');
  const limitRaw = Number(searchParams.get('limit') ?? '10');
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 90) : 28;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;

  const connected = isGSCConnected();
  const siteUrl = process.env.GSC_SITE_URL ?? null;
  const startedAt = Date.now();

  if (!connected) {
    return NextResponse.json(
      {
        ok: false,
        connected,
        siteUrl,
        error:
          'GSC not connected — check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GSC_SITE_URL in .env.local',
      },
      { status: 400 },
    );
  }

  try {
    const result = await fetchGSCTopQueries({ days, limit });
    return NextResponse.json({
      ok: true,
      connected,
      siteUrl: result.siteUrl,
      durationMs: Date.now() - startedAt,
      window: { startDate: result.startDate, endDate: result.endDate, days },
      rowCount: result.rows.length,
      totals: {
        clicks: result.rows.reduce((acc, r) => acc + r.clicks, 0),
        impressions: result.rows.reduce((acc, r) => acc + r.impressions, 0),
      },
      rows: result.rows.map((r) => ({
        query: r.query,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Number((r.ctr * 100).toFixed(2)),
        position: Number(r.position.toFixed(1)),
      })),
      note:
        result.rows.length === 0
          ? 'Authenticated OK, but GSC returned no rows. Usually means the site is still in its initial 48h data-processing window. Try again tomorrow.'
          : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // On permission errors, try to list the user's accessible sites so we
    // can suggest the correct GSC_SITE_URL value.
    let accessibleSites: Array<{ siteUrl: string; permissionLevel: string }> | null = null;
    if (/403|permission|forbidden/i.test(msg)) {
      try {
        accessibleSites = await fetchGSCSiteList();
      } catch {
        // swallow — best-effort hint only
      }
    }

    return NextResponse.json(
      {
        ok: false,
        connected,
        siteUrl,
        durationMs: Date.now() - startedAt,
        error: msg,
        accessibleSites,
        hint: accessibleSites
          ? 'GSC says the current site URL is wrong. Pick a siteUrl from accessibleSites above and paste it into .env.local as GSC_SITE_URL.'
          : undefined,
      },
      { status: 500 },
    );
  }
}
