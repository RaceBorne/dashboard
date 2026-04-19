import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { deleteTaskById, updateTaskById } from '@/lib/tasks/repository';
import type { Task, TaskCategory, TaskPriority, TaskStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const body = (await req.json()) as Partial<
      Pick<Task, 'title' | 'description' | 'category' | 'status' | 'priority' | 'dueDate' | 'wishlistRef' | 'notes' | 'listId'>
    >;
    const patch: Parameters<typeof updateTaskById>[2] = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.category !== undefined) patch.category = body.category as TaskCategory;
    if (body.status !== undefined) patch.status = body.status as TaskStatus;
    if (body.priority !== undefined) patch.priority = body.priority as TaskPriority;
    if (body.dueDate !== undefined) patch.dueDate = body.dueDate;
    if (body.wishlistRef !== undefined) patch.wishlistRef = body.wishlistRef;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.listId !== undefined) patch.listId = body.listId;
    const task = await updateTaskById(supabase, id, patch);
    return NextResponse.json({ task });
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
    await deleteTaskById(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
