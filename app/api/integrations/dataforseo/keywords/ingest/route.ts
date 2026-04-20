import { NextResponse } from 'next/server';
import { ingestKeywordData, isDataForSeoConnected } from '@/lib/integrations/dataforseo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET/POST /api/integrations/dataforseo/keywords/ingest
 *
 * Fetches search volume, CPC, competition, and keyword difficulty for one or more keywords,
 * and upserts into:
 *   - dashboard_dataforseo_keyword_data
 *
 * Query params:
 *   - keywords     (comma-separated, required)
 *   - locationCode (default 2826, United Kingdom)
 *   - languageCode (default 'en')
 */
async function run(req: Request) {
  const { searchParams } = new URL(req.url);
  const keywordsParam = searchParams.get('keywords');
  const locationCode = parseInt(searchParams.get('locationCode') ?? '2826', 10);
  const languageCode = searchParams.get('languageCode') ?? 'en';

  if (!keywordsParam) {
    return NextResponse.json(
      {
        ok: false,
        connected: true,
        error: 'keywords query param is required (comma-separated)',
      },
      { status: 400 },
    );
  }

  const keywords = keywordsParam
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  if (keywords.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        connected: true,
        error: 'keywords query param is empty',
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
    const result = await ingestKeywordData({
      keywords,
      locationCode,
      languageCode,
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
