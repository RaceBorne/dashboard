import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/discover/[playId]/companies/[id]
 *
 * Per-row updates from the Discovery drawer. Currently used for the
 * Notes tab (free-form text). Body shape: { notes?: string }. Other
 * fields can be added here later (status overrides, manual fit-score
 * adjustments, etc.) without spinning up a new route.
 */

interface PatchBody {
  notes?: string;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ playId: string; id: string }> },
) {
  const { playId, id } = await params;
  const body = (await req.json().catch(() => ({}))) as PatchBody;

  const update: Record<string, unknown> = {};
  if (typeof body.notes === 'string') {
    update.notes = body.notes;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: 'No updatable fields' }, { status: 400 });
  }

  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  const { error } = await sb
    .from('dashboard_play_shortlist')
    .update(update)
    .eq('id', id)
    .eq('play_id', playId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
