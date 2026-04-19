import { TopBar } from '@/components/sidebar/TopBar';
import { TasksClient } from '@/components/tasks/TasksClient';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { countOpenTasks, listTasksAndLists } from '@/lib/tasks/repository';

export default async function TasksPage() {
  const todayYmd = new Date().toISOString().slice(0, 10);
  const supabase = createSupabaseAdmin();

  let initialTasks: Awaited<ReturnType<typeof listTasksAndLists>>['tasks'] = [];
  let initialLists: Awaited<ReturnType<typeof listTasksAndLists>>['lists'] = [];
  let open = 0;
  let configured = false;

  if (supabase) {
    try {
      const data = await listTasksAndLists(supabase);
      initialTasks = data.tasks;
      initialLists = data.lists;
      open = await countOpenTasks(supabase);
      configured = true;
    } catch {
      configured = false;
    }
  }

  return (
    <>
      <TopBar
        title="To-do"
        subtitle={
          configured
            ? `${open} open — the Evari execution layer`
            : 'Connect Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) to load tasks'
        }
      />
      {!configured ? (
        <div className="mx-6 mb-4 rounded-lg border border-evari-warn/40 bg-evari-warn/10 px-4 py-3 text-sm text-evari-text">
          Tasks are stored in Supabase. Add env vars and run the migration in{' '}
          <code className="font-mono text-xs">supabase/migrations/</code> to see live data.
        </div>
      ) : null}
      <TasksClient today={todayYmd} initialTasks={initialTasks} initialLists={initialLists} />
    </>
  );
}
