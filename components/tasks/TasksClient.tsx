'use client';

import { useMemo, useState } from 'react';
import {
 Search,
 ShoppingBag,
 Inbox,
 Megaphone,
 FileText,
 Heart,
 MessageSquare,
 Boxes,
 Wrench,
 Sparkles,
 FolderKanban,
 Plus,
 Circle,
 CircleCheck,
 CircleDot,
 CircleSlash,
 CircleDashed,
 AlertTriangle,
 ListTodo,
 X,
 Pencil,
 Trash2,
} from 'lucide-react';
import {
 Task,
 TaskCategory,
 TaskPriority,
 TaskStatus,
 CustomList,
} from '@/lib/types';
import {
 MOCK_TASKS,
 TASK_CATEGORY_META,
 TASK_CATEGORY_ORDER,
 TaskCategoryMeta,
} from '@/lib/mock/tasks';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PillTabs } from '@/components/ui/pill-tabs';
import { StatStrip } from '@/components/ui/stat-strip';
import {
  MonthCalendar,
  type CalendarEvent,
  type CalendarEventTone,
} from '@/components/ui/month-calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';

// ----------------------------------------------------------------------------
// Icon lookup for the category meta (lucide components aren't serialisable, so
// the meta holds their name and we resolve here).

const ICONS: Record<TaskCategoryMeta['icon'], typeof Search> = {
 Search,
 ShoppingBag,
 Inbox,
 Megaphone,
 FileText,
 Heart,
 MessageSquare,
 Boxes,
 Wrench,
 Sparkles,
 FolderKanban,
};

// ----------------------------------------------------------------------------
// Date bucketing — groups tasks into natural review windows.

const BUCKET_ORDER = [
 'Overdue',
 'Today',
 'Tomorrow',
 'This week',
 'Next week',
 'Later',
 'Unscheduled',
] as const;
type Bucket = (typeof BUCKET_ORDER)[number];

function bucketFor(dueDate: string | undefined, todayYmd: string): Bucket {
 if (!dueDate) return 'Unscheduled';
 const due = new Date(dueDate + 'T00:00:00Z');
 const today = new Date(todayYmd + 'T00:00:00Z');
 const diff = Math.round(
  (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
 );
 if (diff < 0) return 'Overdue';
 if (diff === 0) return 'Today';
 if (diff === 1) return 'Tomorrow';
 if (diff <= 7) return 'This week';
 if (diff <= 14) return 'Next week';
 return 'Later';
}

function fmtDate(yyyyMmDd: string): string {
 const d = new Date(yyyyMmDd + 'T00:00:00Z');
 return d.toLocaleDateString('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
 });
}

// Cycle through statuses when the circle is clicked.
const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
 proposed: 'planned',
 planned: 'in-progress',
 'in-progress': 'done',
 done: 'proposed',
 blocked: 'proposed',
};

function StatusIcon({ status }: { status: TaskStatus }) {
 switch (status) {
  case 'proposed':
   return <CircleDashed className="h-4 w-4 text-evari-dimmer" />;
  case 'planned':
   return <Circle className="h-4 w-4 text-evari-dim" />;
  case 'in-progress':
   return <CircleDot className="h-4 w-4 text-evari-gold" />;
  case 'done':
   return <CircleCheck className="h-4 w-4 text-evari-success" />;
  case 'blocked':
   return <CircleSlash className="h-4 w-4 text-evari-warn" />;
 }
}

// Priority lozenges: full pill shape, solid fills, no outlines.
// Urgent = crimson (deep red), high = amber, medium = white, low = muted grey.
const PRIORITY_STYLE: Record<TaskPriority, string> = {
 urgent: 'bg-evari-crimson text-white',
 high: 'bg-evari-warn text-evari-ink',
 medium: 'bg-evari-text text-evari-ink',
 low: 'bg-evari-dim text-evari-ink',
};

// ----------------------------------------------------------------------------

// Active filter: 'all', a category key, or 'list:<id>' for a custom list.
type ActiveFilter = 'all' | TaskCategory | `list:${string}`;

