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

  // Idempotency: only skip if a scan is genuinely in flight RIGHT
  // now. Vercel kills lambdas mid-flight when a previous deployment
  // didn't have maxDuration set, leaving rows stuck at status='running'
  // forever. Treat anything older than 90 seconds as stale and retry.
  const stamp = play.autoScan ?? { status: 'pending' };
  if (stamp.status === 'running' && stamp.startedAt) {
    const startedMs = new Date(stamp.startedAt).getTime();
    const ageMs = Date.now() - startedMs;
    if (ageMs < 90_000) {
      return NextResponse.json({ ok: true, skipped: 'already-running', autoScan: stamp });
    }
    console.warn('[auto-scan] reclaiming stale running scan id=' + id + ' age=' + Math.round(ageMs / 1000) + 's');
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
