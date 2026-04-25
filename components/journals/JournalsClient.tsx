'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  FileText,
  Image as ImageIcon,
  Clock,
  CheckCircle2,
  ArrowLeft,
  Pencil,
  ExternalLink,
  Copy,
  Loader2,
  Trash2,
  AlertTriangle,
  PlaneTakeoff,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { JournalDraft } from '@/lib/journals/repository';
import type { ShopifyArticle, ShopifyBlog } from '@/lib/shopify';
import { htmlToBlocks } from '@/lib/journals/htmlToBlocks';
import { NewJournalWizard } from './NewJournalWizard';
import { ShopifyPreview, type JournalBlock } from './ShopifyPreview';

type Lane = { key: string; label: string; blogId?: string };

interface Props {
  blogs: ShopifyBlog[];
  drafts: JournalDraft[];
  articles: ShopifyArticle[];
}

/**
 * Derive the two Journal lanes (CS+ Bike Builds / Blogs) from the
 * live Shopify blog list. If CS+ is its own blog we use its ID; if
 * it's one blog split by tag we fall back to a tag filter.
 */
function resolveLanes(blogs: ShopifyBlog[]): Lane[] {
  const csPlus = blogs.find(
    (b) =>
      /cs\s*\+|cs-plus|bike\s*build/i.test(b.title) ||
      /cs-plus|bike-build|cs_plus/.test(b.handle),
  );
  const blogsBlog = blogs.find(
    (b) =>
      /^blogs?$/i.test(b.title) ||
      /^blogs?$/i.test(b.handle) ||
      /journal/i.test(b.handle),
  );
  return [
    { key: 'cs_plus', label: 'CS+ | Bike Builds', blogId: csPlus?.id },
    { key: 'blogs', label: 'Blogs', blogId: blogsBlog?.id ?? blogs[0]?.id },
  ];
}

function articleBelongsTo(article: ShopifyArticle, lane: Lane): boolean {
  if (lane.blogId && article.blog.id === lane.blogId) return true;
  // Tag fallback when the store has only one blog.
  if (lane.key === 'cs_plus') {
    return article.tags.some((t) => /cs\+|bike\s*build|cs-plus/i.test(t));
  }
  if (lane.key === 'blogs') {
    // Everything that isn't CS+ falls into Blogs.
    return !article.tags.some((t) => /cs\+|bike\s*build|cs-plus/i.test(t));
  }
  return false;
}