export function TasksClient({ today }: { today: string }) {
 const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS);
 const [customLists, setCustomLists] = useState<CustomList[]>([]);
 const [newListName, setNewListName] = useState('');
 const [addingList, setAddingList] = useState(false);
 const [activeCategory, setActiveCategory] = useState<ActiveFilter>('all');
 const [showAdd, setShowAdd] = useState(false);
 type CompletedDisplay = 'hide' | 'strike';
 const [completedDisplay, setCompletedDisplay] = useState<CompletedDisplay>('hide');
 const [view, setView] = useState<'list' | 'calendar'>('list');
 const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
 const [editingTask, setEditingTask] = useState<Task | null>(null);
 const confirm = useConfirm();

 // -------- derived state ---------------------------------------------------

 const countsByCategory = useMemo(() => {
  const c: Record<string, { open: number; total: number }> = {
   all: { open: 0, total: 0 },
  };
  for (const cat of TASK_CATEGORY_ORDER) c[cat] = { open: 0, total: 0 };
  for (const t of tasks) {
   c.all.total += 1;
   c[t.category].total += 1;
   if (t.status !== 'done') {
    c.all.open += 1;
    c[t.category].open += 1;
   }
  }
  return c;
 }, [tasks]);

 const filtered = useMemo(() => {
  return tasks
   .filter((t) => {
    if (activeCategory === 'all') return true;
    if (activeCategory.startsWith('list:')) {
     return t.listId === activeCategory.slice(5);
    }
    return t.category === activeCategory;
   })
   .filter((t) => (completedDisplay === 'hide' ? t.status !== 'done' : true));
 }, [tasks, activeCategory, completedDisplay]);

 // Counts per custom list
 const listCounts = useMemo(() => {
  const c: Record<string, number> = {};
  for (const l of customLists) c[l.id] = 0;
  for (const t of tasks) {
   if (t.listId && t.status !== 'done') {
    c[t.listId] = (c[t.listId] ?? 0) + 1;
   }
  }
  return c;
 }, [tasks, customLists]);

 const grouped = useMemo(() => {
  const g = new Map<Bucket, Task[]>();
  for (const t of filtered) {
   const b = bucketFor(t.dueDate, today);
   if (!g.has(b)) g.set(b, []);
   g.get(b)!.push(t);
  }
  for (const arr of g.values()) {
   arr.sort((a, b) => {
    // Done tasks always fall to the bottom of their bucket, so completed
    // items (when visible in strike-through mode) drift down and out of the
    // way of live work.
    const aDone = a.status === 'done';
    const bDone = b.status === 'done';
    if (aDone !== bDone) return aDone ? 1 : -1;
    const order = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
    if (order[a.priority] !== order[b.priority])
     return order[a.priority] - order[b.priority];
    return a.title.localeCompare(b.title);
   });
  }
  return g;
 }, [filtered, today]);

 // Map filtered tasks → calendar events (only tasks with a due date)
 const calendarEvents: CalendarEvent[] = useMemo(() => {
  return filtered
   .filter((t) => !!t.dueDate)
   .map((t) => {
    const tone: CalendarEventTone =
     t.status === 'done'
      ? 'success'
      : t.priority === 'urgent'
       ? 'danger'
       : t.priority === 'high'
        ? 'warn'
        : t.status === 'in-progress'
         ? 'accent'
         : 'default';
    return {
     id: t.id,
     date: new Date(t.dueDate + 'T00:00:00'),
     title: t.title,
     tone,
     allDay: false,
    } satisfies CalendarEvent;
   });
 }, [filtered]);

 const stats = useMemo(() => {
  const open = tasks.filter((t) => t.status !== 'done').length;
  const overdue = tasks.filter(
   (t) => t.status !== 'done' && bucketFor(t.dueDate, today) === 'Overdue',
  ).length;
  const todayCount = tasks.filter(
   (t) => t.status !== 'done' && bucketFor(t.dueDate, today) === 'Today',
  ).length;
  const thisWeek = tasks.filter((t) => {
   if (t.status === 'done') return false;
   const b = bucketFor(t.dueDate, today);
   return b === 'Today' || b === 'Tomorrow' || b === 'This week';
  }).length;
  return { open, overdue, todayCount, thisWeek };
 }, [tasks, today]);

 // -------- mutations -------------------------------------------------------

 function cycleStatus(id: string) {
  const apply = () => {
   setTasks((prev) =>
    prev.map((t) =>
     t.id === id
      ? { ...t, status: STATUS_CYCLE[t.status], updatedAt: new Date().toISOString() }
      : t,
    ),
   );
  };
  // When a task changes state (esp. → done), it shuffles to the bottom of
  // its group. View Transitions smoothly animate the reorder in supported
  // browsers; everywhere else it just snaps.
  type DocVT = Document & { startViewTransition?: (cb: () => void) => void };
  const doc = typeof document !== 'undefined' ? (document as DocVT) : undefined;
  if (doc?.startViewTransition) {
   doc.startViewTransition(() => apply());
  } else {
   apply();
  }
 }

 function addTask(input: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'source'>) {
  const now = new Date().toISOString();
  const activeListId = activeCategory.startsWith('list:')
   ? activeCategory.slice(5)
   : input.listId;
  const newTask: Task = {
   ...input,
   id: 't-' + Math.random().toString(36).slice(2, 9),
   createdAt: now,
   updatedAt: now,
   source: 'manual',
   listId: activeListId,
  };
  setTasks((prev) => [newTask, ...prev]);
  setShowAdd(false);
 }

 function updateTask(id: string, changes: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'source'>) {
  const now = new Date().toISOString();
  setTasks((prev) =>
   prev.map((t) => (t.id === id ? { ...t, ...changes, updatedAt: now } : t)),
  );
  setEditingTask(null);
 }

 function createList(name: string) {
  const clean = name.trim();
  if (!clean) return;
  const id = 'l-' + Math.random().toString(36).slice(2, 9);
  setCustomLists((prev) => [...prev, { id, name: clean }]);
  setActiveCategory(('list:' + id) as ActiveFilter);
  setNewListName('');
  setAddingList(false);
 }

 async function deleteList(list: CustomList) {
  const ok = await confirm({
   title: 'Delete list?',
   description: `"${list.name}" will be removed. Tasks in it won't be deleted — they'll just lose the list tag.`,
   confirmLabel: 'Delete',
   tone: 'danger',
  });
  if (!ok) return;
  setCustomLists((prev) => prev.filter((l) => l.id !== list.id));
  setTasks((prev) =>
   prev.map((t) => (t.listId === list.id ? { ...t, listId: undefined } : t)),
  );
  if (activeCategory === 'list:' + list.id) setActiveCategory('all');
 }

 async function deleteTask(task: Task) {
  const ok = await confirm({
   title: 'Delete task?',
   description: `"${task.title}" will be removed permanently.`,
   confirmLabel: 'Delete',
   tone: 'danger',
  });
  if (!ok) return;
  setTasks((prev) => prev.filter((t) => t.id !== task.id));
 }

 // -------- render ----------------------------------------------------------

 return (
  <div className="flex gap-5 p-6 max-w-[1400px]">
   {/* Category folders */}
   <aside className="w-56 shrink-0">
    <div className="sticky top-4 space-y-4">
     {/* My lists — user-defined, sits above the fixed folders */}
     <div>
      <div className="flex items-center justify-between px-1 pb-2">
       <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer font-medium">
        My lists
       </div>
       <button
        type="button"
        aria-label="New list"
        title="New list"
        onClick={() => setAddingList(true)}
        className="h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
       >
        <Plus className="h-3 w-3" />
       </button>
      </div>
      <div className="space-y-0.5">
       {customLists.map((l) => {
        const key = ('list:' + l.id) as ActiveFilter;
        return (
         <div key={l.id} className="group relative">
          <FolderButton
           label={l.name}
           icon={<ListTodo className="h-4 w-4" />}
           count={listCounts[l.id] ?? 0}
           active={activeCategory === key}
           onClick={() => setActiveCategory(key)}
           accent="text-evari-dim"
          />
          <button
           type="button"
           aria-label={'Delete list ' + l.name}
           title="Delete list"
           onClick={(e) => {
            e.stopPropagation();
            void deleteList(l);
           }}
           className="absolute top-1 right-1 h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-danger hover:bg-evari-surfaceSoft opacity-0 group-hover:opacity-100 transition-opacity"
          >
           <Trash2 className="h-3 w-3" />
          </button>
         </div>
        );
       })}
       {addingList ? (
        <form
         onSubmit={(e) => {
          e.preventDefault();
          createList(newListName);
         }}
         className="px-1"
        >
         <input
          autoFocus
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          onBlur={() => {
           if (newListName.trim()) createList(newListName);
           else setAddingList(false);
          }}
          placeholder="List name…"
          className="w-full bg-evari-surfaceSoft rounded px-2 py-1 text-sm text-evari-text focus:outline-none focus:ring-1 focus:ring-evari-gold/50"
         />
        </form>
       ) : customLists.length === 0 ? (
        <button
         type="button"
         onClick={() => setAddingList(true)}
         className="w-full flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-evari-dimmer hover:text-evari-text hover:bg-evari-surface/60 text-left italic"
        >
         <Plus className="h-3.5 w-3.5" />
         New list
        </button>
       ) : null}
      </div>
     </div>

     <div>
      <div className="px-1 pb-2 text-[10px] uppercase tracking-[0.16em] text-evari-dimmer font-medium">
       Folders
      </div>
      <div className="space-y-0.5">
       <FolderButton
        label="All tasks"
        icon={<ListTodo className="h-4 w-4" />}
        count={countsByCategory.all.open}
        active={activeCategory === 'all'}
        onClick={() => setActiveCategory('all')}
        accent="text-evari-text"
       />
       {TASK_CATEGORY_ORDER.map((key) => {
        const meta = TASK_CATEGORY_META[key];
        const Icon = ICONS[meta.icon];
        return (
         <FolderButton
          key={key}
          label={meta.label}
          icon={<Icon className="h-4 w-4" />}
          count={countsByCategory[key].open}
          active={activeCategory === key}
          onClick={() => setActiveCategory(key)}
          accent={meta.accent}
         />
        );
       })}
      </div>
     </div>

     <div className="pt-3 space-y-1">
      <label className="flex items-center gap-2 px-2 text-xs text-evari-dim cursor-pointer">
       <input
        type="radio"
        name="completed-display"
        className="accent-evari-gold"
        checked={completedDisplay === 'hide'}
        onChange={() => setCompletedDisplay('hide')}
       />
       Hide completed
      </label>
      <label className="flex items-center gap-2 px-2 text-xs text-evari-dim cursor-pointer">
       <input
        type="radio"
        name="completed-display"
        className="accent-evari-gold"
        checked={completedDisplay === 'strike'}
        onChange={() => setCompletedDisplay('strike')}
       />
       Show strike-through
      </label>
     </div>
    </div>
   </aside>

   {/* Main list */}
   <main className="flex-1 min-w-0 space-y-5">
    {/* Stats strip — borderless inline row with a subline per stat */}
    <StatStrip
     stats={[
      {
       label: 'Open',
       value: stats.open,
       hint: stats.open === 1 ? 'task to tackle' : 'tasks to tackle',
      },
      {
       label: 'Overdue',
       value: stats.overdue,
       tone: stats.overdue > 0 ? 'text-evari-danger' : undefined,
       hint: stats.overdue > 0 ? 'past their due date' : 'nothing late',
      },
      {
       label: 'Today',
       value: stats.todayCount,
       hint: stats.todayCount > 0 ? 'due by end of day' : 'nothing due today',
      },
      {
       label: 'This week',
       value: stats.thisWeek,
       hint: 'through next seven days',
      },
     ]}
    />

    {/* Header */}
    <div className="flex items-center justify-between gap-3">
     <h2 className="text-sm font-medium text-evari-text">
      {activeCategory === 'all'
       ? 'All tasks'
       : activeCategory.startsWith('list:')
        ? customLists.find((l) => l.id === activeCategory.slice(5))?.name ?? 'List'
        : TASK_CATEGORY_META[activeCategory as TaskCategory].label}
     </h2>
     <div className="flex items-center gap-2">
      <PillTabs
       size="sm"
       value={view}
       onChange={(v) => setView(v)}
       options={[
        { value: 'list', label: 'List' },
        { value: 'calendar', label: 'Calendar' },
       ]}
      />
      <Button
       size="sm"
       variant="primary"
       onClick={() => setShowAdd((v) => !v)}
      >
       {showAdd ? (
        <>
         <X className="h-3.5 w-3.5" /> Cancel
        </>
       ) : (
        <>
         <Plus className="h-3.5 w-3.5" /> Add task
        </>
       )}
      </Button>
     </div>
    </div>

    {showAdd && (
     <AddTaskForm
      defaultCategory={
       activeCategory === 'all' || activeCategory.startsWith('list:')
        ? 'general'
        : (activeCategory as TaskCategory)
      }
      today={today}
      onSubmit={addTask}
      onCancel={() => setShowAdd(false)}
     />
    )}

    {view === 'list' ? (
     <>
      {/* Grouped tasks */}
      {BUCKET_ORDER.map((b) => {
       const items = grouped.get(b);
       if (!items || items.length === 0) return null;
       return (
        <section key={b}>
         <div
          className={cn(
           'flex items-center gap-2 px-1 pb-2 text-[11px] uppercase tracking-[0.14em] font-medium',
           b === 'Overdue' ? 'text-evari-danger' : 'text-evari-dimmer',
          )}
         >
          {b === 'Overdue' && <AlertTriangle className="h-3 w-3" />}
          <span>{b}</span>
          <span className="text-evari-dimmer/60 font-mono">
           {items.length}
          </span>
         </div>
         <ul className="space-y-1">
          {items.map((t) => (
           <TaskRow
            key={t.id}
            task={t}
            onCycle={() => cycleStatus(t.id)}
            onEdit={() => setEditingTask(t)}
            onDelete={() => deleteTask(t)}
           />
          ))}
         </ul>
        </section>
       );
      })}

      {filtered.length === 0 && (
       <div className="rounded-xl bg-evari-surface p-10 text-center">
        <div className="text-sm text-evari-dim">Nothing here yet.</div>
        <div className="text-xs text-evari-dimmer mt-1">
         Add a task to get started.
        </div>
       </div>
      )}
     </>
    ) : (
     <div className="min-h-[640px] flex flex-col">
      <MonthCalendar
       events={calendarEvents}
       month={calendarMonth}
       onMonthChange={setCalendarMonth}
      />
     </div>
    )}
   </main>

   {/* Edit dialog — same form as Add, pre-filled */}
   <Dialog
    open={editingTask != null}
    onOpenChange={(open) => { if (!open) setEditingTask(null); }}
   >
    {editingTask && (
     <DialogContent className="max-w-lg">
      <DialogHeader>
       <DialogTitle>Edit task</DialogTitle>
      </DialogHeader>
      <AddTaskForm
       defaultCategory={editingTask.category}
       today={today}
       initialTask={editingTask}
       submitLabel="Save changes"
       onSubmit={(changes) => updateTask(editingTask.id, changes)}
       onCancel={() => setEditingTask(null)}
      />
     </DialogContent>
    )}
   </Dialog>
  </div>
 );
}

