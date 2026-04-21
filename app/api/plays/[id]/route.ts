import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay } from '@/lib/dashboard/repository';
import type { Play, PlayStage } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/plays/[id]
 *
 * Partial-update a play from the /plays list. Only these fields are allowed
 * — detail-page edits (research, targets, messaging, chat) go through their
 * own routes and carry richer payloads.
 *
 * Body: { title?: string; brief?: string; stage?: PlayStage; pinned?: boolean }
 */
const STAGES: PlayStage[] = [
  'idea',
  'researching',
  'building',
  'ready',
  'live',
  'retired',
];

export async function PATCH(
  req: Request,
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

  const existing = await getPlay(supabase, id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: 'Play not found' },
      { status: 404 },
    );
  }

  let body: {
    title?: string;
    brief?: string;
    stage?: PlayStage;
    pinned?: boolean;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const patch: Partial<Play> = {};
  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t) {
      return NextResponse.json(
        { ok: false, error: 'Title cannot be empty' },
        { status: 400 },
      );
    }
    patch.title = t;
  }
  if (typeof body.brief === 'string') {
    patch.brief = body.brief.trim();
  }
  if (typeof body.stage === 'string') {
    if (!STAGES.includes(body.stage)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid stage' },
        { status: 400 },
      );
    }
    patch.stage = body.stage;
  }
  if (typeof body.pinned === 'boolean') {
    patch.pinned = body.pinned;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No editable fields provided' },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const next: Play = {
    ...existing,
    ...patch,
    updatedAt: now,
    activity: [
      ...existing.activity,
      {
        id: `act-${Date.now()}`,
        at: now,
        type:
          patch.stage && patch.stage !== existing.stage
            ? 'stage_change'
            : 'note',
        summary:
          patch.stage && patch.stage !== existing.stage
            ? `Moved to ${patch.stage}`
            : summariseEdit(patch, existing),
      },
    ],
  };

  const { error } = await supabase
    .from('dashboard_plays')
    .update({ payload: next })
    .eq('id', id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, play: next });
}

/**
 * DELETE /api/plays/[id]
 *
 * Hard-delete the row. The row is small (everything's in the jsonb payload),
 * we don't keep a "retired" soft state because the `retired` stage already
 * exists for that — if Craig only wanted to park it, he'd change the stage.
 */
export async function DELETE(
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
  const { error } = await supabase.from('dashboard_plays').delete().eq('id', id);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

function summariseEdit(patch: Partial<Play>, existing: Play): string {
  const bits: string[] = [];
  if (patch.title && patch.title !== existing.title) bits.push('renamed');
  if (patch.brief !== undefined && patch.brief !== existing.brief)
    bits.push('brief edited');
  if (patch.pinned !== undefined && patch.pinned !== existing.pinned)
    bits.push(patch.pinned ? 'pinned' : 'unpinned');
  return bits.length > 0 ? bits.join(' · ') : 'Edited';
}
