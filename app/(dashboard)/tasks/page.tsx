import { TopBar } from '@/components/sidebar/TopBar';
import { TasksClient } from '@/components/tasks/TasksClient';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { countOpenTasks, listTasksAndLists } from '@/lib/tasks/repository';
import { runTaskAutoResolution } from '@/lib/tasks/autoResolve';

// Always render fresh: this page is a write-target for auto-resolution
// and a read-target for the system state, so static caching is the
// wrong default here.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TasksPage() {
  const todayYmd = new Date().toISOString().slice(0, 10);
  const supabase = createSupabaseAdmin();

  let initialTasks: Awaited<ReturnType<typeof listTasksAndLists>>['tasks'] = [];
  let initialLists: Awaited<ReturnType<typeof listTasksAndLists>>['lists'] = [];
  let open = 0;
  let configured = false;
  let autoResolvedCount = 0;

  if (supabase) {
    try {
      // Auto-resolve any tasks whose underlying fix is already done in
      // another surface (e.g. the SEO meta coverage task once Shopify
      // shows zero missing meta). Best-effort: if it errors we still
      // render the rest of the page.
      try {
        const r = await runTaskAutoResolution(supabase);
        autoResolvedCount = r.completedIds.length;
      } catch {
        // ignore
      }

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
            ? open + ' open' + (autoResolvedCount > 0 ? ', ' + autoResolvedCount + ' auto-closed since last visit' : '') + ' — the Evari execution layer'
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