// ----------------------------------------------------------------------------
// Sub-components

function FolderButton({
 label,
 icon,
 count,
 active,
 onClick,
 accent,
}: {
 label: string;
 icon: React.ReactNode;
 count: number;
 active: boolean;
 onClick: () => void;
 accent: string;
}) {
 return (
  <button
   onClick={onClick}
   className={cn(
    'w-full flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors text-left',
    active
     ? 'bg-evari-surfaceSoft text-evari-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
     : 'text-evari-dim hover:bg-evari-surface/60 hover:text-evari-text',
   )}
  >
   <span className={cn('shrink-0', active ? 'text-evari-text' : accent)}>
    {icon}
   </span>
   <span className="flex-1 truncate">{label}</span>
   {count > 0 && (
    <span
     className={cn(
      'inline-flex items-center justify-center h-5 min-w-[20px] px-1 text-[10px] tabular-nums rounded-full',
      active
       ? 'bg-evari-surfaceSoft text-evari-dim'
       : 'bg-evari-surface/60 text-evari-dimmer',
     )}
    >
     {count > 99 ? '99+' : count}
    </span>
   )}
  </button>
 );
}

function _UnusedStat({
 label,
 value,
 tone,
}: {
 label: string;
 value: number;
 tone?: 'warn';
}) {
 // Replaced by the shared StatStrip primitive. Kept temporarily until this
 // pattern is confirmed in place across all pages, then can be removed.
 return (
  <div className="rounded-xl bg-evari-surface px-5 py-4">
   <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
    {label}
   </div>
   <div
    className={cn(
     'text-2xl font-semibold tabular-nums mt-1 tracking-tight',
     tone === 'warn' && value > 0 ? 'text-evari-danger' : 'text-evari-text',
    )}
   >
    {value}
   </div>
  </div>
 );
}

