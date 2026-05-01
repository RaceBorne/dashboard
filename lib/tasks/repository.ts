import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomList, Task, TaskCategory, TaskPriority, TaskSource, TaskStatus } from '@/lib/types';
import { TASK_CATEGORY_META } from '@/lib/tasks/categories';

const STATUSES: TaskStatus[] = [
  'proposed',
  'planned',
  'in-progress',
  'done',
  'blocked',
];
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const SOURCES: TaskSource[] = ['manual', 'discussion', 'auto'];

function isTaskCategory(v: string): v is TaskCategory {
  return v in TASK_CATEGORY_META;
}

function isTaskStatus(v: string): v is TaskStatus {
  return STATUSES.includes(v as TaskStatus);
}

function isTaskPriority(v: string): v is TaskPriority {
  return PRIORITIES.includes(v as TaskPriority);
}

function isTaskSource(v: string): v is TaskSource {
  return SOURCES.includes(v as TaskSource);
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  source: string;
  wishlist_ref: string | null;
  notes: string | null;
  list_id: string | null;
  kind: string | null;
  fix_route: string | null;
  fix_tool: string | null;
}

export function rowToTask(row: TaskRow): Task {
  // Be lenient with categories so a single bad row (e.g. an AI-generated
  // task that picked an enum value we no longer accept) does not poison
  // the entire list. Status / priority / source still throw because
  // those drive UI behaviour and silent fallback would mask real bugs.
  const category = isTaskCategory(row.category) ? row.category : 'general';
  if (!isTaskStatus(row.status)) throw new Error(`Invalid status: ${row.status}`);
  if (!isTaskPriority(row.priority)) throw new Error(`Invalid priority: ${row.priority}`);
  if (!isTaskSource(row.source)) throw new Error(`Invalid source: ${row.source}`);
  const due = row.due_date;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    category,
    status: row.status,
    priority: row.priority,
    dueDate: due ? due.slice(0, 10) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.source,
    wishlistRef: row.wishlist_ref ?? undefined,
    notes: row.notes ?? undefined,
    listId: row.list_id ?? undefined,
    kind: (row.kind === 'review' ? 'review' : 'action') as 'action' | 'review',
    fixRoute: row.fix_route ?? undefined,
    fixTool: row.fix_tool ?? undefined,
  };
}

interface ListRow {
  id: string;
  name: string;
  created_at: string;
}

export async function listTasksAndLists(
  supabase: SupabaseClient,
): Promise<{ tasks: Task[]; lists: CustomList[] }> {
  const [listsRes, tasksRes] = await Promise.all([
    supabase.from('task_lists').select('id, name, created_at').order('created_at', { ascending: true }),
    supabase.from('tasks').select('*').order('updated_at', { ascending: false }),
  ]);
  if (listsRes.error) throw new Error(listsRes.error.message);
  if (tasksRes.error) throw new Error(tasksRes.error.message);

  const lists: CustomList[] = ((listsRes.data ?? []) as ListRow[]).map((r) => ({
    id: r.id,
    name: r.name,
  }));
  const tasks: Task[] = ((tasksRes.data ?? []) as TaskRow[]).map((r) => rowToTask(r));
  return { tasks, lists };
}

export async function countOpenTasks(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'done');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export interface AssistantTaskSummary {
  openTasks: number;
  urgentTasks: number;
  todayTasks: number;
}

export async function getAssistantTaskSummary(
  supabase: SupabaseClient,
  todayYmd: string,
): Promise<AssistantTaskSummary> {
  const { data, error } = await supabase
    .from('tasks')
    .select('status, priority, due_date');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Pick<TaskRow, 'status' | 'priority' | 'due_date'>[];
  let openTasks = 0;
  let urgentTasks = 0;
  let todayTasks = 0;
  for (const r of rows) {
    if (r.status === 'done') continue;
    openTasks += 1;
    if (r.priority === 'urgent') urgentTasks += 1;
    const d = r.due_date;
    if (d && d.slice(0, 10) === todayYmd) todayTasks += 1;
  }
  return { openTasks, urgentTasks, todayTasks };
}

export async function insertTask(
  supabase: SupabaseClient,
  input: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> & { listId?: string },
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      status: input.status,
      priority: input.priority,
      due_date: input.dueDate ?? null,
      source: input.source,
      wishlist_ref: input.wishlistRef ?? null,
      notes: input.notes ?? null,
      list_id: input.listId ?? null,
      kind: input.kind ?? 'action',
      fix_route: input.fixRoute ?? null,
      fix_tool: input.fixTool ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToTask(data as TaskRow);
}

export async function updateTaskById(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<
    Pick<
      Task,
      | 'title'
      | 'description'
      | 'category'
      | 'status'
      | 'priority'
      | 'dueDate'
      | 'wishlistRef'
      | 'notes'
      | 'listId'
      | 'kind'
      | 'fixRoute'
      | 'fixTool'
    >
  >,
): Promise<Task> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description ?? null;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate ?? null;
  if (patch.wishlistRef !== undefined) row.wishlist_ref = patch.wishlistRef ?? null;
  if (patch.notes !== undefined) row.notes = patch.notes ?? null;
  if (patch.listId !== undefined) row.list_id = patch.listId ?? null;
  if (patch.kind !== undefined) row.kind = patch.kind ?? null;
  if (patch.fixRoute !== undefined) row.fix_route = patch.fixRoute ?? null;
  if (patch.fixTool !== undefined) row.fix_tool = patch.fixTool ?? null;

  const { data, error } = await supabase.from('tasks').update(row).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return rowToTask(data as TaskRow);
}

export async function deleteTaskById(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function insertTaskList(
  supabase: SupabaseClient,
  name: string,
): Promise<CustomList> {
  const { data, error } = await supabase
    .from('task_lists')
    .insert({ name: name.trim() })
    .select('id, name')
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, name: data.name as string };
}

export async function deleteTaskList(supabase: SupabaseClient, listId: string): Promise<void> {
  const { error: uErr } = await supabase.from('tasks').update({ list_id: null }).eq('list_id', listId);
  if (uErr) throw new Error(uErr.message);
  const { error: dErr } = await supabase.from('task_lists').delete().eq('id', listId);
  if (dErr) throw new Error(dErr.message);
}
