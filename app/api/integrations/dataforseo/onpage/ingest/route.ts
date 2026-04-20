import { NextResponse } from 'next/server';
import { ingestOnpage, isDataForSeoConnected } from '@/lib/integrations/dataforseo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET/POST /api/integrations/dataforseo/onpage/ingest
 *
 * Audits one or more URLs for on-page SEO issues and upserts into:
 *   - dashboard_dataforseo_onpage_pages (page metadata, scores)
 *   - dashboard_dataforseo_onpage_issues (per-check findings)
 *
 * Query params:
 *   - urls    (comma-separated; default ['https://evari.cc/'])
 *   - target  (default 'evari.cc', for linking pages to a domain)
 */
async function run(req: Request) {
  const { searchParams } = new URL(req.url);
  const urlsParam = searchParams.get('urls') ?? 'https://evari.cc/';
  const target = searchParams.get('target') ?? 'evari.cc';

  const urls = urlsParam
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  if (urls.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        connected: true,
        error: 'urls query param is empty',
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
    const result = await ingestOnpage({ urls, target });
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
