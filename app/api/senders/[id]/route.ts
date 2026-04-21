import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { deleteSender, getSender, upsertSender } from '@/lib/dashboard/repository';
import type { OutreachSender } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const { id } = await ctx.params;
  try {
    const sender = await getSender(supabase, id);
    if (!sender) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ sender });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const { id } = await ctx.params;
  try {
    const existing = await getSender(supabase, id);
    if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const patch = (await req.json()) as Partial<OutreachSender>;
    const next: OutreachSender = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    if (patch.email) next.email = patch.email.trim().toLowerCase();
    await upsertSender(supabase, next);
    return NextResponse.json({ sender: next });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const { id } = await ctx.params;
  try {
    await deleteSender(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