export function JournalsClient({ blogs, drafts, articles }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const lanes = useMemo(() => resolveLanes(blogs), [blogs]);
  const [lane, setLane] = useState<Lane>(lanes[0]);

  const laneDrafts = drafts.filter((d) => d.blogTarget === lane.key);
  const laneArticles = articles.filter((a) => articleBelongsTo(a, lane));
  // Three buckets for the three lanes:
  //  - Studio Design   → no Shopify article yet, no scheduled date
  //  - Departure Lounge → no Shopify article yet, scheduled_for set
  //  - Published       → has shopify_article_id (or is on the
  //                      Shopify articles list)
  const studioDrafts = laneDrafts.filter(
    (d) => !d.shopifyArticleId && !d.scheduledFor,
  );
  const departureDrafts = laneDrafts.filter(
    (d) => !d.shopifyArticleId && d.scheduledFor,
  );
  const publishedDraftIds = new Set(
    laneDrafts
      .filter((d) => d.shopifyArticleId)
      .map((d) => d.shopifyArticleId as string),
  );
  // Split Shopify articles into truly-published vs unpublished-on-
  // Shopify. Shopify's `articles` connection returns both by default;
  // the unpublished ones are usually stub posts someone started in
  // the Shopify admin but never finished, and they look broken in a
  // "Published" grid (no cover, no summary). We show them in their
  // own lane so they stay visible without polluting the published
  // set.
  const publishedArticles = laneArticles.filter((a) => a.isPublished);
  const unpublishedArticles = laneArticles.filter((a) => !a.isPublished);
  const draftOnlyPublished = laneDrafts.filter(
    (d) =>
      d.shopifyArticleId &&
      !publishedArticles.some((a) => a.id === d.shopifyArticleId),
  );

  // The new-article flow opens a 3-step wizard. The wizard returns
  // a fully-laid-out blocks array via onComplete; we then create
  // the draft seeded with that content and navigate into the
  // editor.
  const [wizardOpen, setWizardOpen] = useState(false);
  function newJournal() {
    setWizardOpen(true);
  }
  async function handleWizardComplete(payload: {
    title: string;
    summary: string;
    blocks: Array<{ type: string; data: Record<string, unknown> }>;
    coverImageUrl?: string;
  }) {
    setCreating(true);
    try {
      const res = await fetch('/api/journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blogTarget: lane.key,
          initial: {
            title: payload.title,
            summary: payload.summary,
            coverImageUrl: payload.coverImageUrl,
            editorData: { blocks: payload.blocks },
          },
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        draft?: { id: string };
      };
      if (data.ok && data.draft) {
        setWizardOpen(false);
        router.push(`/journals/${data.draft.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  // The in-page reader — when this is non-null we swap the tile grid
  // for a full-article view inside the same viewport, exactly how it
  // reads on evari.cc. The reader carries its own Back button so the
  // user can step back to the grid without a route change.
  type ReaderSelection =
    | { kind: 'draft'; draft: JournalDraft }
    | { kind: 'article'; article: ShopifyArticle; linkedDraftId?: string };
  const [reader, setReader] = useState<ReaderSelection | null>(null);

  /**
   * Delete confirmation state. A tile's trash button populates this
   * with the target's kind, id, and display title; the modal
   * handles the actual DELETE and refreshes the page on success.
   * The warning is emphatic on purpose: Shopify article deletes are
   * permanent and dashboard drafts aren't recoverable either.
   */
  type DeleteTarget =
    | { kind: 'draft'; id: string; title: string }
    | { kind: 'article'; id: string; title: string };
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Schedule dialog — when set, opens a date picker for that draft.
  // Saving PATCHes scheduledFor onto the draft, which moves it
  // Studio Design → Departure Lounge.
  const [scheduleTarget, setScheduleTarget] = useState<JournalDraft | null>(null);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const url =
        deleteTarget.kind === 'draft'
          ? `/api/journals/${deleteTarget.id}`
          : `/api/shopify/articles/${encodeURIComponent(deleteTarget.id)}`;
      const res = await fetch(url, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setDeleteTarget(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  function openDraft(draft: JournalDraft) {
    setReader({ kind: 'draft', draft });
  }

  function openPublished(article: ShopifyArticle) {
    // If there's a local draft linked to this article, remember its
    // id so the reader's Edit button jumps into the composer.
    const linked = laneDrafts.find((d) => d.shopifyArticleId === article.id);
    setReader({
      kind: 'article',
      article,
      linkedDraftId: linked?.id,
    });
  }

  function laneRefresh() {
    startTransition(() => router.refresh());
  }

  /**
   * Duplicate whatever the reader is showing into a new draft and
   * jump straight into the composer. Works off either a dashboard
   * draft (blocks already exist) or a Shopify article (bodyHtml is
   * parsed into blocks via htmlToBlocks — client-only since it uses
   * DOMParser).
   */
  async function duplicateAsTemplate() {
    if (!reader) return;
    const meta =
      reader.kind === 'draft'
        ? {
            title: `Copy of ${stripHtml(reader.draft.title) || 'Untitled draft'}`,
            summary: stripHtml(reader.draft.summary) || undefined,
            coverImageUrl: reader.draft.coverImageUrl ?? undefined,
            tags: reader.draft.tags,
            author: reader.draft.author ?? undefined,
            seoTitle: stripHtml(reader.draft.seoTitle) || undefined,
            seoDescription: stripHtml(reader.draft.seoDescription) || undefined,
            editorData: reader.draft.editorData as { blocks: unknown[] },
          }
        : {
            title: `Copy of ${stripHtml(reader.article.title)}`,
            // Summary + SEO description land in plain-text fields
            // (textareas). Strip any stray <p class='p1'>…</p> that
            // older Shopify imports left in those columns so Craig
            // sees clean copy he can edit, not markup.
            summary: stripHtml(reader.article.summary) || undefined,
            coverImageUrl: reader.article.image?.url ?? undefined,
            tags: reader.article.tags,
            author: reader.article.author?.name ?? undefined,
            seoTitle: stripHtml(reader.article.seo?.title) || undefined,
            seoDescription: stripHtml(reader.article.seo?.description) || undefined,
            // Parse the published HTML back into blocks so the
            // duplicate opens in the block editor (not as a wall of
            // pre-baked HTML). The parse is lossy on purpose — Craig
            // will edit blocks anyway.
            editorData: {
              blocks: htmlToBlocks(reader.article.bodyHtml || ''),
            },
          };
    const res = await fetch('/api/journals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blogTarget: lane.key, initial: meta }),
    });
    const data = (await res.json()) as { ok?: boolean; draft?: { id: string } };
    if (data.ok && data.draft) {
      router.push(`/journals/${data.draft.id}`);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-evari-ink">
      {/* Sticky lane + actions bar */}
      <div className="flex items-center justify-between gap-4 px-10 pt-4 pb-3 border-b border-white/5 sticky top-0 bg-evari-ink z-10">
        {/* Pill-group lane toggle — same chrome as the Light/Dark
            theme switch. Active lane wears the accent fill, inactive
            stays as dim text inside a single rounded trough. */}
        <div className="pill-group">
          {lanes.map((l) => {
            const active = l.key === lane.key;
            const count =
              drafts.filter((d) => d.blogTarget === l.key).length +
              articles.filter((a) => articleBelongsTo(a, l)).length;
            return (
              <button
                key={l.key}
                type="button"
                aria-pressed={active}
                data-active={active}
                onClick={() => setLane(l)}
                className="pill-tab"
              >
                {l.label}
                <span className="ml-1 text-[10px] tabular-nums opacity-70">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={laneRefresh}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-md text-evari-dim hover:text-evari-text hover:bg-evari-surface/60 transition-colors"
            title="Refresh from Shopify"
          >
            {pending ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            onClick={newJournal}
            disabled={creating}
            className="inline-flex items-center gap-2 bg-evari-gold text-evari-goldInk text-sm font-medium px-4 py-1.5 rounded-md hover:opacity-90 transition disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {creating ? 'Creating…' : `New ${lane.key === 'cs_plus' ? 'CS+ build' : 'Blog'}`}
          </button>
        </div>
      </div>

      {reader ? (
        <ArticleReader
          reader={reader}
          onClose={() => setReader(null)}
          onEdit={(id) => router.push(`/journals/${id}`)}
          onUseAsTemplate={duplicateAsTemplate}
          laneLabel={lane.label}
        />
      ) : (
      <div
        className="flex-1 overflow-y-auto px-10 py-8 space-y-10"
        style={{ scrollbarGutter: 'stable both-edges' }}
      >
        {/* Studio Design — drafts in progress (no Shopify article + no
            scheduled date). Each tile carries a 'Schedule' button to
            promote the draft into Departure Lounge. */}
        {studioDrafts.length > 0 ? (
          <section>
            <header className="flex items-baseline gap-2 mb-3">
              <Clock className="h-3.5 w-3.5 text-evari-gold" />
              <h2 className="text-xs uppercase tracking-[0.16em] text-evari-dim">
                Studio Design
              </h2>
              <span className="text-xs text-evari-dimmer tabular-nums">
                {studioDrafts.length}
              </span>
            </header>
            <div className="grid gap-6 items-start w-full grid-cols-5">
              {studioDrafts.map((d) => (
                <DraftTile
                  key={d.id}
                  draft={d}
                  onClick={() => openDraft(d)}
                  onDelete={() =>
                    setDeleteTarget({
                      kind: 'draft',
                      id: d.id,
                      title: d.title.trim() || 'Untitled draft',
                    })
                  }
                  onSchedule={() => setScheduleTarget(d)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* Departure Lounge — drafts queued for publish. Orange bar
            on each tile shows the scheduled time. Clicking opens
            the reader; the trash button cancels the schedule. */}
        {departureDrafts.length > 0 ? (
          <section>
            <header className="flex items-baseline gap-2 mb-3">
              <PlaneTakeoff className="h-3.5 w-3.5 text-evari-gold" />
              <h2 className="text-xs uppercase tracking-[0.16em] text-evari-dim">
                Departure Lounge
              </h2>
              <span className="text-xs text-evari-dimmer tabular-nums">
                {departureDrafts.length}
              </span>
              <span className="ml-2 text-[10px] text-evari-dimmer italic">
                Scheduled to publish
              </span>
            </header>
            <div className="grid gap-6 items-start w-full grid-cols-5">
              {departureDrafts.map((d) => (
                <DraftTile
                  key={d.id}
                  draft={d}
                  badge="Scheduled"
                  onClick={() => openDraft(d)}
                  onSchedule={() => setScheduleTarget(d)}
                  onUnschedule={async () => {
                    await fetch(`/api/journals/${d.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ scheduledFor: null }),
                    });
                    startTransition(() => router.refresh());
                  }}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* Unpublished on Shopify — stubs Craig started in Shopify admin
            but hasn't published yet. Kept in their own lane so they
            don't pollute the Published grid with broken-looking tiles. */}
        {unpublishedArticles.length > 0 ? (
          <section>
            <header className="flex items-baseline gap-2 mb-3">
              <Clock className="h-3.5 w-3.5 text-evari-dim" />
              <h2 className="text-xs uppercase tracking-[0.16em] text-evari-dim">
                Unpublished on Shopify
              </h2>
              <span className="text-xs text-evari-dimmer tabular-nums">
                {unpublishedArticles.length}
              </span>
              <span className="ml-2 text-[10px] text-evari-dimmer italic">
                Stubs started in Shopify admin, not yet live
              </span>
            </header>
            <div className="grid gap-6 items-start w-full grid-cols-5">
              {unpublishedArticles.map((a) => (
                <PublishedTile
                  key={a.id}
                  article={a}
                  linked={publishedDraftIds.has(a.id)}
                  onClick={() => openPublished(a)}
                  onDelete={() =>
                    setDeleteTarget({
                      kind: 'article',
                      id: a.id,
                      title: a.title || 'Untitled article',
                    })
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* Published (live Shopify articles + any draft-linked ones not in the Shopify feed) */}
        <section>
          <header className="flex items-baseline gap-2 mb-3">
            <CheckCircle2 className="h-3.5 w-3.5 text-evari-success" />
            <h2 className="text-xs uppercase tracking-[0.16em] text-evari-dim">
              Published
            </h2>
            <span className="text-xs text-evari-dimmer tabular-nums">
              {publishedArticles.length + draftOnlyPublished.length}
            </span>
          </header>
          {publishedArticles.length === 0 && draftOnlyPublished.length === 0 ? (
            <div className="rounded-lg border border-white/5 bg-evari-surface/40 p-10 text-center text-sm text-evari-dim">
              {blogs.length === 0
                ? 'Shopify isn\u2019t connected yet. New journals will be saved as drafts and can be published when the connection is live.'
                : 'No published articles in this lane yet. Click New above to start one.'}
            </div>
          ) : (
            <div className="grid gap-6 items-start w-full grid-cols-5">
              {publishedArticles.map((a) => (
                <PublishedTile
                  key={a.id}
                  article={a}
                  linked={publishedDraftIds.has(a.id)}
                  onClick={() => openPublished(a)}
                />
              ))}
              {draftOnlyPublished.map((d) => (
                <DraftTile
                  key={d.id}
                  draft={d}
                  badge="Published"
                  onClick={() => openDraft(d)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      )}

      {/* Delete confirmation — emphatic language because Shopify
          article deletes are permanent and dashboard drafts aren't
          recoverable either. */}
      {deleteTarget ? (
        <DeleteConfirm
          target={deleteTarget}
          busy={deleting}
          error={deleteError}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
          onConfirm={confirmDelete}
        />
      ) : null}

      {/* New-journal wizard — opens when the user clicks + New on
          the lane bar. Hands the composed payload back via
          handleWizardComplete which creates the draft and routes
          into the editor. */}
      <NewJournalWizard
        open={wizardOpen}
        laneKey={lane.key}
        laneLabel={lane.label}
        onClose={() => setWizardOpen(false)}
        onComplete={handleWizardComplete}
      />

      {/* Schedule dialog — Studio Design → Departure Lounge */}
      {scheduleTarget ? (
        <ScheduleDialog
          draft={scheduleTarget}
          laneLabel={lane.label}
          onCancel={() => setScheduleTarget(null)}
          onSave={async (iso) => {
            await fetch(`/api/journals/${scheduleTarget.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scheduledFor: iso }),
            });
            setScheduleTarget(null);
            startTransition(() => router.refresh());
          }}
        />
      ) : null}
    </div>
  );
}

function DeleteConfirm({
  target,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  target:
    | { kind: 'draft'; id: string; title: string }
    | { kind: 'article'; id: string; title: string };
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const where =
    target.kind === 'draft'
      ? 'from the Evari dashboard'
      : 'from your Shopify store';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={busy ? undefined : onCancel}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-lg bg-evari-carbon shadow-[0_12px_40px_rgba(0,0,0,0.5)] ring-1 ring-evari-edge"
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-evari-warn/15 text-evari-warn flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-evari-text">
                Delete this {target.kind === 'draft' ? 'draft' : 'article'}?
              </h3>
              <p className="mt-2 text-sm text-evari-dim leading-snug">
                <span className="font-medium text-evari-text">“{target.title}”</span>{' '}
                will be permanently removed {where}.{' '}
                <span className="text-evari-warn font-medium">
                  This cannot be recovered.
                </span>
              </p>
              {error ? (
                <p className="mt-3 text-xs text-evari-warn">{error}</p>
              ) : null}
            </div>
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="text-sm px-4 py-2 rounded-md text-evari-dim hover:text-evari-text hover:bg-evari-surface/60 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-md bg-evari-warn text-white hover:brightness-105 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {busy ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shape returned by /api/journals/ai-schedule. */
interface AiScheduleSuggestion {
  iso: string;
  label: string;
  reasoning: string;
}

/**
 * Schedule a draft for publish, Studio Design to Departure Lounge.
 *
 * On open we fire /api/journals/ai-schedule with the draft's lane,
 * title and summary. The endpoint returns a one-sentence cadence
 * hint and three send windows. Each window is rendered as a pill
 * the user can click to fill the manual picker. Pills + manual
 * picker share the same `value` state so saving always uses the
 * latest selection.
 */
function ScheduleDialog({
  draft,
  laneLabel,
  onCancel,
  onSave,
}: {
  draft: JournalDraft;
  laneLabel: string;
  onCancel: () => void;
  onSave: (iso: string) => Promise<void> | void;
}) {
  // Default value: the existing schedule, or 'tomorrow at 09:00' if
  // none. Format as YYYY-MM-DDTHH:mm for <input type='datetime-local'>.
  const initial = draft.scheduledFor
    ? new Date(draft.scheduledFor)
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d;
      })();
  const [value, setValue] = useState(toLocalInputValue(initial));
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<AiScheduleSuggestion[]>([]);
  const [frequencyHint, setFrequencyHint] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(true);
  const [activeIso, setActiveIso] = useState<string | null>(null);

  // Fetch AI suggestions once on open. We pass the lane + draft
  // metadata so the model can pick slots that fit the article
  // (launch pieces lean weekday morning, lifestyle reads weekend).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAiLoading(true);
      try {
        const res = await fetch('/api/journals/ai-schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            laneLabel,
            articleTitle: stripHtml(draft.title) || '',
            articleSummary: stripHtml(draft.summary ?? '') || '',
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          suggestions?: AiScheduleSuggestion[];
          frequencyHint?: string;
        };
        if (cancelled) return;
        if (json.ok && Array.isArray(json.suggestions)) {
          setSuggestions(json.suggestions);
        }
        if (json.frequencyHint) setFrequencyHint(json.frequencyHint);
      } catch {
        // Soft-fail: dialog still works as a manual picker.
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.id, draft.title, draft.summary, laneLabel]);

  const pickSuggestion = (s: AiScheduleSuggestion) => {
    setActiveIso(s.iso);
    setValue(toLocalInputValue(new Date(s.iso)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={busy ? undefined : onCancel}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg rounded-lg bg-evari-carbon shadow-[0_12px_40px_rgba(0,0,0,0.5)] ring-1 ring-evari-edge"
      >
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-evari-gold/15 text-evari-gold flex items-center justify-center shrink-0">
              <PlaneTakeoff className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-evari-text">
                Schedule for departure
              </h3>
              <p className="mt-1 text-sm text-evari-dim leading-snug">
                Pick when{' '}
                <span className="text-evari-text font-medium">
                  “{stripHtml(draft.title) || 'this draft'}”
                </span>{' '}
                should publish to Shopify.
              </p>
            </div>
          </div>

          {/* Frequency hint banner. Sits above the pills so the user
              gets the strategic context before tactical times. */}
          {(aiLoading || frequencyHint) ? (
            <div className="rounded-md bg-evari-gold/10 ring-1 ring-evari-gold/20 px-3 py-2 text-[12px] text-evari-text leading-snug">
              {aiLoading ? (
                <span className="inline-flex items-center gap-2 text-evari-dim">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Reading the brand brief, picking your best send windows…
                </span>
              ) : (
                <span>
                  <span className="font-semibold text-evari-gold">
                    Cadence:{' '}
                  </span>
                  {frequencyHint}
                </span>
              )}
            </div>
          ) : null}

          {/* AI-picked send slots. Each pill shows the day/time + the
              one-line reasoning. Selected pill gets a gold ring. */}
          {suggestions.length > 0 ? (
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dim font-semibold pl-[20px] pt-[10px] pb-[10px]">
                Suggested windows
              </div>
              <div className="grid gap-2">
                {suggestions.map((s) => {
                  const selected = activeIso === s.iso;
                  return (
                    <button
                      key={s.iso}
                      type="button"
                      onClick={() => pickSuggestion(s)}
                      className={cn(
                        'text-left rounded-md px-3 py-2 transition',
                        'bg-[rgb(var(--evari-input-fill))] hover:bg-[rgb(var(--evari-input-fill-focus))]',
                        selected
                          ? 'ring-2 ring-evari-gold'
                          : 'ring-1 ring-transparent',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-evari-text">
                          {s.label}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dim">
                          {formatRelative(s.iso)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-evari-dim leading-snug">
                        {s.reasoning}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <label className="block">
            <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dim font-semibold pl-[20px] pt-[10px] pb-[10px]">
              Or pick a custom time
            </div>
            <input
              type="datetime-local"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setActiveIso(null);
              }}
              className="w-full rounded-md px-3 py-2 text-sm bg-[rgb(var(--evari-input-fill))] text-evari-text focus:outline-none focus:bg-[rgb(var(--evari-input-fill-focus))]"
            />
          </label>
          <p className="text-[11px] text-evari-dimmer leading-snug px-1">
            The article moves to the Departure Lounge until the
            scheduled time, then publishes to Shopify automatically.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="text-sm px-4 py-2 rounded-md text-evari-dim hover:text-evari-text hover:bg-evari-surface/60 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!value) return;
                setBusy(true);
                try {
                  await onSave(new Date(value).toISOString());
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy || !value}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-md bg-evari-gold text-evari-goldInk hover:brightness-105 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlaneTakeoff className="h-3.5 w-3.5" />
              )}
              {busy ? 'Saving…' : 'Send to Departure Lounge'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Short relative tag for a future ISO timestamp, e.g. "Tomorrow",
 * "In 3 days". Falls back to a date for anything beyond a week.
 */
function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const days = Math.round((t - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `In ${days} days`;
  return new Date(t).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

/** Convert a Date into the YYYY-MM-DDTHH:mm string the
 *  datetime-local input expects (in the user's local time). */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours(),
    )}:${pad(d.getMinutes())}`
  );
}

// ─────────────────────────────────────────────────────────────────────
// ArticleReader — the in-page Shopify-style reader.
//
// Renders inside the same viewable area as the tile grid, so clicking
// a thumbnail feels like "opening" the article (not navigating away).
// Sticky top bar gives the user Back + Edit + Open on Shopify.
// ─────────────────────────────────────────────────────────────────────

function ArticleReader({
  reader,
  onClose,
  onEdit,
  onUseAsTemplate,
  laneLabel,
}: {
  reader:
    | { kind: 'draft'; draft: JournalDraft }
    | { kind: 'article'; article: ShopifyArticle; linkedDraftId?: string };
  onClose: () => void;
  onEdit: (draftId: string) => void;
  onUseAsTemplate: () => Promise<void>;
  laneLabel: string;
}) {
  if (reader.kind === 'draft') {
    const d = reader.draft;
    const rawBlocks = (d.editorData as { blocks?: unknown })?.blocks;
    const blocks: JournalBlock[] = Array.isArray(rawBlocks)
      ? (rawBlocks as JournalBlock[]).map((b, i) => ({
          id: (b as { id?: string }).id ?? `b${i}`,
          type: (b as { type?: string }).type ?? 'paragraph',
          data: (b as { data?: Record<string, unknown> }).data ?? {},
        }))
      : [];
    return (
      <div className="flex-1 overflow-y-auto">
        <ReaderBar
          subtitle={laneLabel}
          onClose={onClose}
          editHref={() => onEdit(d.id)}
          onUseAsTemplate={onUseAsTemplate}
        />
        <div className="max-w-3xl mx-auto px-10 py-10">
          <ShopifyPreview
            title={d.title || 'Untitled draft'}
            author={d.author}
            publishedAt={d.publishedAt}
            coverImageUrl={d.coverImageUrl}
            blocks={blocks}
            subLabel={laneLabel}
            summary={d.summary}
          />
        </div>
      </div>
    );
  }

  // Shopify article — we only have bodyHtml (the HTML Shopify stores).
  // Render it inside the shopify-preview scope so it picks up the same
  // type treatment as the live composer preview.
  const a = reader.article;
  return (
    <div className="flex-1 overflow-y-auto">
      <ReaderBar
        subtitle={laneLabel}
        onClose={onClose}
        editHref={reader.linkedDraftId ? () => onEdit(reader.linkedDraftId as string) : undefined}
        externalHref={a.handle ? `https://evari.cc/blogs/${a.blog.handle}/${a.handle}` : undefined}
        onUseAsTemplate={onUseAsTemplate}
      />
      <article className="shopify-preview max-w-3xl mx-auto px-10 py-10">
        {a.image?.url ? (
          <div className="shopify-preview__cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.image.url} alt={a.image.altText ?? a.title} />
            {laneLabel ? (
              <span className="shopify-preview__sublabel">{laneLabel}</span>
            ) : null}
          </div>
        ) : null}
        <header className="shopify-preview__head">
          <h1 className="shopify-preview__title">{a.title}</h1>
        </header>
        <div
          className="shopify-preview__body"
          // Shopify's bodyHtml is curated by the merchant in the admin
          // and displayed on the storefront as-is; we render it the
          // same way so the reader view matches the published post.
          dangerouslySetInnerHTML={{ __html: a.bodyHtml || '' }}
        />
        {(a.author?.name ?? '').trim() ? (
          <p className="shopify-preview__byline">By {a.author?.name}</p>
        ) : null}
        {a.publishedAt ? (
          <p className="shopify-preview__date">
            {new Date(a.publishedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        ) : null}
      </article>
    </div>
  );
}

function ReaderBar({
  subtitle,
  onClose,
  editHref,
  externalHref,
  onUseAsTemplate,
}: {
  subtitle: string;
  onClose: () => void;
  editHref?: () => void;
  externalHref?: string;
  onUseAsTemplate?: () => Promise<void>;
}) {
  const [templating, setTemplating] = useState(false);
  async function handleTemplate() {
    if (!onUseAsTemplate) return;
    setTemplating(true);
    try {
      await onUseAsTemplate();
    } finally {
      setTemplating(false);
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 px-6 pt-4 pb-3 border-b border-evari-edge sticky top-0 bg-evari-ink z-10">
      <button
        onClick={onClose}
        className="inline-flex items-center gap-1.5 text-xs text-evari-dim hover:text-evari-text transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Journals
      </button>
      <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
        {subtitle} · Preview
      </span>
      <div className="flex items-center gap-2">
        {externalHref ? (
          <a
            href={externalHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-evari-dim hover:text-evari-text transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open on Shopify
          </a>
        ) : null}
        {onUseAsTemplate ? (
          <button
            onClick={handleTemplate}
            disabled={templating}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-[rgb(var(--evari-input-fill))] text-evari-dim hover:text-evari-text hover:bg-[rgb(var(--evari-input-fill-focus))] transition-colors disabled:opacity-60"
            title="Duplicate this article into a new draft"
          >
            {templating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {templating ? 'Cloning…' : 'Use as template'}
          </button>
        ) : null}
        {editHref ? (
          <button
            onClick={editHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-evari-gold text-evari-goldInk hover:brightness-105 transition"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Tiles — mirror the evari.cc Shopify journal layout exactly:
//   • slightly-portrait cover image, cover-cropped (matches the
//     storefront ratio measured off Craig's reference screenshot)
//   • tiny uppercase date
//   • bigger title (2-line clamp)
//   • 3-line body excerpt (dim)
//   • tiny uppercase "BY <AUTHOR>" byline
// Column width is unchanged — only the internal rhythm shifts.
// Both tile variants share the exact same IMAGE_ASPECT so draft
// rows and published rows line up perfectly. To change the shape
// of every journal thumbnail, change this one constant.
// ─────────────────────────────────────────────────────────────────────

/**
 * Shared image aspect across DraftTile + PublishedTile.
 *
 *   1 : 1.2 (slightly portrait) — the evari.cc storefront blog
 *   card ratio, confirmed by Craig. Change this one value to
 *   restyle every journal thumbnail on the page.
 *
 * ─── DO NOT regress this ───
 *
 * History of what got rejected and why:
 *   - 1 : 1    (square)        — too square
 *   - 4 : 3    (landscape)     — too landscape
 *   - 10 : 11  (1 : 1.1)       — still too close to square
 *   - 5 : 6    (1 : 1.2)       — ✓ Craig confirmed this ratio
 *
 * WHY WE USE INLINE STYLE, NOT A TAILWIND CLASS:
 *
 * Tailwind's JIT scanner only emits CSS for class names that
 * appear as unbroken literal strings in source files. Storing
 * `aspect-[5/6]` in a `const` and composing it via cn() worked
 * in dev but dropped out of the production CSS bundle on some
 * builds, which is why the ratio kept snapping back after
 * deploys / clean rebuilds. `aspectRatio` is a standard CSS
 * property with full browser support, so the inline style wins
 * every time and can never be purged.
 *
 * The Thumbnail component below is the single place in the app
 * that owns this aspect; every tile renders through it. If you
 * find yourself adding a new aspect constant somewhere else,
 * route it through here instead so they can never drift apart.
 *
 * The grids above use `items-start` so a short tile can't stretch
 * to match a tall sibling and invent dead space under its image.
 */
const IMAGE_ASPECT_RATIO = '5 / 6';

function formatShopifyDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).toUpperCase();
}

/**
 * Strip every HTML tag + entity out of a Shopify-sourced string.
 *
 * Crucially this preserves vertical whitespace: <br>, <p> and <div>
 * boundaries become real \n characters so paragraph breaks a user
 * wrote on Shopify (or in the Journals composer Summary textarea)
 * survive the wash. The tile renderer uses `whitespace-pre-line`
 * on the excerpt so \n paints as a real line break.
 *
 * Older Evari imports have raw <p class="p1">…</p> / </h3> / </h4>
 * leaking into Summary — those tags are stripped too but the break
 * between paragraphs is kept.
 */
function stripHtml(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    // Preserve paragraph + line breaks as \n before we nuke tags.
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<\/h[1-6]\s*>/gi, '\n\n')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Collapse runs of spaces/tabs but leave \n alone, then clamp
    // consecutive blank lines to one blank.
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
}

/**
 * Pull a presentable excerpt from an article. Prefers the clean
 * `summary` field; falls back to the first ~200 chars of stripped
 * bodyHtml so every tile reads with the same rhythm (title +
 * description + byline) even when an author forgot to fill the
 * summary on Shopify.
 */
function articleExcerpt(article: ShopifyArticle, max = 180): string {
  const fromSummary = stripHtml(article.summary);
  if (fromSummary) {
    return fromSummary.length <= max
      ? fromSummary
      : fromSummary.slice(0, max - 1).trimEnd() + '…';
  }
  const fromBody = stripHtml(article.bodyHtml);
  if (!fromBody) return '';
  return fromBody.length <= max
    ? fromBody
    : fromBody.slice(0, max - 1).trimEnd() + '…';
}

/**
 * Uniform thumbnail wrapper used by both DraftTile and PublishedTile
 * so the image frame, aspect ratio, radius, and hover chrome match
 * perfectly across every tile on the Journals page.
 */
function Thumbnail({
  src,
  alt,
  fallback,
  fromPalette,
}: {
  src?: string | null;
  alt?: string;
  fallback: React.ReactNode;
  /** Use the muted dashboard palette when no image is available (drafts),
   *  or a flat evari-surface tone for published tiles. */
  fromPalette: 'draft' | 'published';
}) {
  // Track broken image loads so we fall back to the placeholder
  // instead of the browser's default broken-image icon (which is what
  // Craig saw on the CS+ RR Edition tile).
  const [broken, setBroken] = useState(false);
  const showImage = src && !broken;
  return (
    <div
      // Inline style + hardcoded class (not a computed Tailwind
      // expression) so the 1:1.2 aspect cannot be lost to JIT purging
      // or to a CSS override lower in the cascade. Keep BOTH — the
      // class handles the common case, the inline style is the
      // belt-and-braces guarantee.
      style={{ aspectRatio: IMAGE_ASPECT_RATIO }}
      className={cn(
        'aspect-[5/6] w-full overflow-hidden rounded-sm',
        fromPalette === 'draft'
          ? 'bg-gradient-to-br from-evari-surfaceSoft/50 to-evari-surface/20'
          : 'bg-evari-surface/30',
      )}
    >
      {showImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={alt ?? ''}
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          {fallback}
        </div>
      )}
    </div>
  );
}

function DraftTile({
  draft,
  badge,
  onClick,
  onDelete,
  onSchedule,
  onUnschedule,
}: {
  draft: JournalDraft;
  badge?: string;
  onClick?: () => void;
  onDelete?: () => void;
  /** When supplied, a small calendar button on the tile opens the
   *  schedule dialog (Studio Design → Departure Lounge). */
  onSchedule?: () => void;
  /** When supplied, the trash button cancels the schedule rather
   *  than deleting the draft (used on Departure Lounge tiles). */
  onUnschedule?: () => void | Promise<void>;
}) {
  const title = stripHtml(draft.title) || 'Untitled draft';
  const date = formatShopifyDate(draft.updatedAt);
  const excerpt = stripHtml(draft.summary);
  const author = (draft.author?.trim()) || 'Evari';
  // Departure Lounge tiles get an orange bar in the upper-left
  // showing the scheduled date + time (Craig's spec).
  const scheduled = draft.scheduledFor ? new Date(draft.scheduledFor) : null;
  return (
    <div className="group relative block">
      <button
        onClick={onClick}
        className="text-left block w-full"
      >
        <div className="relative">
          <Thumbnail
            src={draft.coverImageUrl}
            fallback={<FileText className="h-7 w-7 text-evari-dimmer" />}
            fromPalette="draft"
          />
          {scheduled ? (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-[0.12em] bg-evari-gold text-evari-goldInk shadow-[0_2px_6px_rgba(0,0,0,0.3)]">
              <PlaneTakeoff className="h-3 w-3" />
              {scheduled.toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          ) : null}
        </div>
        <div className="pt-[10px] pb-[10px] px-[6px]">
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-evari-dimmer">
            <span>{date}</span>
            <span
              className={cn(
                'px-2 py-0.5 rounded font-semibold tracking-[0.14em]',
                badge
                  ? 'bg-orange-500 text-white'
                  : 'bg-blue-500 text-white',
              )}
            >
              {badge ?? 'Draft'}
            </span>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold text-evari-text leading-snug line-clamp-2 group-hover:text-evari-gold transition-colors">
            {title}
          </h3>
          {excerpt ? (
            <p className="mt-2 text-[12px] text-evari-dim leading-snug line-clamp-3 whitespace-pre-line">
              {excerpt}
            </p>
          ) : (
            <p className="mt-2 text-[12px] text-evari-dimmer/70 italic leading-snug">
              Empty draft, click to start writing.
            </p>
          )}
          <p className="mt-3 text-[9px] uppercase tracking-[0.14em] text-evari-dimmer">
            By {author}
          </p>
        </div>
      </button>
    </div>
  );
}

function PublishedTile({
  article,
  linked,
  onClick,
  onDelete,
}: {
  article: ShopifyArticle;
  linked: boolean;
  onClick?: () => void;
  onDelete?: () => void;
}) {
  const date = formatShopifyDate(article.publishedAt ?? article.updatedAt);
  const title = stripHtml(article.title) || 'Untitled article';
  // Every tile gets both a title AND an excerpt. If the article's
  // `summary` field is empty, articleExcerpt() falls back to the
  // first ~180 chars of the stripped body so the rhythm stays
  // consistent across the grid.
  const excerpt = articleExcerpt(article);
  const author = article.author?.name?.trim() || 'Evari';
  return (
    <div className="group relative block">
      <button
        onClick={onClick}
        className="text-left block w-full"
      >
        <Thumbnail
          src={article.image?.url ?? null}
          alt={article.image?.altText ?? article.title}
          fallback={<ImageIcon className="h-7 w-7 text-evari-dimmer" />}
          fromPalette="published"
        />
        <div className="pt-[10px] pb-[10px] px-[6px]">
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-evari-dimmer">
            <span>{date}</span>
            {linked ? (
              <span className="px-1.5 py-0.5 rounded bg-evari-gold/15 text-evari-gold">
                Editable
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 text-[15px] font-semibold text-evari-text leading-snug line-clamp-2 group-hover:text-evari-gold transition-colors">
            {title}
          </h3>
          <p className="mt-2 text-[12px] text-evari-dim leading-snug line-clamp-3 whitespace-pre-line">
            {excerpt || 'No summary on Shopify yet.'}
          </p>
          <p className="mt-3 text-[9px] uppercase tracking-[0.14em] text-evari-dimmer">
            By {author}
          </p>
        </div>
      </button>
      {onDelete ? <TileDeleteButton onClick={onDelete} /> : null}
    </div>
  );
}

/**
 * Small trash button overlaid on the top-right of a deletable tile.
 * Visible at rest so discovery is easy; clearly marked so the click
 * target reads as destructive (warn tone, subtle hover lift). Stops
 * propagation so the parent tile's open-reader click doesn't fire.
 */
function TileDeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Delete"
      aria-label="Delete"
      className="absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded-md bg-black/50 text-white/80 hover:bg-evari-warn hover:text-white backdrop-blur-sm transition-colors"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
