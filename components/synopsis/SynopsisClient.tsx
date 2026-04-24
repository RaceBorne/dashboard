'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  ListPlus,
  Loader2,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Wand2,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type {
  Synopsis,
  SynopsisEnhancement,
  SynopsisIssue,
  SynopsisEnhanceKind,
  SynopsisTaskCategory,
  SynopsisTaskPriority,
} from '@/lib/synopsis/analyse';

interface NarrativeAction {
  title: string;
  detail: string;
  category: SynopsisTaskCategory;
  priority: SynopsisTaskPriority;
}

interface NarrativeGroupChild {
  title: string;
  description: string;
  category: SynopsisTaskCategory;
  priority: SynopsisTaskPriority;
}

interface NarrativeGroup {
  id: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  subject: string;
  children: NarrativeGroupChild[];
}

/**
 * SynopsisClient
 *
 *   1. Header with a Refresh button. Refresh hard-reloads the page so
 *      every source of truth is re-read + the narrative is regenerated.
 *   2. Narrative paragraph fetched from /api/synopsis/narrative. Shown
 *      above the bullet summary. This is the human-facing "what's going
 *      on with the site" assessment.
 *   3. Deterministic bullet summary (unchanged).
 *   4. Fix list — one-click fixes for missing meta, plus manual-guide
 *      items for scan findings.
 *   5. Enhance list — broader improvements. Each row runs a flow:
 *        keywords-research → confirmation modal → keywords-apply
 *        meta-rewrite      → confirmation modal → meta-rewrite apply
 *        internal-links    → proposals modal (review only)
 *        blog-topics       → proposals modal (copy-to-clipboard)
 */
