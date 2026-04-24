import { NextResponse } from 'next/server';

import {
  editorDataToHtml,
  editorDataToSummary,
} from '@/lib/journals/editorToHtml';
import { getDraft, updateDraft } from '@/lib/journals/repository';
import {
  createArticle,
  isShopifyConnected,
  listBlogs,
  updateArticleMetadata,
} from '@/lib/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/journals/[id]/publish
 *   body: { blogId?: string; isPublished?: boolean }
 *
 * Serialises the draft's EditorJS JSON → HTML and either creates a
 * new Shopify article (first publish) or updates the existing one
 * (subsequent publishes of an already-linked draft).
 *
 * `blogId` is optional — when omitted we resolve it from the draft's
 * `blogTarget` lane (cs_plus / blogs) against the live list of
 * Shopify blogs. This means Journals can POST /publish without
 * knowing the GID.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    blogId?: string;
    isPublished?: boolean;
  };
  const draft = await getDraft(id);
  if (!draft) {
    return NextResponse.json(
      { ok: false, error: 'Draft not found' },
      { status: 404 },
    );
  }
  if (!draft.title.trim()) {
    return NextResponse.json(
      { ok: false, error: 'Title required before publishing' },
      { status: 400 },
    );
  }
  const bodyHtml = editorDataToHtml(draft.editorData);
  if (!bodyHtml.trim()) {
    return NextResponse.json(
      { ok: false, error: 'Article body is empty' },
      { status: 400 },
    );
  }

  // Resolve blog ID from the lane if not supplied.
  let blogId = body.blogId ?? draft.shopifyBlogId ?? null;
  if (!blogId) {
    const blogs = await listBlogs();
    // Lane-matching heuristic: if blog_target looks like a Shopify
    // GID or an exact handle, use it directly; otherwise match the
    // lane key against titles/handles.
    if (draft.blogTarget.startsWith('gid://')) {
      blogId = draft.blogTarget;
    } else {
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
      blogId = match?.id ?? null;
    }
  }
  if (!blogId) {
    return NextResponse.json(
      { ok: false, error: 'No matching Shopify blog found' },
      { status: 500 },
    );
  }

  const summary = draft.summary?.trim() || editorDataToSummary(draft.editorData);
  const shouldPublish = body.isPublished ?? true;

  // First publish → articleCreate. Re-publish → articleUpdate.
  if (!draft.shopifyArticleId) {
    if (!isShopifyConnected()) {
      // Dry-run: stamp the draft anyway so the UI can show "published".
      await updateDraft(id, {
        shopifyArticleId: 'gid://shopify/Article/0',
        shopifyBlogId: blogId,
        publishedAt: new Date().toISOString(),
      });
      return NextResponse.json({
        ok: true,
        dryRun: true,
        article: { id: 'gid://shopify/Article/0' },
      });
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
      return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
    }
    await updateDraft(id, {
      shopifyArticleId: res.article.id,
      shopifyBlogId: blogId,
      publishedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, article: res.article });
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
    return NextResponse.json(
      { ok: false, error: 'Shopify article update failed' },
      { status: 500 },
    );
  }
  await updateDraft(id, {
    publishedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, article: res.article });
}
