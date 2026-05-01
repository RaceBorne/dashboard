/**
 * lib/tasks/autoResolve.ts
 *
 * "Did the operator quietly fix this somewhere else?" check that runs
 * each time the /tasks page is rendered. Walks every open action-kind
 * task and, for the rules we trust, checks the underlying system state.
 * If the work the task describes has already been done (e.g. all SEO
 * meta titles are now set in Shopify), the task is auto-marked as done
 * with a note explaining why — so Mad Dog doesn't have to come back to
 * /tasks and tick things off by hand.
 *
 * Conservative on purpose: only auto-resolves when the underlying
 * count is genuinely zero. Anything more interpretive (review-kind
 * tasks, "audit X") stays manual.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Task } from '@/lib/types';
import { listTasksAndLists, updateTaskById } from '@/lib/tasks/repository';
import { getPagesOverview } from '@/lib/pages/overview';

export interface AutoResolveResult {
  /** Total open action tasks we considered. */
  considered: number;
  /** IDs of tasks we just auto-completed. */
  completedIds: string[];
  /** Plain-English reasons keyed by task id, for surfacing later. */
  reasons: Record<string, string>;
}

/**
 * Run the auto-resolution pass. Returns the IDs of tasks we just
 * closed and a reason per id so the UI / a Mojito reply can explain
 * what happened. Safe to call on every render — the work is one
 * Supabase select + at most one Shopify list call when there's an
 * SEO-meta task in flight.
 */
export async function runTaskAutoResolution(
  supabase: SupabaseClient,
): Promise<AutoResolveResult> {
  const result: AutoResolveResult = {
    considered: 0,
    completedIds: [],
    reasons: {},
  };

  let tasks: Task[] = [];
  try {
    const data = await listTasksAndLists(supabase);
    tasks = data.tasks.filter(
      (t) => t.kind === 'action' && (t.status === 'planned' || t.status === 'in-progress'),
    );
  } catch {
    return result;
  }
  result.considered = tasks.length;
  if (tasks.length === 0) return result;

  // Heuristic: which tasks look like SEO-meta-coverage tasks?
  const metaTitleTasks: Task[] = [];
  const metaDescTasks: Task[] = [];
  const metaBothTasks: Task[] = [];

  for (const t of tasks) {
    if (t.category !== 'seo') continue;
    const title = (t.title || '').toLowerCase();
    if (title.includes('meta title') && title.includes('meta description')) {
      metaBothTasks.push(t);
    } else if (title.includes('meta title')) {
      metaTitleTasks.push(t);
    } else if (title.includes('meta description')) {
      metaDescTasks.push(t);
    } else if (
      title.includes('missing meta') ||
      title.includes('missing metadata') ||
      title.includes('meta tags')
    ) {
      metaBothTasks.push(t);
    } else if (title.includes('meta coverage')) {
      metaBothTasks.push(t);
    }
  }

  const seoTasks = [...metaTitleTasks, ...metaDescTasks, ...metaBothTasks];
  if (seoTasks.length === 0) return result;

  // Pull current page-state once.
  let missingTitle = -1;
  let missingDesc = -1;
  try {
    const overview = await getPagesOverview();
    missingTitle = overview.totals.missingMetaTitle;
    missingDesc = overview.totals.missingMetaDesc;
  } catch {
    // If we can't read the overview we can't auto-resolve. Bail.
    return result;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const noteSuffix = ' (auto-resolved on ' + stamp + ' because all flagged pages now have their meta set in Shopify).';

  async function complete(t: Task, reason: string) {
    try {
      const nextNotes = (t.notes ? t.notes + '\n\n' : '') + reason + noteSuffix;
      await updateTaskById(supabase, t.id, { status: 'done', notes: nextNotes });
      result.completedIds.push(t.id);
      result.reasons[t.id] = reason;
    } catch {
      // best-effort
    }
  }

  for (const t of metaTitleTasks) {
    if (missingTitle === 0) {
      await complete(
        t,
        'Auto-resolved: every page in the catalogue now has a meta title.',
      );
    }
  }
  for (const t of metaDescTasks) {
    if (missingDesc === 0) {
      await complete(
        t,
        'Auto-resolved: every page in the catalogue now has a meta description.',
      );
    }
  }
  for (const t of metaBothTasks) {
    if (missingTitle === 0 && missingDesc === 0) {
      await complete(
        t,
        'Auto-resolved: every page in the catalogue now has both a meta title and a meta description.',
      );
    }
  }

  return result;
}
