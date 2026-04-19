import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { insertTask, listTasksAndLists } from '@/lib/tasks/repository';
import type { Task, TaskCategory, TaskPriority, TaskSource, TaskStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured', tasks: [], lists: [] }, { status: 503 });
  }
  try {
    const { tasks, lists } = await listTasksAndLists(supabase);
    return NextResponse.json({ tasks, lists });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  try {
    const body = (await req.json()) as Partial<Task> & { listId?: string };
    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (!body.category || !body.status || !body.priority) {
      return NextResponse.json({ error: 'category, status, and priority are required' }, { status: 400 });
    }
    const task = await insertTask(supabase, {
      title: body.title.trim(),
      description: body.description,
      category: body.category as TaskCategory,
      status: body.status as TaskStatus,
      priority: body.priority as TaskPriority,
      dueDate: body.dueDate,
      source: (body.source as TaskSource) ?? 'manual',
      wishlistRef: body.wishlistRef,
      notes: body.notes,
      listId: body.listId,
    });
    return NextResponse.json({ task });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
