import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/keywords/lists/[id]/members
 *   body: { keywords: string[], source?: 'manual' | 'auto' | 'gsc' | 'seed', priority?: number, notes?: string }
 *   → idempotently adds keywords to a list. Normalizes (lowercase/trim) and
 *     dedupes. Returns count added.
 * DELETE /api/keywords/lists/[id]/members
 *   body: { keywords: string[] }
 *   → removes keywords from the list.
 */

async function parseId(params: Promise<{ id: string }>): Promise<number | null> {
  const p = await params;
  const id = parseInt(p.id, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizeKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const k of raw) {
    if (typeof k !== 'string') continue;
    const clean = k.toLowerCase().trim();
    if (clean) seen.add(clean);
  }
  return Array.from(seen);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supa = createSupabaseAdmin();
  if (!supa) {
    return NextResponse.json({ ok: false, error: 'Supabase admin unavailable' }, { status: 500 });
  }

  const id = await parseId(ctx.params);
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Invalid list id' }, { status: 400 });
  }

  let body: { keywords?: unknown; source?: string; priority?: number; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const keywords = normalizeKeywords(body.keywords);
  if (keywords.length === 0) {
    return NextResponse.json({ ok: false, error: 'keywords array is required' }, { status: 400 });
  }

  const source = ['manual', 'auto', 'gsc', 'seed'].includes(body.source ?? '')
    ? (body.source as 'manual' | 'auto' | 'gsc' | 'seed')
    : 'manual';

  // Sanity check: list must exist + not be retired.
  const { data: list } = await supa
    .from('dashboard_keyword_lists')
    .select('id, retired_at')
    .eq('id', id)
    .maybeSingle();

  if (!list || list.retired_at) {
    return NextResponse.json({ ok: false, error: 'List not found' }, { status: 404 });
  }

  const rows = keywords.map((kw) => ({
    list_id: id,
    keyword: kw,
    source,
    priority: typeof body.priority === 'number' ? body.priority : 0,
    notes: typeof body.notes === 'string' ? body.notes : null,
  }));

  const { error } = await supa
    .from('dashboard_keyword_list_members')
    .upsert(rows, { onConflict: 'list_id,keyword', ignoreDuplicates: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, added: keywords.length, keywords });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supa = createSupabaseAdmin();
  if (!supa) {
    return NextResponse.json({ ok: false, error: 'Supabase admin unavailable' }, { status: 500 });
  }

  const id = await parseId(ctx.params);
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Invalid list id' }, { status: 400 });
  }

  let body: { keywords?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const keywords = normalizeKeywords(body.keywords);
  if (keywords.length === 0) {
    return NextResponse.json({ ok: false, error: 'keywords array is required' }, { status: 400 });
  }

  const { error } = await supa
    .from('dashboard_keyword_list_members')
    .delete()
    .eq('list_id', id)
    .in('keyword', keywords);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, removed: keywords.length });
}
