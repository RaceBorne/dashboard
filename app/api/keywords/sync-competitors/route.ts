import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { ingestRankedKeywords, isDataForSeoConnected } from '@/lib/integrations/dataforseo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/keywords/sync-competitors
 *
 * Fans out ingestRankedKeywords in parallel across every active competitor
 * list, auto-seeding each list's membership. Single-shot way to populate the
 * whole workspace with real DataForSEO data.
 *
 * Query params (optional):
 *   - limit   default 200, max 1000 — keywords per competitor
 *   - listIds comma-separated ids to scope the sync (otherwise all competitor lists)
 */
async function run(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200', 10), 1000);

  const listIdsParam = searchParams.get('listIds');
  const scopeIds = listIdsParam
    ? listIdsParam
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    : null;

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

  const supa = createSupabaseAdmin();
  if (!supa) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin unavailable' },
      { status: 500 },
    );
  }

  let query = supa
    .from('dashboard_keyword_lists')
    .select('id, slug, label, target_domain, location_code, language_code')
    .eq('kind', 'competitor')
    .is('retired_at', null);

  if (scopeIds && scopeIds.length > 0) {
    query = query.in('id', scopeIds);
  }

  const { data: lists, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!lists || lists.length === 0) {
    return NextResponse.json(
      { ok: true, results: [], message: 'No competitor lists to sync.' },
    );
  }

  const startedAt = Date.now();

  // Fan out all ingests in parallel — each is a single DFS call (~2s).
  // With allSettled we return partial results even if one target fails.
  const results = await Promise.allSettled(
    lists.map((l) =>
      ingestRankedKeywords({
        target: l.target_domain as string,
        limit,
        locationCode: l.location_code as number,
        languageCode: l.language_code as string,
        listId: l.id as number,
      }),
    ),
  );

  const summary = results.map((r, idx) => {
    const list = lists[idx];
    if (r.status === 'fulfilled') {
      return {
        ok: true,
        listId: list.id,
        label: list.label,
        target: list.target_domain,
        rowsWritten: r.value.rowsWritten,
        costUsd: r.value.costUsd,
        durationMs: r.value.durationMs,
      };
    }
    return {
      ok: false,
      listId: list.id,
      label: list.label,
      target: list.target_domain,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });

  const totalCost = summary.reduce((sum, s) => sum + ('costUsd' in s ? s.costUsd ?? 0 : 0), 0);
  const totalRows = summary.reduce((sum, s) => sum + ('rowsWritten' in s ? s.rowsWritten ?? 0 : 0), 0);

  return NextResponse.json({
    ok: true,
    connected: true,
    wallDurationMs: Date.now() - startedAt,
    syncedLists: summary.filter((s) => s.ok).length,
    failedLists: summary.filter((s) => !s.ok).length,
    totalRowsWritten: totalRows,
    totalCostUsd: totalCost,
    results: summary,
  });
}

export const GET = run;
export const POST = run;
