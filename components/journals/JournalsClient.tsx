'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  FileText,
  Image as ImageIcon,
  Clock,
  CheckCircle2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { JournalDraft } from '@/lib/journals/repository';
import type { ShopifyArticle, ShopifyBlog } from '@/lib/shopify';

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
  const publishedArticles = laneArticles;
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

  async function openDraft(id: string) {
    router.push(`/journals/${id}`);
  }

  async function openPublished(article: ShopifyArticle) {
    // If there's a local draft linked to this article, open that so
    // further edits go through the EditorJS source of truth.
    const linked = laneDrafts.find((d) => d.shopifyArticleId === article.id);
    if (linked) router.push(`/journals/${linked.id}`);
    // Otherwise nothing to edit — just offer a link out to Shopify. We
    // store that as a hover affordance on the tile.
  }

  function laneRefresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-evari-ink">
      {/* Sticky lane + actions bar */}
      <div className="flex items-center justify-between gap-4 px-6 pt-4 pb-3 border-b border-white/5 sticky top-0 bg-evari-ink z-10">
        <div className="flex items-center gap-1">
          {lanes.map((l) => {
            const active = l.key === lane.key;
            const count =
              drafts.filter((d) => d.blogTarget === l.key).length +
              articles.filter((a) => articleBelongsTo(a, l)).length;
            return (
              <button
                key={l.key}
                onClick={() => setLane(l)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm transition-colors',
                  active
                    ? 'bg-evari-accent text-evari-ink font-medium shadow-[0_0_0_1px_rgba(254,199,0,0.4)]'
                    : 'text-evari-dim hover:text-evari-text hover:bg-evari-surface/60',
                )}
              >
                {l.label}
                <span
                  className={cn(
                    'ml-2 text-[10px] tabular-nums',
                    active ? 'text-evari-ink/60' : 'text-evari-dimmer',
                  )}
                >
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
            className="inline-flex items-center gap-2 bg-evari-accent text-evari-ink text-sm font-medium px-4 py-1.5 rounded-md hover:opacity-90 transition disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {creating ? 'Creating…' : `New ${lane.key === 'cs_plus' ? 'CS+ build' : 'Blog'}`}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
        {/* Pending (unpublished drafts) */}
        {pendingDrafts.length > 0 ? (
          <section>
            <header className="flex items-baseline gap-2 mb-3">
              <Clock className="h-3.5 w-3.5 text-evari-accent" />
              <h2 className="text-xs uppercase tracking-[0.16em] text-evari-dim">
                Pending
              </h2>
              <span className="text-xs text-evari-dimmer tabular-nums">
                {pendingDrafts.length}
              </span>
            </header>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {pendingDrafts.map((d) => (
                <DraftTile key={d.id} draft={d} onClick={() => openDraft(d.id)} />
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
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
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
                  onClick={() => openDraft(d.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DraftTile({
  draft,
  badge,
  onClick,
}: {
  draft: JournalDraft;
  badge?: string;
  onClick?: () => void;
}) {
  const title = draft.title.trim() || 'Untitled draft';
  const updated = new Date(draft.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return (
    <button
      onClick={onClick}
      className="group relative text-left rounded-lg border border-white/5 bg-evari-surface/50 hover:bg-evari-surface transition-colors overflow-hidden"
    >
      <div className="aspect-[4/3] bg-gradient-to-br from-evari-surfaceSoft/50 to-evari-surface/20 flex items-center justify-center">
        {draft.coverImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={draft.coverImageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <FileText className="h-7 w-7 text-evari-dimmer" />
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-[10px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded',
              badge
                ? 'bg-evari-success/15 text-evari-success'
                : 'bg-evari-accent/15 text-evari-accent',
            )}
          >
            {badge ?? 'Draft'}
          </span>
          <span className="text-[10px] text-evari-dimmer tabular-nums">
            {updated}
          </span>
        </div>
        <h3 className="mt-2 text-sm text-evari-text line-clamp-2 group-hover:text-evari-accent transition-colors">
          {title}
        </h3>
      </div>
    </button>
  );
}

function PublishedTile({
  article,
  linked,
  onClick,
}: {
  article: ShopifyArticle;
  linked: boolean;
  onClick?: () => void;
}) {
  const date = (article.publishedAt ?? article.updatedAt)
    ? new Date(article.publishedAt ?? article.updatedAt).toLocaleDateString(
        undefined,
        { month: 'short', day: 'numeric' },
      )
    : '';
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-lg border border-white/5 bg-evari-surface/50 hover:bg-evari-surface transition-colors overflow-hidden"
    >
      <div className="aspect-[4/3] bg-evari-surface/30 overflow-hidden">
        {article.image?.url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={article.image.url}
            alt={article.image.altText ?? article.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-7 w-7 text-evari-dimmer" />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded bg-evari-success/15 text-evari-success">
            Live
          </span>
          <span className="text-[10px] text-evari-dimmer tabular-nums">
            {date}
          </span>
          {linked ? (
            <span className="text-[10px] text-evari-dimmer">· editable</span>
          ) : null}
        </div>
        <h3 className="mt-2 text-sm text-evari-text line-clamp-2 group-hover:text-evari-accent transition-colors">
          {article.title}
        </h3>
      </div>
    </button>
  );
}