function TaskRow({
 task,
 onCycle,
 onEdit,
 onDelete,
}: {
 task: Task;
 onCycle: () => void;
 onEdit: () => void;
 onDelete: () => void;
}) {
 const meta = TASK_CATEGORY_META[task.category];
 const Icon = ICONS[meta.icon];

 return (
  <li className="group bg-evari-surface/60 rounded-md relative">
   {/* Hover-reveal edit/delete — tucked into the top-right corner */}
   <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
    <button
     type="button"
     aria-label="Edit task"
     title="Edit"
     onClick={(e) => { e.stopPropagation(); onEdit(); }}
     className="h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft transition-colors"
    >
     <Pencil className="h-3 w-3" />
    </button>
    <button
     type="button"
     aria-label="Delete task"
     title="Delete"
     onClick={(e) => { e.stopPropagation(); onDelete(); }}
     className="h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-danger hover:bg-evari-surfaceSoft transition-colors"
    >
     <Trash2 className="h-3 w-3" />
    </button>
   </div>
   <div className="flex items-start gap-3 px-4 py-3 hover:bg-evari-surface transition-colors rounded-md">
    <button
     onClick={onCycle}
     aria-label="Cycle status"
     className="mt-0.5 shrink-0 hover:scale-110 transition-transform"
     title={task.status}
    >
     <StatusIcon status={task.status} />
    </button>

    <div className="flex-1 min-w-0">
     <div className="flex items-center gap-2 min-w-0">
      <span
       className={cn(
        'text-sm truncate',
        task.status === 'done'
         ? 'line-through text-evari-dimmer'
         : 'text-evari-text',
       )}
      >
       {task.title}
      </span>
     </div>
     {task.description && (
      <div className="text-xs text-evari-dim mt-0.5 leading-relaxed">
       {task.description}
      </div>
     )}
     <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      <span
       className={cn(
        'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-evari-surfaceSoft text-evari-dim',
       )}
      >
       <Icon className={cn('h-3 w-3', meta.accent)} />
       {meta.label}
      </span>
      <span
       className={cn(
        'text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider',
        PRIORITY_STYLE[task.priority],
       )}
      >
       {task.priority}
      </span>
      {task.wishlistRef && (
       <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-evari-surfaceSoft text-evari-dimmer font-mono">
        wishlist {task.wishlistRef}
       </span>
      )}
      {task.source === 'discussion' && (
       <span className="text-[10px] text-evari-dimmer/70 italic">
        from discussion
       </span>
      )}
     </div>
    </div>

    <div className="shrink-0 text-right pr-10">
     {task.dueDate ? (
      <div className="text-[11px] text-evari-dim font-mono tabular-nums">
       {fmtDate(task.dueDate)}
      </div>
     ) : (
      <div className="text-[11px] text-evari-dimmer italic">no date</div>
     )}
    </div>
   </div>
  </li>
 );
}

