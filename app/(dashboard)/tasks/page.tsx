import { TopBar } from '@/components/sidebar/TopBar';
import { TasksClient } from '@/components/tasks/TasksClient';
import { MOCK_TASKS } from '@/lib/mock/tasks';

export default function TasksPage() {
  const todayYmd = new Date().toISOString().slice(0, 10);
  const open = MOCK_TASKS.filter((t) => t.status !== 'done').length;

  return (
    <>
      <TopBar
        title="To-do"
        subtitle={`${open} open — the Evari execution layer`}
      />
      <TasksClient today={todayYmd} />
    </>
  );
}
