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

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
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
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {pendingDrafts.map((d) => (
                <DraftTile key={d.id} draft={d} onClick={() => openDraft(d.id)} />
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
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {unpublishedArticles.map((a) => (
                <PublishedTile
                  key={a.id}
                  article={a}
                  linked={publishedDraftIds.has(a.id)}
                  onClick={() => openPublished(a)}
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
 * 5:6 = 1 : 1.2 (slightly portrait) — matches the evari.cc
 * storefront blog card. Change this one value to restyle every
 * journal thumbnail on the page.
 */
const IMAGE_ASPECT = 'aspect-[5/6]';

function formatShopifyDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).toUpperCase();
}

/**
 * Strip every HTML tag + entity out of a Shopify-sourced string and
 * collapse whitespace. Shopify's article.summary is supposed to be
 * plain text but in practice a lot of the Evari catalogue has
 * raw <p class="p1">…</p> / </h3> / </h4> leaking through, especially
 * on older imports where the summary was copy-pasted out of the
 * body. Titles get the same treatment as belt-and-braces.
 */
function stripHtml(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
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
      className={cn(
        IMAGE_ASPECT,
        'w-full overflow-hidden rounded-sm',
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
}: {
  draft: JournalDraft;
  badge?: string;
  onClick?: () => void;
}) {
  const title = stripHtml(draft.title) || 'Untitled draft';
  const date = formatShopifyDate(draft.updatedAt);
  const excerpt = stripHtml(draft.summary);
  const author = (draft.author?.trim()) || 'Evari';
  return (
    <button
      onClick={onClick}
      className="group relative text-left flex flex-col"
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
          <p className="mt-2 text-sm text-evari-dim leading-snug line-clamp-3">
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
  const date = formatShopifyDate(article.publishedAt ?? article.updatedAt);
  const title = stripHtml(article.title) || 'Untitled article';
  // Every tile gets both a title AND an excerpt. If the article's
  // `summary` field is empty, articleExcerpt() falls back to the
  // first ~180 chars of the stripped body so the rhythm stays
  // consistent across the grid.
  const excerpt = articleExcerpt(article);
  const author = article.author?.name?.trim() || 'Evari';
  return (
    <button
      onClick={onClick}
      className="group text-left flex flex-col"
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
        <p className="mt-2 text-sm text-evari-dim leading-snug line-clamp-3">
          {excerpt || 'No summary on Shopify yet.'}
        </p>
        <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
          By {author}
        </p>
      </div>
    </button>
  );
}