function AddTaskForm({
 defaultCategory,
 today,
 initialTask,
 submitLabel = 'Add task',
 onSubmit,
 onCancel,
}: {
 defaultCategory: TaskCategory;
 today: string;
 initialTask?: Task;
 submitLabel?: string;
 onSubmit: (input: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'source'>) => void;
 onCancel: () => void;
}) {
 const [title, setTitle] = useState(initialTask?.title ?? '');
 const [description, setDescription] = useState(initialTask?.description ?? '');
 const [category, setCategory] = useState<TaskCategory>(
  initialTask?.category ?? defaultCategory,
 );
 const [priority, setPriority] = useState<TaskPriority>(initialTask?.priority ?? 'medium');
 const [dueDate, setDueDate] = useState(initialTask?.dueDate ?? today);
 const [status, setStatus] = useState<TaskStatus>(initialTask?.status ?? 'planned');

 function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!title.trim()) return;
  onSubmit({
   title: title.trim(),
   description: description.trim() || undefined,
   category,
   priority,
   dueDate: dueDate || undefined,
   status,
   wishlistRef: initialTask?.wishlistRef,
   notes: initialTask?.notes,
  });
 }

 return (
  <form
   onSubmit={handleSubmit}
   className="rounded-xl bg-evari-surface p-4 space-y-3"
  >
   <Input
    autoFocus
    placeholder="What needs doing?"
    value={title}
    onChange={(e) => setTitle(e.target.value)}
   />
   <Textarea
    placeholder="Extra detail (optional)"
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    className="min-h-[60px] text-sm"
   />

   <div className="grid grid-cols-4 gap-3">
    <FieldLabel label="Folder">
     <select
      value={category}
      onChange={(e) => setCategory(e.target.value as TaskCategory)}
      className="w-full bg-evari-surface/70 rounded-md px-2 py-1.5 text-sm text-evari-text focus:outline-none focus:ring-1 focus:ring-evari-gold/50"
     >
      {TASK_CATEGORY_ORDER.map((k) => (
       <option key={k} value={k}>
        {TASK_CATEGORY_META[k].label}
       </option>
      ))}
     </select>
    </FieldLabel>

    <FieldLabel label="Priority">
     <select
      value={priority}
      onChange={(e) => setPriority(e.target.value as TaskPriority)}
      className="w-full bg-evari-surface/70 rounded-md px-2 py-1.5 text-sm text-evari-text focus:outline-none focus:ring-1 focus:ring-evari-gold/50"
     >
      <option value="urgent">Urgent</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
     </select>
    </FieldLabel>

    <FieldLabel label="Status">
     <select
      value={status}
      onChange={(e) => setStatus(e.target.value as TaskStatus)}
      className="w-full bg-evari-surface/70 rounded-md px-2 py-1.5 text-sm text-evari-text focus:outline-none focus:ring-1 focus:ring-evari-gold/50"
     >
      <option value="proposed">Proposed</option>
      <option value="planned">Planned</option>
      <option value="in-progress">In progress</option>
      <option value="blocked">Blocked</option>
      <option value="done">Done</option>
     </select>
    </FieldLabel>

    <FieldLabel label="Due date">
     <input
      type="date"
      value={dueDate}
      onChange={(e) => setDueDate(e.target.value)}
      className="w-full bg-evari-surface/70 rounded-md px-2 py-1.5 text-sm text-evari-text focus:outline-none focus:ring-1 focus:ring-evari-gold/50"
     />
    </FieldLabel>
   </div>

   <div className="flex justify-end gap-2 pt-1">
    <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
     Cancel
    </Button>
    <Button type="submit" size="sm" variant="primary">
     {submitLabel}
    </Button>
   </div>
  </form>
 );
}

function FieldLabel({
 label,
 children,
}: {
 label: string;
 children: React.ReactNode;
}) {
 return (
  <label className="space-y-1">
   <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
    {label}
   </span>
   {children}
  </label>
 );
}
