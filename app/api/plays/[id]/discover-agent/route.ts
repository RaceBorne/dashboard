import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay } from '@/lib/dashboard/repository';
import { runDiscoverAgent } from '@/lib/brand/discoverAgent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The agent runs a tool-call loop with up to 40 rounds. Each round
// may include a SERP fetch, a Places fetch, a page fetch, and a
// Claude turn. Give it real headroom; cheaper than the lambda dying
// mid-loop. Vercel's pro-tier limit is 300s.
export const maxDuration = 300;

/**
 * POST /api/plays/[id]/discover-agent
 *
 * Runs the discover agent — a tool-calling Claude loop that searches
 * the web, verifies pages, and adds verified candidates to the play
 * shortlist. Replaces the older single-shot autoScanForPlay path for
 * Discovery's Find companies button.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'Supabase admin client unavailable' }, { status: 500 });
  }
  const play = await getPlay(supabase, id);
  if (!play) {
    return NextResponse.json({ ok: false, error: 'Play not found' }, { status: 404 });
  }

  // Stamp play.autoScan as running so the Discovery banner shows the
  // right state and we have an audit trail.
  const startedAt = new Date().toISOString();
  await supabase
    .from('dashboard_plays')
    .update({
      payload: { ...play, autoScan: { status: 'running', startedAt } },
    })
    .eq('id', id);

  try {
    const result = await runDiscoverAgent(supabase, play);
    const finishedAt = new Date().toISOString();
    await supabase
      .from('dashboard_plays')
      .update({
        payload: {
          ...play,
          autoScan: {
            status: result.agent === 'skipped' ? 'skipped' : 'done',
            startedAt,
            finishedAt,
            inserted: result.inserted,
            found: result.inserted,
            costUsd: result.costUsd,
            steps: result.steps,
            skipReason: result.skipReason,
          },
        },
      })
      .eq('id', id);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const finishedAt = new Date().toISOString();
    const message = (err as Error).message;
    await supabase
      .from('dashboard_plays')
      .update({
        payload: {
          ...play,
          autoScan: { status: 'error', startedAt, finishedAt, error: message },
        },
      })
      .eq('id', id);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
