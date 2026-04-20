import { NextResponse } from 'next/server';
import { ingestRankedKeywords, isDataForSeoConnected } from '@/lib/integrations/dataforseo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET/POST /api/integrations/dataforseo/ranked-keywords/ingest
 *
 * Pulls up to `limit` keywords that `target` ranks for via DFS Labs
 * ranked_keywords, and writes:
 *   - dashboard_dataforseo_keyword_data (market data)
 *   - dashboard_dataforseo_serp_keywords (target-scoped positions)
 *   - dashboard_dataforseo_serp_history (snapshot)
 *   - dashboard_keyword_list_members (if listId supplied — source='auto')
 *
 * Query params:
 *   - target        (required, e.g. "fuell.us")
 *   - limit         (default 200, max 1000)
 *   - locationCode  (default 2826, United Kingdom)
 *   - languageCode  (default 'en')
 *   - listId        (optional — auto-seed this list's membership)
 */
async function run(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('target');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200', 10), 1000);
  const locationCode = parseInt(searchParams.get('locationCode') ?? '2826', 10);
  const languageCode = searchParams.get('languageCode') ?? 'en';
  const listIdRaw = searchParams.get('listId');
  const listId = listIdRaw ? parseInt(listIdRaw, 10) : undefined;

  if (!target) {
    return NextResponse.json(
      {
        ok: false,
        connected: true,
        error: 'target query param is required (e.g. "fuell.us")',
      },
      { status: 400 },
    );
  }

  if (!isDataForSeoConnected()) {
    return NextResponse.json(
      {
        ok: false,
        connected: false,
        error: 'DataForSEO not connected — set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD',
      },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  try {
    const result = await ingestRankedKeywords({
      target,
      limit,
      locationCode,
      languageCode,
      listId,
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

export const GET = run;
export const POST = run;
