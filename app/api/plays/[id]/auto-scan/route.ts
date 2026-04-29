import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay } from '@/lib/dashboard/repository';
import { autoScanForPlay } from '@/lib/brand/autoScan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Auto-scan involves an AI plan (~5-15s) + DataForSEO call (~3-10s) +
// per-listing DB writes. Give it real headroom — running synchronously
// is more reliable than after() for Vercel lambdas.
export const maxDuration = 60;

/**
 * POST /api/plays/[id]/auto-scan
 *
 * Synchronously runs the discovery auto-scan for a Play and returns
 * the result. The caller is expected to be the Spitball commit flow,
 * which awaits this before redirecting to Discover. This is more
 * reliable than next/server `after()` because Vercel kills lambdas
 * before background work completes in some cases.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }
  const play = await getPlay(supabase, id);
  if (!play) {
    return NextResponse.json({ ok: false, error: 'Play not found' }, { status: 404 });
  }

  // Idempotency: don't double-run if a scan is already in flight.
  // 'running' means we're partway through a previous call, 'done' with
  // a recent finishedAt (< 60s) means we just finished. In either case
  // skip and report the existing status.
  const stamp = play.autoScan ?? { status: 'pending' };
  if (stamp.status === 'running') {
    return NextResponse.json({ ok: true, skipped: 'already-running', autoScan: stamp });
  }

  console.log('[auto-scan] start id=' + id);
  try {
    const result = await autoScanForPlay(supabase, play);
    console.log(
      '[auto-scan] done id=' + id +
      ' inserted=' + result.inserted +
      ' found=' + result.found +
      ' agent=' + result.agent +
      (result.skipReason ? ' skip=' + result.skipReason : ''),
    );
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.warn('[auto-scan] failed id=' + id, err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
