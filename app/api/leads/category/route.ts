import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/leads/category  { from: string; to: string; tier?: 'prospect' | 'lead' }
 *
 * Renames a Funnel folder. Every row where payload.category === from gets
 * its payload.category rewritten to `to`. Scoped by tier so renaming a
 * folder on /prospects cannot accidentally touch /leads.
 */
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { from?: string; to?: string; tier?: 'prospect' | 'lead' }
    | null;

  const from = body?.from?.trim();
  const to = body?.to?.trim();
  const tier = body?.tier;

  if (!from || !to) {
    return NextResponse.json(
      { error: 'Both "from" and "to" are required.' },
      { status: 400 },
    );
  }
  if (from === to) {
    return NextResponse.json({ renamed: 0 });
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  let query = supabase
    .from('dashboard_leads')
    .select('id, payload, tier')
    .contains('payload', { category: from });
  if (tier) query = query.eq('tier', tier);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ renamed: 0 });
  }

  const updates = (data as Array<{ id: string; payload: Record<string, unknown>; tier: string }>)
    .map((row) => ({
      id: row.id,
      tier: row.tier,
      payload: { ...row.payload, category: to },
    }));

  const { error: upErr } = await supabase.from('dashboard_leads').upsert(updates);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ renamed: updates.length });
}

/**
 * DELETE /api/leads/category  { category: string; tier?: 'prospect' | 'lead' }
 *
 * Bulk delete. Every row where payload.category === category (and tier
 * matches if provided) is removed. Use with care — this is for the
 * "clear out a sourcing folder while developing" button.
 */
export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { category?: string; tier?: 'prospect' | 'lead' }
    | null;

  const category = body?.category?.trim();
  const tier = body?.tier;

  if (!category) {
    return NextResponse.json(
      { error: '"category" is required.' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  let query = supabase
    .from('dashboard_leads')
    .delete({ count: 'exact' })
    .contains('payload', { category });
  if (tier) query = query.eq('tier', tier);

  const { error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: count ?? 0 });
}
