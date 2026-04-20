import { NextResponse } from 'next/server';
import { ingestSerp, isDataForSeoConnected } from '@/lib/integrations/dataforseo';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// With parallelism, N keywords finish in ~max(per-call latency) not ~N*15s.
// 60s is plenty for 20+ keywords on the Vercel Hobby plan cap.
export const maxDuration = 60;

/**
 * GET/POST /api/integrations/dataforseo/serp/ingest
 *
 * Fetches SERP positions for one or more keywords and upserts into:
 *   - dashboard_dataforseo_serp_keywords (keyword + latest position)
 *   - dashboard_dataforseo_serp_history (position history per check)
 *
 * Query params:
 *   - keywords        (comma-separated; if absent, pulls top 20 from dashboard_seo_keywords ordered by impressions desc)
 *   - locationCode    (default 2826, United Kingdom)
 *   - languageCode    (default 'en')
 *   - target          (default 'evari.cc', for matching domain in SERP)
 */
async function run(req: Request) {
  const { searchParams } = new URL(req.url);
  const locationCode = parseInt(searchParams.get('locationCode') ?? '2826', 10);
  const languageCode = searchParams.get('languageCode') ?? 'en';
  const target = searchParams.get('target') ?? 'evari.cc';

  let keywords: string[] = [];
  const keywordsParam = searchParams.get('keywords');

  if (keywordsParam) {
    keywords = keywordsParam
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  } else {
    // Pull top 20 keywords from dashboard_seo_keywords ordered by impressions desc
    const supa = createSupabaseAdmin();
    if (supa) {
      const { data, error } = await supa
        .from('dashboard_seo_keywords')
        .select('payload')
        .limit(20);

      if (!error && data) {
        keywords = data
          .map((row) => {
            const payload = row.payload as Record<string, unknown> | null;
            return payload?.query as string;
          })
          .filter(Boolean);
      }
    }
  }

  if (keywords.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        connected: true,
        error: 'No keywords provided — pass keywords query param or ensure dashboard_seo_keywords has rows',
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
    const result = await ingestSerp({
      keywords,
      locationCode,
      languageCode,
      target,
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