export function SynopsisClient({ synopsis }: { synopsis: Synopsis }) {
  const router = useRouter();
  const [issues, setIssues] = useState<SynopsisIssue[]>(synopsis.issues);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fixed, setFixed] = useState<Record<string, { title?: string; description?: string }>>({});
  const [fixAllRunning, setFixAllRunning] = useState(false);
  const fixAllAbortRef = useRef(false);

  // Narrative state: fetched async so the page renders immediately.
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeActions, setNarrativeActions] = useState<NarrativeAction[]>([]);
  const [narrativeGroups, setNarrativeGroups] = useState<NarrativeGroup[]>([]);
  const [narrativeBusy, setNarrativeBusy] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const [narrativeAt, setNarrativeAt] = useState<string | null>(null);

  // Enhance modal state: which executable enhancement is open.
  const [activeEnhance, setActiveEnhance] = useState<SynopsisEnhanceKind | null>(null);

  // Which group rows are currently expanded in the Enhance list.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // IDs of rows that have been successfully added as todos. Sticky so the
  // button stays green and disabled after a click.
  const [addedTodos, setAddedTodos] = useState<Set<string>>(new Set());
  const [addingTodos, setAddingTodos] = useState<Set<string>>(new Set());
  const [todoErrors, setTodoErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadNarrative();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadNarrative() {
    setNarrativeBusy(true);
    setNarrativeError(null);
    try {
      const res = await fetch('/api/synopsis/narrative', { method: 'POST' });
      const data = (await res.json()) as {
        ok?: boolean;
        narrative?: string;
        actions?: NarrativeAction[];
        groups?: NarrativeGroup[];
        generatedAt?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.narrative) {
        throw new Error(data.error ?? 'Narrative unavailable');
      }
      setNarrative(data.narrative);
      setNarrativeActions(Array.isArray(data.actions) ? data.actions : []);
      setNarrativeGroups(Array.isArray(data.groups) ? data.groups : []);
      setNarrativeAt(data.generatedAt ?? new Date().toISOString());
    } catch (err) {
      setNarrativeError(err instanceof Error ? err.message : 'Narrative failed');
    } finally {
      setNarrativeBusy(false);
    }
  }

  async function addTodo(args: {
    id: string;
    title: string;
    description: string;
    category: SynopsisTaskCategory;
    priority: SynopsisTaskPriority;
  }): Promise<boolean> {
    if (addedTodos.has(args.id) || addingTodos.has(args.id)) return false;
    setAddingTodos((prev) => {
      const n = new Set(prev);
      n.add(args.id);
      return n;
    });
    setTodoErrors((prev) => {
      const n = { ...prev };
      delete n[args.id];
      return n;
    });
    try {
      const taskCategory =
        args.category === 'shopify'
          ? 'shopify'
          : args.category === 'content'
            ? 'content'
            : args.category === 'other'
              ? 'content'
              : 'seo';
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: args.title,
          description: args.description,
          category: taskCategory,
          status: 'planned',
          priority: args.priority,
          source: 'auto',
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'HTTP ' + res.status);
      setAddedTodos((prev) => {
        const n = new Set(prev);
        n.add(args.id);
        return n;
      });
      return true;
    } catch (err) {
      setTodoErrors((prev) => ({
        ...prev,
        [args.id]: err instanceof Error ? err.message : 'Add failed',
      }));
      return false;
    } finally {
      setAddingTodos((prev) => {
        const n = new Set(prev);
        n.delete(args.id);
        return n;
      });
    }
  }

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addAllFromGroup(group: SynopsisEnhancement) {
    if (!group.children) return;
    for (const child of group.children) {
      await addTodo({
        id: child.id,
        title: child.taskDefaults.title,
        description: child.taskDefaults.description,
        category: child.taskDefaults.category,
        priority: child.taskDefaults.priority,
      });
    }
  }

  async function refreshEverything() {
    // Regen the narrative then force a router refresh so the server
    // re-runs the analyser with fresh data.
    await loadNarrative();
    router.refresh();
  }

  async function runFix(issue: SynopsisIssue): Promise<boolean> {
    if (!issue.pageId || issue.kind === 'manual') return false;
    if (busy.has(issue.id)) return false;
    setBusy((prev) => {
      const next = new Set(prev);
      next.add(issue.id);
      return next;
    });
    setErrors((prev) => {
      const n = { ...prev };
      delete n[issue.id];
      return n;
    });
    try {
      const res = await fetch('/api/synopsis/fix', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: issue.kind,
          pageId: issue.pageId,
          pageType: issue.pageType,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        title?: string;
        description?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? 'HTTP ' + res.status);
      }
      setFixed((prev) => ({
        ...prev,
        [issue.id]: { title: data.title, description: data.description },
      }));
      setTimeout(() => {
        setIssues((prev) => prev.filter((x) => x.id !== issue.id));
      }, 1200);
      return true;
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [issue.id]: err instanceof Error ? err.message : 'Fix failed',
      }));
      return false;
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(issue.id);
        return next;
      });
    }
  }

  async function runFixAll() {
    if (fixAllRunning) {
      fixAllAbortRef.current = true;
      return;
    }
    fixAllAbortRef.current = false;
    setFixAllRunning(true);
    try {
      const queue = issues.filter((i) => i.kind !== 'manual' && !fixed[i.id]);
      for (const issue of queue) {
        if (fixAllAbortRef.current) break;
        await runFix(issue);
      }
    } finally {
      setFixAllRunning(false);
      fixAllAbortRef.current = false;
    }
  }

  const autoFixable = issues.filter((i) => i.kind !== 'manual');
  const manual = issues.filter((i) => i.kind === 'manual');
  const canFixAll = autoFixable.length > 0;

  // Merge the four executable enhancements (from the analyser) with the AI-
  // generated grouped enhancements (from the narrative endpoint). The order:
  //   - executable high-impact first (keyword research, meta rewrite, etc)
  //   - then AI groups, sorted high/medium/low by impact
  //   - any executable medium-low at the bottom.
  const mergedEnhancements: SynopsisEnhancement[] = (() => {
    const dynamic: SynopsisEnhancement[] = narrativeGroups.map((g) => ({
      id: 'dyn:' + g.id,
      kind: 'group' as const,
      title: g.title,
      description: g.description || '',
      cta: 'Expand',
      impact: g.impact,
      subject: g.subject || g.children.length + ' in-house jobs',
      executable: false,
      taskDefaults: {
        title: g.title,
        description:
          (g.description || '') + ' Decomposed into ' + g.children.length + ' in-house jobs.',
        category: 'seo',
        priority: g.impact === 'high' ? 'high' : g.impact === 'medium' ? 'medium' : 'low',
      },
      children: g.children.map((c, i) => ({
        id: 'dyn:' + g.id + ':child:' + i,
        kind: 'seo-cleanup-item' as const,
        title: c.title,
        description: c.description,
        cta: 'Plan',
        impact:
          c.priority === 'high' ? 'high' : c.priority === 'medium' ? 'medium' : 'low',
        executable: false,
        taskDefaults: {
          title: c.title,
          description: c.description,
          category: c.category,
          priority: c.priority,
        },
      })),
    }));

    const rank: Record<SynopsisEnhancement['impact'], number> = { high: 0, medium: 1, low: 2 };
    const all = [...synopsis.enhancements, ...dynamic];
    all.sort((a, b) => rank[a.impact] - rank[b.impact]);
    return all;
  })();

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1400px]">
      {/* Header strip with refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-evari-dimmer font-medium">
          <Sparkles className="h-3.5 w-3.5" />
          Site state
          {narrativeAt ? (
            <span className="text-[10px] text-evari-dimmer/70 normal-case tracking-normal ml-2">
              updated {formatRelativeTime(narrativeAt)}
            </span>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="default"
          onClick={() => void refreshEverything()}
          disabled={narrativeBusy}
          title="Regenerate narrative and reload signals"
        >
          {narrativeBusy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3" />
          )}
          Refresh
        </Button>
      </div>

      {/* Section 0: narrative paragraph */}
      <section className="rounded-xl bg-evari-surface p-5 space-y-4">
        {narrativeBusy && !narrative ? (
          <div className="flex items-center gap-2 text-[13px] text-evari-dim">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reading every signal and assembling the picture…
          </div>
        ) : narrativeError ? (
          <div className="text-[13px] text-evari-danger">
            Narrative failed: {narrativeError}. Falling back to bullet summary below.
          </div>
        ) : narrative ? (
          <>
            <p className="text-[14px] leading-relaxed text-evari-text">
              {narrative}
            </p>
            {narrativeActions.length > 0 ? (
              <div className="mt-3 rounded-md bg-evari-surfaceSoft/40 px-3 py-2.5 space-y-1.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
                  Turn the assessment into tasks
                </div>
                <ul className="space-y-1">
                  {narrativeActions.map((a, i) => {
                    const id = 'narrative-action:' + i + ':' + a.title;
                    const added = addedTodos.has(id);
                    const adding = addingTodos.has(id);
                    const err = todoErrors[id];
                    return (
                      <li key={id} className="flex items-start gap-2 text-[12px] text-evari-text">
                        <span className="text-evari-dimmer mt-1">•</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{a.title}</div>
                          {a.detail ? (
                            <div className="text-[11px] text-evari-dim leading-relaxed">{a.detail}</div>
                          ) : null}
                          {err ? (
                            <div className="text-[10px] text-evari-danger mt-0.5">{err}</div>
                          ) : null}
                        </div>
                        <Button
                          size="sm"
                          variant={added ? 'default' : 'primary'}
                          disabled={added || adding}
                          onClick={() =>
                            void addTodo({
                              id,
                              title: a.title,
                              description: a.detail,
                              category: a.category,
                              priority: a.priority,
                            })
                          }
                        >
                          {adding ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : added ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <ListPlus className="h-3 w-3" />
                          )}
                          {added ? 'Added' : adding ? 'Adding' : 'Todo'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}

        {/* Bullets stay underneath so the specifics are still one glance away */}
        <div className="pt-1 border-t border-evari-line/20 space-y-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
            <Lightbulb className="h-3.5 w-3.5" />
            Why the site is underperforming
          </div>
          <ul className="space-y-2">
            {synopsis.summary.map((line, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[13px] leading-relaxed text-evari-text"
              >
                <span className="text-evari-dimmer mt-1.5 shrink-0">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="pt-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            <Stat label="Pages scanned" value={synopsis.totals.pages} />
            <Stat label="Missing titles" value={synopsis.totals.missingMetaTitle} tone={synopsis.totals.missingMetaTitle > 0 ? 'danger' : 'ok'} />
            <Stat label="Missing descriptions" value={synopsis.totals.missingMetaDesc} tone={synopsis.totals.missingMetaDesc > 0 ? 'warn' : 'ok'} />
            <Stat label="Critical findings" value={synopsis.totals.criticalFindings} tone={synopsis.totals.criticalFindings > 0 ? 'danger' : 'ok'} />
          </div>
        </div>
      </section>

      {/* Section 1: fix list */}
      <section className="space-y-3">
        <header className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-[13px] font-medium text-evari-text">
            <Wrench className="h-3.5 w-3.5 text-evari-dimmer" />
            Fix list
            <span className="text-[11px] text-evari-dimmer font-normal ml-2">
              {autoFixable.length} auto-fixable · {manual.length} manual
            </span>
          </div>
          {canFixAll ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => void runFixAll()}
              disabled={!fixAllRunning && autoFixable.length === 0}
            >
              {fixAllRunning ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Cancel
                </>
              ) : (
                <>
                  <Wand2 className="h-3 w-3" />
                  Fix all ({autoFixable.length})
                </>
              )}
            </Button>
          ) : null}
        </header>

        {issues.length === 0 ? (
          <div className="rounded-md bg-evari-surface px-5 py-10 text-center text-[13px] text-evari-dim">
            <Check className="h-5 w-5 mx-auto text-evari-success mb-2" />
            Nothing to fix right now. Next move is in the Enhance list below.
          </div>
        ) : (
          <ul className="space-y-1">
            {issues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                busy={busy.has(issue.id)}
                fixedCopy={fixed[issue.id]}
                error={errors[issue.id]}
                onFix={() => void runFix(issue)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Section 2: enhance list */}
      <section className="space-y-3">
        <header className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-[13px] font-medium text-evari-text">
            <Sparkles className="h-3.5 w-3.5 text-evari-dimmer" />
            Enhance
            <span className="text-[11px] text-evari-dimmer font-normal ml-2">
              {totalEnhanceCount(mergedEnhancements)} opportunities, all in-house
            </span>
          </div>
        </header>
        <ul className="space-y-1">
          {mergedEnhancements.map((e) => (
            <EnhanceRow
              key={e.id}
              enhancement={e}
              expanded={expandedGroups.has(e.id)}
              onToggleGroup={() => toggleGroup(e.id)}
              onOpenModal={(kind) => setActiveEnhance(kind)}
              onAddTodo={addTodo}
              onAddAllFromGroup={addAllFromGroup}
              addedTodos={addedTodos}
              addingTodos={addingTodos}
              todoErrors={todoErrors}
            />
          ))}
        </ul>
      </section>

      {/* Enhance modals */}
      {activeEnhance === 'keywords-research' ? (
        <KeywordsResearchModal
          onClose={() => setActiveEnhance(null)}
          onApplied={() => {
            setActiveEnhance(null);
            router.refresh();
          }}
        />
      ) : null}
      {activeEnhance === 'meta-rewrite' ? (
        <MetaRewriteModal
          onClose={() => setActiveEnhance(null)}
          onApplied={() => {
            setActiveEnhance(null);
            router.refresh();
          }}
        />
      ) : null}
      {activeEnhance === 'internal-links' ? (
        <InternalLinksModal onClose={() => setActiveEnhance(null)} />
      ) : null}
      {activeEnhance === 'blog-topics' ? (
        <BlogTopicsModal onClose={() => setActiveEnhance(null)} />
      ) : null}
    </div>
  );
}

/* ------------------------------- Issue row -------------------------------- */

function IssueRow({
  issue,
  busy,
  fixedCopy,
  error,
  onFix,
}: {
  issue: SynopsisIssue;
  busy: boolean;
  fixedCopy?: { title?: string; description?: string };
  error?: string;
  onFix: () => void;
}) {
  const autoFixable = issue.kind !== 'manual';
  const sevColor =
    issue.severity === 'critical'
      ? 'bg-evari-danger/15 text-evari-danger'
      : issue.severity === 'warning'
        ? 'bg-evari-warn/15 text-evari-warn'
        : 'bg-evari-surfaceSoft text-evari-dim';
  return (
    <li className="rounded-md bg-evari-surface px-5 py-4 flex items-start gap-4 relative overflow-hidden">
      {busy ? <ProgressBar /> : null}

      <div className="pt-0.5 shrink-0">
        {issue.severity === 'critical' ? (
          <XCircle className="h-4 w-4 text-evari-danger" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-evari-warn" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-evari-text">
            {issue.title}
          </span>
          <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold', sevColor)}>
            {issue.severity}
          </span>
          {issue.pagePath ? (
            <span className="text-[11px] font-mono text-evari-dim truncate max-w-[360px]">
              {issue.pagePath}
            </span>
          ) : null}
        </div>
        <div className="text-[12px] text-evari-dim mt-1 leading-relaxed">
          {issue.description}
        </div>
        {fixedCopy ? (
          <div className="mt-2 rounded-md bg-evari-success/10 p-2 text-[12px] text-evari-success space-y-1">
            <div className="font-medium inline-flex items-center gap-1">
              <Check className="h-3 w-3" />
              Fixed.
            </div>
            {fixedCopy.title ? (
              <div><span className="text-evari-dimmer">Title:</span> {fixedCopy.title}</div>
            ) : null}
            {fixedCopy.description ? (
              <div><span className="text-evari-dimmer">Description:</span> {fixedCopy.description}</div>
            ) : null}
          </div>
        ) : null}
        {issue.kind === 'manual' && issue.manualGuide ? (
          <div className="mt-2 rounded-md bg-evari-surfaceSoft/60 p-2 text-[12px] text-evari-dim leading-relaxed">
            <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium mb-1">
              How to fix
            </div>
            {issue.manualGuide}
          </div>
        ) : null}
        {error ? (
          <div className="mt-2 text-[11px] text-evari-danger">{error}</div>
        ) : null}
      </div>
      <div className="shrink-0 flex items-center">
        {autoFixable && !fixedCopy ? (
          <Button size="sm" variant="primary" onClick={onFix} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
            {busy ? 'Fixing' : 'Fix'}
          </Button>
        ) : !autoFixable ? (
          <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
            Manual
          </span>
        ) : null}
      </div>
    </li>
  );
}

/* ------------------------------ Enhance row ------------------------------- */

type AddTodoFn = (args: {
  id: string;
  title: string;
  description: string;
  category: SynopsisTaskCategory;
  priority: SynopsisTaskPriority;
}) => Promise<boolean>;

function EnhanceRow({
  enhancement,
  expanded,
  onToggleGroup,
  onOpenModal,
  onAddTodo,
  onAddAllFromGroup,
  addedTodos,
  addingTodos,
  todoErrors,
}: {
  enhancement: SynopsisEnhancement;
  expanded: boolean;
  onToggleGroup: () => void;
  onOpenModal: (kind: SynopsisEnhanceKind) => void;
  onAddTodo: AddTodoFn;
  onAddAllFromGroup: (group: SynopsisEnhancement) => Promise<void>;
  addedTodos: Set<string>;
  addingTodos: Set<string>;
  todoErrors: Record<string, string>;
}) {
  const isGroup = enhancement.kind === 'group';
  const impactColor =
    enhancement.impact === 'high'
      ? 'bg-evari-gold/15 text-evari-gold'
      : enhancement.impact === 'medium'
        ? 'bg-evari-accent/15 text-evari-accent'
        : 'bg-evari-surfaceSoft text-evari-dim';
  const added = addedTodos.has(enhancement.id);
  const adding = addingTodos.has(enhancement.id);
  const err = todoErrors[enhancement.id];

  return (
    <li className="rounded-md bg-evari-surface overflow-hidden">
      <div
        className={cn(
          'px-5 py-4 flex items-start gap-4',
          isGroup ? 'cursor-pointer hover:bg-evari-surface/70 transition-colors' : '',
        )}
        onClick={(e) => {
          if (!isGroup) return;
          // Don't toggle when the click originated inside a button (Todo, Add all, etc).
          const target = e.target as HTMLElement;
          if (target.closest('button')) return;
          onToggleGroup();
        }}
      >
        <div className="pt-0.5 shrink-0 inline-flex items-center justify-center h-5 w-5">
          {isGroup ? (
            <ChevronRight
              className={cn(
                'h-4 w-4 text-evari-dimmer transition-transform',
                expanded ? 'rotate-90' : '',
              )}
            />
          ) : (
            <Sparkles className="h-4 w-4 text-evari-gold" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-evari-text">
              {enhancement.title}
            </span>
            <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold', impactColor)}>
              {enhancement.impact} impact
            </span>
            {enhancement.subject ? (
              <span className="text-[11px] text-evari-dimmer">
                {enhancement.subject}
              </span>
            ) : null}
            {isGroup && enhancement.children ? (
              <span className="text-[11px] text-evari-dimmer">
                {enhancement.children.length} sub-tasks
              </span>
            ) : null}
          </div>
          <div className="text-[12px] text-evari-dim mt-1 leading-relaxed">
            {enhancement.description}
          </div>
          {err ? (
            <div className="mt-1 text-[11px] text-evari-danger">{err}</div>
          ) : null}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Button
            size="sm"
            variant={added ? 'default' : 'default'}
            disabled={added || adding}
            onClick={() =>
              void onAddTodo({
                id: enhancement.id,
                title: enhancement.taskDefaults.title,
                description: enhancement.taskDefaults.description,
                category: enhancement.taskDefaults.category,
                priority: enhancement.taskDefaults.priority,
              })
            }
            title={added ? 'Added to todo' : 'Add as a task in the todo list'}
          >
            {adding ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : added ? (
              <Check className="h-3 w-3" />
            ) : (
              <ListPlus className="h-3 w-3" />
            )}
            {added ? 'Added' : adding ? 'Adding' : 'Todo'}
          </Button>
          {enhancement.executable ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => onOpenModal(enhancement.kind as SynopsisEnhanceKind)}
            >
              <Wand2 className="h-3 w-3" />
              {enhancement.cta}
            </Button>
          ) : null}
        </div>
      </div>
      {isGroup && expanded && enhancement.children ? (
        <div className="border-t border-evari-line/20 bg-evari-surfaceSoft/30 px-5 py-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
              {enhancement.children.length} in-house jobs
            </div>
            <Button
              size="sm"
              variant="default"
              onClick={() => void onAddAllFromGroup(enhancement)}
              title="Add every sub-task to the todo list"
            >
              <ListPlus className="h-3 w-3" />
              Add all to todo
            </Button>
          </div>
          <ul className="space-y-1.5">
            {enhancement.children.map((child) => {
              const cAdded = addedTodos.has(child.id);
              const cAdding = addingTodos.has(child.id);
              const cErr = todoErrors[child.id];
              return (
                <li
                  key={child.id}
                  className="rounded-md bg-evari-surface px-3 py-2.5 flex items-start gap-3"
                >
                  <ChevronRight className="h-3 w-3 text-evari-dimmer mt-1 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-evari-text">
                      {child.title}
                    </div>
                    <div className="text-[11px] text-evari-dim mt-0.5 leading-relaxed">
                      {child.description}
                    </div>
                    {cErr ? (
                      <div className="text-[10px] text-evari-danger mt-0.5">{cErr}</div>
                    ) : null}
                  </div>
                  <div className="shrink-0">
                    <Button
                      size="sm"
                      variant={cAdded ? 'default' : 'primary'}
                      disabled={cAdded || cAdding}
                      onClick={() =>
                        void onAddTodo({
                          id: child.id,
                          title: child.taskDefaults.title,
                          description: child.taskDefaults.description,
                          category: child.taskDefaults.category,
                          priority: child.taskDefaults.priority,
                        })
                      }
                    >
                      {cAdding ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : cAdded ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <ListPlus className="h-3 w-3" />
                      )}
                      {cAdded ? 'Added' : cAdding ? 'Adding' : 'Todo'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function totalEnhanceCount(list: SynopsisEnhancement[]): number {
  let n = 0;
  for (const e of list) {
    n += 1;
    if (e.children) n += e.children.length;
  }
  return n;
}

/* ------------------------------ Modals base ------------------------------- */

function ModalShell({
  title,
  onClose,
  children,
  widthClass = 'max-w-[720px]',
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  widthClass?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={cn('w-full max-h-[85vh] flex flex-col rounded-xl bg-evari-carbon shadow-2xl', widthClass)}>
        <header className="flex items-center justify-between px-5 py-3 border-b border-evari-line/30">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-evari-text">
            <Sparkles className="h-3.5 w-3.5 text-evari-gold" />
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surface/60 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="px-5 py-3 border-t border-evari-line/30 flex items-center justify-end gap-2">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------- Modal: keyword research + apply --------------------- */

interface CompetitorProposal {
  name: string;
  domain: string;
  positioning: string;
  whyTrack: string;
  seedKeywords: string[];
}

function KeywordsResearchModal({
  onClose,
  onApplied,
}: {
  onClose: () => void;
  onApplied: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<CompetitorProposal[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/synopsis/enhance/keywords-research', { method: 'POST' });
        const data = (await res.json()) as { ok?: boolean; proposals?: CompetitorProposal[]; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? 'Research failed');
        const ps = data.proposals ?? [];
        setProposals(ps);
        // Default-select everyone, Craig can deselect.
        setSelected(new Set(ps.map((p) => p.domain)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Research failed');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggle(domain: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const body = {
        competitors: proposals
          .filter((p) => selected.has(p.domain))
          .map((p) => ({ name: p.name, domain: p.domain, seedKeywords: p.seedKeywords })),
      };
      const res = await fetch('/api/synopsis/enhance/keywords-apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        competitorLists?: Array<{ domain: string; keywordsAdded: number }>;
        ownKeywordsAdded?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Apply failed');
      setApplied(
        (data.competitorLists?.length ?? 0) +
          ' competitor list' +
          ((data.competitorLists?.length ?? 0) === 1 ? '' : 's') +
          ' created, ' +
          (data.ownKeywordsAdded ?? 0) +
          ' keywords added to Evari',
      );
      setTimeout(() => onApplied(), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  }

  return (
    <ModalShell
      title="Research e-bike keywords and competitors"
      onClose={onClose}
      footer={
        <>
          <span className="text-[11px] text-evari-dimmer mr-auto">
            {selected.size} of {proposals.length} selected
          </span>
          <Button size="sm" variant="default" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void apply()}
            disabled={loading || applying || selected.size === 0}
          >
            {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {applying ? 'Adding' : 'Add ' + selected.size + ' + their keywords'}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-evari-dim">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Researching top UK e-bike brands…
        </div>
      ) : error ? (
        <div className="text-[13px] text-evari-danger">{error}</div>
      ) : applied ? (
        <div className="flex items-center gap-2 text-[13px] text-evari-success">
          <Check className="h-3.5 w-3.5" />
          {applied}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[12px] text-evari-dim">
            Pick which brands to track as competitors. I'll create a keyword list per brand seeded with their top terms, and mirror the union onto your own list so we can SERP-track them for evari.cc too.
          </p>
          <ul className="space-y-1.5">
            {proposals.map((p) => {
              const checked = selected.has(p.domain);
              return (
                <li
                  key={p.domain}
                  className={cn(
                    'rounded-md border px-3 py-2.5 transition-colors cursor-pointer',
                    checked
                      ? 'border-evari-gold/60 bg-evari-gold/5'
                      : 'border-evari-line/30 bg-evari-surface hover:bg-evari-surface/80',
                  )}
                  onClick={() => toggle(p.domain)}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-3.5 w-3.5 accent-evari-gold"
                      checked={checked}
                      onChange={() => toggle(p.domain)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-evari-text">
                          {p.name}
                        </span>
                        <span className="text-[11px] font-mono text-evari-dim">
                          {p.domain}
                        </span>
                      </div>
                      {p.positioning ? (
                        <div className="text-[12px] text-evari-dim mt-0.5">
                          {p.positioning}
                        </div>
                      ) : null}
                      {p.whyTrack ? (
                        <div className="text-[11px] text-evari-dimmer mt-0.5 italic">
                          {p.whyTrack}
                        </div>
                      ) : null}
                      {p.seedKeywords.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {p.seedKeywords.slice(0, 8).map((k) => (
                            <span
                              key={k}
                              className="inline-block text-[10px] rounded px-1.5 py-0.5 bg-evari-surfaceSoft/60 text-evari-dim"
                            >
                              {k}
                            </span>
                          ))}
                          {p.seedKeywords.length > 8 ? (
                            <span className="text-[10px] text-evari-dimmer">+{p.seedKeywords.length - 8}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </ModalShell>
  );
}

/* ---------------------------- Modal: meta rewrite -------------------------- */

interface WeakTarget {
  pageId: string;
  pageType: 'product' | 'page' | 'article';
  pagePath: string;
  pageTitle: string;
  kind: 'meta-title' | 'meta-desc';
  current: string;
  currentLen: number;
  reason: 'too-short' | 'too-long' | 'duplicate';
}

function MetaRewriteModal({
  onClose,
  onApplied,
}: {
  onClose: () => void;
  onApplied: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState<WeakTarget[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<Array<{ pageId: string; kind: string; ok: boolean; generated?: string; error?: string }> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/synopsis/enhance/meta-rewrite', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'list' }),
        });
        const data = (await res.json()) as { ok?: boolean; weak?: WeakTarget[]; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? 'List failed');
        const w = data.weak ?? [];
        setTargets(w);
        setSelectedIds(new Set(w.map((t) => t.pageId + ':' + t.kind)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'List failed');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function rowKey(t: WeakTarget) {
    return t.pageId + ':' + t.kind;
  }
  function toggle(t: WeakTarget) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const k = rowKey(t);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const picked = targets.filter((t) => selectedIds.has(rowKey(t)));
      const res = await fetch('/api/synopsis/enhance/meta-rewrite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'apply',
          targets: picked.map((t) => ({ pageId: t.pageId, pageType: t.pageType, kind: t.kind })),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        results?: Array<{ pageId: string; kind: string; ok: boolean; generated?: string; error?: string }>;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Apply failed');
      setResults(data.results ?? []);
      setTimeout(() => onApplied(), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  }

  const reasonLabel = (r: WeakTarget['reason']): string =>
    r === 'too-short' ? 'Too short' : r === 'too-long' ? 'Too long' : 'Duplicate';

  return (
    <ModalShell
      title="Rewrite weak meta titles and descriptions"
      onClose={onClose}
      widthClass="max-w-[880px]"
      footer={
        results ? (
          <>
            <span className="text-[12px] text-evari-success mr-auto">
              {results.filter((r) => r.ok).length} rewritten, {results.filter((r) => !r.ok).length} failed
            </span>
            <Button size="sm" variant="primary" onClick={onApplied}>
              <Check className="h-3 w-3" />
              Done
            </Button>
          </>
        ) : (
          <>
            <span className="text-[11px] text-evari-dimmer mr-auto">
              {selectedIds.size} of {targets.length} selected
            </span>
            <Button size="sm" variant="default" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void apply()}
              disabled={loading || applying || selectedIds.size === 0}
            >
              {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              {applying ? 'Rewriting' : 'Rewrite ' + selectedIds.size + ' entries'}
            </Button>
          </>
        )
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-evari-dim">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Scanning for weak meta copy…
        </div>
      ) : error ? (
        <div className="text-[13px] text-evari-danger">{error}</div>
      ) : targets.length === 0 ? (
        <div className="text-[13px] text-evari-dim">No weak meta copy detected right now.</div>
      ) : (
        <div className="space-y-2">
          <p className="text-[12px] text-evari-dim">
            I'll rewrite every selected entry via Claude, keeping Evari's voice and the house rules (no em-dashes, plain sentence case). Writes directly back to Shopify.
          </p>
          <ul className="space-y-1">
            {targets.map((t) => {
              const k = rowKey(t);
              const checked = selectedIds.has(k);
              const result = results?.find((r) => r.pageId === t.pageId && r.kind === t.kind);
              return (
                <li
                  key={k}
                  className={cn(
                    'rounded-md border px-3 py-2.5 cursor-pointer transition-colors',
                    result?.ok
                      ? 'border-evari-success/30 bg-evari-success/5'
                      : result?.error
                        ? 'border-evari-danger/30 bg-evari-danger/5'
                        : checked
                          ? 'border-evari-gold/50 bg-evari-gold/5'
                          : 'border-evari-line/30 bg-evari-surface hover:bg-evari-surface/80',
                  )}
                  onClick={() => !results && toggle(t)}
                >
                  <div className="flex items-start gap-3">
                    {!results ? (
                      <input
                        type="checkbox"
                        className="mt-1 h-3.5 w-3.5 accent-evari-gold"
                        checked={checked}
                        onChange={() => toggle(t)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-semibold text-evari-text">
                          {t.pageTitle}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-evari-surfaceSoft text-evari-dim">
                          {t.kind === 'meta-title' ? 'Title' : 'Description'}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-evari-warn/15 text-evari-warn">
                          {reasonLabel(t.reason)} · {t.currentLen} chars
                        </span>
                        <span className="text-[11px] font-mono text-evari-dim truncate max-w-[260px]">
                          {t.pagePath}
                        </span>
                      </div>
                      <div className="text-[12px] text-evari-dim mt-1 leading-relaxed">
                        <span className="text-evari-dimmer">Current:</span> {t.current}
                      </div>
                      {result?.ok && result.generated ? (
                        <div className="text-[12px] text-evari-success mt-1 leading-relaxed">
                          <span className="text-evari-dimmer">New:</span> {result.generated}
                        </div>
                      ) : null}
                      {result?.error ? (
                        <div className="text-[11px] text-evari-danger mt-1">
                          Failed: {result.error}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </ModalShell>
  );
}

/* -------------------------- Modal: internal links ------------------------- */

interface LinkProposal {
  target: { pageId: string; pagePath: string; pageTitle: string };
  proposals: Array<{ fromPath: string; anchor: string; reason: string }>;
}

function InternalLinksModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<LinkProposal[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/synopsis/enhance/internal-links', { method: 'POST' });
        const data = (await res.json()) as { ok?: boolean; proposals?: LinkProposal[]; note?: string; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? 'Proposals failed');
        setProposals(data.proposals ?? []);
        if (data.note) setNote(data.note);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Proposals failed');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <ModalShell
      title="Internal link proposals"
      onClose={onClose}
      footer={
        <Button size="sm" variant="primary" onClick={onClose}>Close</Button>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-evari-dim">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Looking for stuck pages and candidate source pages…
        </div>
      ) : error ? (
        <div className="text-[13px] text-evari-danger">{error}</div>
      ) : note && proposals.length === 0 ? (
        <div className="text-[13px] text-evari-dim">{note}</div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-evari-dim">
            These pages earn impressions but no clicks. Link into them from the listed source pages with the anchor text suggested and the click-through should lift. Review and apply manually, I don't modify page bodies autonomously.
          </p>
          <ul className="space-y-3">
            {proposals.map((p) => (
              <li key={p.target.pageId} className="rounded-md bg-evari-surface px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[13px] font-semibold text-evari-text">{p.target.pageTitle}</span>
                  <span className="text-[11px] font-mono text-evari-dim">{p.target.pagePath}</span>
                </div>
                <ul className="space-y-1.5">
                  {p.proposals.map((l, i) => (
                    <li key={i} className="text-[12px] leading-relaxed flex items-start gap-2">
                      <ChevronRight className="h-3 w-3 mt-1 text-evari-dimmer shrink-0" />
                      <div>
                        <div>
                          Link from <span className="font-mono text-evari-text">{l.fromPath}</span> with anchor <span className="italic text-evari-text">"{l.anchor}"</span>
                        </div>
                        <div className="text-[11px] text-evari-dimmer mt-0.5">{l.reason}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ModalShell>
  );
}

/* --------------------------- Modal: blog topics --------------------------- */

interface BlogBrief {
  title: string;
  primaryKeyword: string;
  competitorGap: string;
  angle: string;
  outline: string[];
  estimatedWordCount: number;
}

function BlogTopicsModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [briefs, setBriefs] = useState<BlogBrief[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/synopsis/enhance/blog-topics', { method: 'POST' });
        const data = (await res.json()) as { ok?: boolean; briefs?: BlogBrief[]; note?: string; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? 'Proposals failed');
        setBriefs(data.briefs ?? []);
        if (data.note) setNote(data.note);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Proposals failed');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function copyBrief(b: BlogBrief, idx: number) {
    const text =
      b.title + '\n\n' +
      'Primary keyword: ' + b.primaryKeyword + '\n' +
      'Competitor gap: ' + b.competitorGap + '\n' +
      'Angle: ' + b.angle + '\n\n' +
      'Outline:\n' +
      b.outline.map((o) => '  - ' + o).join('\n') + '\n\n' +
      'Target length: ~' + b.estimatedWordCount + ' words';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(idx);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      // ignore
    }
  }

  return (
    <ModalShell
      title="Blog topic briefs"
      onClose={onClose}
      widthClass="max-w-[880px]"
      footer={<Button size="sm" variant="primary" onClick={onClose}>Close</Button>}
    >
      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-evari-dim">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Finding keyword gaps and drafting briefs…
        </div>
      ) : error ? (
        <div className="text-[13px] text-evari-danger">{error}</div>
      ) : note && briefs.length === 0 ? (
        <div className="text-[13px] text-evari-dim">{note}</div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-evari-dim">
            Five briefs shaped by the biggest keyword gaps against your tracked competitors. Copy a brief to clipboard and paste into a Shopify blog draft.
          </p>
          <ul className="space-y-3">
            {briefs.map((b, i) => (
              <li key={i} className="rounded-md bg-evari-surface px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-evari-text">{b.title}</div>
                    <div className="text-[11px] text-evari-dimmer mt-0.5">
                      Primary keyword: <span className="text-evari-text">{b.primaryKeyword}</span> · ~{b.estimatedWordCount} words
                    </div>
                    <div className="text-[12px] text-evari-dim mt-2 leading-relaxed">
                      <span className="text-evari-dimmer">Gap: </span>{b.competitorGap}
                    </div>
                    <div className="text-[12px] text-evari-dim leading-relaxed">
                      <span className="text-evari-dimmer">Angle: </span>{b.angle}
                    </div>
                    {b.outline.length > 0 ? (
                      <ul className="mt-1.5 space-y-0.5">
                        {b.outline.map((o, j) => (
                          <li key={j} className="text-[12px] text-evari-text flex items-start gap-2">
                            <span className="text-evari-dimmer mt-0.5">•</span>
                            <span>{o}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="shrink-0">
                    <Button size="sm" variant="default" onClick={() => void copyBrief(b, i)}>
                      {copied === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied === i ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ModalShell>
  );
}

/* ---------------------------------- Bits --------------------------------- */

function ProgressBar() {
  const [pct, setPct] = useState(4);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / 4000);
      const eased = 1 - Math.pow(1 - t, 3);
      setPct(4 + eased * 86);
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-evari-line/20 overflow-hidden">
      <div className="h-full bg-evari-gold transition-[width] duration-150 ease-out" style={{ width: pct + '%' }} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'muted',
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn' | 'danger' | 'muted';
}) {
  const color =
    tone === 'danger'
      ? 'text-evari-danger'
      : tone === 'warn'
        ? 'text-evari-warn'
        : tone === 'ok'
          ? 'text-evari-success'
          : 'text-evari-text';
  return (
    <div className="rounded-md bg-evari-surfaceSoft/50 p-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
        {label}
      </div>
      <div className={cn('text-lg font-semibold font-mono tabular-nums leading-tight mt-0.5', color)}>
        {value}
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return diffSec + 's ago';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const d = Math.floor(hr / 24);
  return d + 'd ago';
}
