'use client';

import { useMemo, useState, useTransition } from 'react';
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
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { JournalDraft } from '@/lib/journals/repository';
import type { ShopifyArticle, ShopifyBlog } from '@/lib/shopify';
import { htmlToBlocks } from '@/lib/journals/htmlToBlocks';
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
  // A draft counts as "Pending" if it has no Shopify article yet, and
  // "Published" if it does — we dedupe the latter against `articles`
  // (we only show each story once in the published grid).
  const pendingDrafts = laneDrafts.filter((d) => !d.shopifyArticleId);
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

  async function newJournal() {
    setCreating(true);
    try {
      const res = await fetch('/api/journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogTarget: lane.key }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        draft?: { id: string };
      };
      if (data.ok && data.draft) {
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
      <div className="flex-1 overflow-y-auto px-10 py-8 space-y-10">
        {/* Pending (unpublished drafts) */}
        {pendingDrafts.length > 0 ? (
          <section>
            <header className="flex items-baseline gap-2 mb-3">
              <Clock className="h-3.5 w-3.5 text-evari-gold" />
              <h2 className="text-xs uppercase tracking-[0.16em] text-evari-dim">
                Pending
              </h2>
              <span className="text-xs text-evari-dimmer tabular-nums">
                {pendingDrafts.length}
              </span>
            </header>
            <div className="grid gap-6 items-start grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
              {pendingDrafts.map((d) => (
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
            <div className="grid gap-6 items-start grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
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
            <div className="grid gap-6 items-start grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
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
}: {
  draft: JournalDraft;
  badge?: string;
  onClick?: () => void;
  onDelete?: () => void;
}) {
  const title = stripHtml(draft.title) || 'Untitled draft';
  const date = formatShopifyDate(draft.updatedAt);
  const excerpt = stripHtml(draft.summary);
  const author = (draft.author?.trim()) || 'Evari';
  return (
    <div className="group relative block">
      <button
        onClick={onClick}
        className="text-left block w-full"
      >
        <Thumbnail
          src={draft.coverImageUrl}
          fallback={<FileText className="h-7 w-7 text-evari-dimmer" />}
          fromPalette="draft"
        />
        <div className="pt-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
            <span>{date}</span>
            <span
              className={cn(
                'px-1.5 py-0.5 rounded',
                badge
                  ? 'bg-evari-success/15 text-evari-success'
                  : 'bg-evari-gold/15 text-evari-gold',
              )}
            >
              {badge ?? 'Draft'}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-evari-text leading-snug line-clamp-2 group-hover:text-evari-gold transition-colors">
            {title}
          </h3>
          {excerpt ? (
            <p className="mt-2 text-sm text-evari-dim leading-snug line-clamp-3 whitespace-pre-line">
              {excerpt}
            </p>
          ) : (
            <p className="mt-2 text-sm text-evari-dimmer/70 italic leading-snug">
              Empty draft, click to start writing.
            </p>
          )}
          <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
            By {author}
          </p>
        </div>
      </button>
      {onDelete ? <TileDeleteButton onClick={onDelete} /> : null}
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
        <div className="pt-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
            <span>{date}</span>
            {linked ? (
              <span className="px-1.5 py-0.5 rounded bg-evari-gold/15 text-evari-gold">
                Editable
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-evari-text leading-snug line-clamp-2 group-hover:text-evari-gold transition-colors">
            {title}
          </h3>
          <p className="mt-2 text-sm text-evari-dim leading-snug line-clamp-3 whitespace-pre-line">
            {excerpt || 'No summary on Shopify yet.'}
          </p>
          <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
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
