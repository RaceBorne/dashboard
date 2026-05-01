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
    const trimmedTitle = body.title.trim();
    const requestedSource = (body.source as TaskSource) ?? 'manual';

    // Dedup guard for AI / auto sources. If a non-done task with the
    // same title already exists, skip the insert and return the
    // existing row. Stops the AI Suggestions card from filling the
    // board with copies on every regenerate. Manual adds bypass the
    // guard so the operator can intentionally create duplicates if
    // they want to.
    if (requestedSource === 'auto') {
      const { data: existing } = await supabase
        .from('tasks')
        .select('*')
        .ilike('title', trimmedTitle)
        .neq('status', 'done')
        .limit(1)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({
          task: existing,
          deduped: true,
          message: 'A task with this title already exists; not creating a duplicate.',
        });
      }
    }

    const task = await insertTask(supabase, {
      title: trimmedTitle,
      description: body.description,
      category: body.category as TaskCategory,
      status: body.status as TaskStatus,
      priority: body.priority as TaskPriority,
      dueDate: body.dueDate,
      source: requestedSource,
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
