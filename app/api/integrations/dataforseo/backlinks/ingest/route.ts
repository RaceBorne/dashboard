import { NextResponse } from 'next/server';
import { ingestBacklinks, isDataForSeoConnected } from '@/lib/integrations/dataforseo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET/POST /api/integrations/dataforseo/backlinks/ingest
 *
 * Pulls backlinks summary, individual backlinks (top 100), and referring domains
 * for one or more targets, and upserts into:
 *   - dashboard_dataforseo_backlinks_summary
 *   - dashboard_dataforseo_backlinks
 *   - dashboard_dataforseo_referring_domains
 *
 * Query params:
 *   - targets (comma-separated; default 'evaribikes.com,evari.cc')
 */
async function run(req: Request) {
  const { searchParams } = new URL(req.url);
  const targetsParam = searchParams.get('targets') ?? 'evaribikes.com,evari.cc';
  const targets = targetsParam
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

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
    const result = await ingestBacklinks({ targets });
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
