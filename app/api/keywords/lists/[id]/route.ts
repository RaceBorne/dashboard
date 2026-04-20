import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH  /api/keywords/lists/[id]
 *   → update a list (label, notes, color_tone, location_code, language_code)
 * DELETE /api/keywords/lists/[id]
 *   → soft-delete (sets retired_at). "Our keywords" (slug='our-keywords')
 *     is protected — it's always the reference list.
 */

async function parseId(params: Promise<{ id: string }>): Promise<number | null> {
  const p = await params;
  const id = parseInt(p.id, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supa = createSupabaseAdmin();
  if (!supa) {
    return NextResponse.json({ ok: false, error: 'Supabase admin unavailable' }, { status: 500 });
  }

  const id = await parseId(ctx.params);
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Invalid list id' }, { status: 400 });
  }

  let body: {
    label?: string;
    notes?: string | null;
    color_tone?: string;
    location_code?: number;
    language_code?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.label === 'string' && body.label.trim()) patch.label = body.label.trim();
  if (body.notes !== undefined) patch.notes = body.notes;
  if (typeof body.color_tone === 'string') patch.color_tone = body.color_tone;
  if (typeof body.location_code === 'number') patch.location_code = body.location_code;
  if (typeof body.language_code === 'string') patch.language_code = body.language_code;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supa
    .from('dashboard_keyword_lists')
    .update(patch)
    .eq('id', id)
    .select(
      'id, slug, label, kind, target_domain, color_tone, location_code, language_code, notes, created_at',
    )
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, list: data });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supa = createSupabaseAdmin();
  if (!supa) {
    return NextResponse.json({ ok: false, error: 'Supabase admin unavailable' }, { status: 500 });
  }

  const id = await parseId(ctx.params);
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Invalid list id' }, { status: 400 });
  }

  // Guard: the "Our keywords" list is the default reference. Deleting it
  // breaks the dashboard's sense of "us" vs "them", so block it.
  const { data: existing } = await supa
    .from('dashboard_keyword_lists')
    .select('id, slug')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ ok: false, error: 'List not found' }, { status: 404 });
  }
  if (existing.slug === 'our-keywords') {
    return NextResponse.json(
      { ok: false, error: 'The "Our keywords" list cannot be deleted.' },
      { status: 400 },
    );
  }

  const { error } = await supa
    .from('dashboard_keyword_lists')
    .update({ retired_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
