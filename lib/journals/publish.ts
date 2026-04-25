/**
 * Shared "publish a journal draft to Shopify" routine.
 *
 * Originally inlined in app/api/journals/[id]/publish/route.ts. Pulled
 * out so the Vercel cron worker (app/api/cron/publish-scheduled) can
 * call the same code path without going through HTTP.
 *
 * Behaviour:
 *  - Resolves the target Shopify blog from the draft's lane when
 *    the caller doesn't pass an explicit blogId.
 *  - First publish, articleCreate. Subsequent publishes,
 *    articleUpdate.
 *  - Falls back to a "dry run" stamp if Shopify is not configured,
 *    so local dev still moves a draft into the Published lane.
 */
import {
  editorDataToHtml,
  editorDataToSummary,
} from '@/lib/journals/editorToHtml';
import {
  updateDraft,
  type JournalDraft,
} from '@/lib/journals/repository';
import {
  createArticle,
  isShopifyConnected,
  listBlogs,
  updateArticleMetadata,
} from '@/lib/shopify';

export interface PublishOptions {
  /** Optional explicit Shopify blog GID. When omitted we resolve from
   *  the draft's blogTarget lane (cs_plus / blogs). */
  blogId?: string;
  /** When true (default) the article is published live; when false
   *  it is created/updated as a draft on Shopify. */
  isPublished?: boolean;
}

export type PublishResult =
  | {
      ok: true;
      /** Shopify article record; may be null on a re-publish that
       *  only touched SEO metafields (so updateArticleMetadata had
       *  nothing to patch on the article itself). */
      article: { id: string; handle?: string } | null;
      dryRun?: boolean;
    }
  | { ok: false; error: string; status: number };

/**
 * Resolve the Shopify blog GID for a draft. Pure helper so the cron
 * worker can call it without re-implementing the lane-matching
 * heuristic.
 */
async function resolveBlogId(draft: JournalDraft): Promise<string | null> {
  if (draft.shopifyBlogId) return draft.shopifyBlogId;
  if (draft.blogTarget.startsWith('gid://')) return draft.blogTarget;
  const blogs = await listBlogs();
  const lane = draft.blogTarget.toLowerCase();
  const laneMatchers: Record<string, (b: { title: string; handle: string }) => boolean> = {
    cs_plus: (b) =>
      /cs\s*\+|cs-plus|bike\s*build/i.test(b.title) ||
      /cs-plus|bike-build|cs_plus/.test(b.handle),
    blogs: (b) =>
      /^blogs?$/i.test(b.title) ||
      /^blogs?$/i.test(b.handle) ||
      /journal/i.test(b.handle),
  };
  const matcher =
    laneMatchers[lane] ??
    ((b: { title: string; handle: string }) =>
      b.handle === draft.blogTarget || b.title === draft.blogTarget);
  const match = blogs.find(matcher) ?? blogs[0];
  return match?.id ?? null;
}

export async function publishDraft(
  draft: JournalDraft,
  opts: PublishOptions = {},
): Promise<PublishResult> {
  if (!draft.title.trim()) {
    return { ok: false, error: 'Title required before publishing', status: 400 };
  }
  const bodyHtml = editorDataToHtml(draft.editorData);
  if (!bodyHtml.trim()) {
    return { ok: false, error: 'Article body is empty', status: 400 };
  }

  const blogId = opts.blogId ?? (await resolveBlogId(draft));
  if (!blogId) {
    return { ok: false, error: 'No matching Shopify blog found', status: 500 };
  }

  const summary =
    draft.summary?.trim() || editorDataToSummary(draft.editorData);
  const shouldPublish = opts.isPublished ?? true;

  // First publish, articleCreate. Re-publish, articleUpdate.
  if (!draft.shopifyArticleId) {
    if (!isShopifyConnected()) {
      // Dry run: stamp the draft anyway so the UI moves it into
      // the Published lane in local dev.
      await updateDraft(draft.id, {
        shopifyArticleId: 'gid://shopify/Article/0',
        shopifyBlogId: blogId,
        publishedAt: new Date().toISOString(),
      });
      return {
        ok: true,
        dryRun: true,
        article: { id: 'gid://shopify/Article/0' },
      };
    }
    const res = await createArticle({
      blogId,
      title: draft.title,
      bodyHtml,
      summary: summary || undefined,
      author: draft.author ?? 'Evari',
      tags: draft.tags,
      isPublished: shouldPublish,
      metaTitle: draft.seoTitle ?? undefined,
      metaDescription: draft.seoDescription ?? undefined,
    });
    if (!res.ok) {
      return { ok: false, error: res.error, status: 500 };
    }
    await updateDraft(draft.id, {
      shopifyArticleId: res.article.id,
      shopifyBlogId: blogId,
      publishedAt: new Date().toISOString(),
    });
    return { ok: true, article: res.article };
  }

  // Re-publish.
  const res = await updateArticleMetadata({
    articleId: draft.shopifyArticleId,
    title: draft.title,
    bodyHtml,
    summary: summary || undefined,
    metaTitle: draft.seoTitle ?? undefined,
    metaDescription: draft.seoDescription ?? undefined,
  });
  if (!res.ok) {
    return { ok: false, error: 'Shopify article update failed', status: 500 };
  }
  await updateDraft(draft.id, {
    publishedAt: new Date().toISOString(),
  });
  // updateArticleMetadata's return type is permissive (covers dry-run +
  // metafield-only paths). Normalise to { id, handle? } | null so the
  // cron worker can rely on PublishResult shape.
  const article =
    res.article && typeof res.article === 'object' && 'id' in res.article
      ? {
          id: String(res.article.id),
          handle:
            'handle' in res.article && typeof res.article.handle === 'string'
              ? res.article.handle
              : undefined,
        }
      : null;
  return { ok: true, article };
}
