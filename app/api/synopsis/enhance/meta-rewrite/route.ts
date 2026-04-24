import { NextResponse } from 'next/server';
import { getPagesOverview } from '@/lib/pages/overview';
import {
  getProduct,
  listArticles,
  listShopifyPages,
  updateArticleMetadata,
  updatePageMetadata,
  updateProduct,
} from '@/lib/integrations/shopify';
import { generateTextWithFallback, buildSystemPrompt } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';
const TITLE_MIN = 30;
const TITLE_MAX = 65;
const DESC_MIN = 80;
const DESC_MAX = 165;

/**
 * POST /api/synopsis/enhance/meta-rewrite
 *
 * Body:
 *   - { mode: 'list' } — returns the set of pages with weak meta copy and
 *     why each one is weak (too short, too long, generic, duplicated).
 *     The client uses this to show a confirmation modal.
 *   - { mode: 'apply', targets: [{ pageId, pageType, kind }] } — rewrites
 *     each target's meta title or description via Claude and writes back
 *     to Shopify. Returns per-target results so the client can show the
 *     new copy + mark rows complete.
 *
 * "Weak" = len outside the sane band (30-65 for titles, 80-165 for
 * descriptions) OR duplicated across pages. "Missing" copy is not this
 * endpoint's job, the Fix list already handles that.
 */

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

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    mode?: 'list' | 'apply';
    targets?: Array<{ pageId: string; pageType: 'product' | 'page' | 'article'; kind: 'meta-title' | 'meta-desc' }>;
  };

  if (body.mode === 'apply') {
    return apply(body.targets ?? []);
  }
  return list();
}

async function list() {
  const overview = await getPagesOverview();
  const weak: WeakTarget[] = [];

  const titleSeen = new Map<string, number>();
  const descSeen = new Map<string, number>();
  for (const r of overview.rows) {
    if (r.metaTitle) titleSeen.set(r.metaTitle.trim().toLowerCase(), (titleSeen.get(r.metaTitle.trim().toLowerCase()) ?? 0) + 1);
    if (r.metaDescription) descSeen.set(r.metaDescription.trim().toLowerCase(), (descSeen.get(r.metaDescription.trim().toLowerCase()) ?? 0) + 1);
  }

  for (const r of overview.rows) {
    const pageType: WeakTarget['pageType'] =
      r.type === 'product' ? 'product' : r.type === 'page' ? 'page' : 'article';

    if (r.metaTitle && r.metaTitleLen > 0) {
      const dup = titleSeen.get(r.metaTitle.trim().toLowerCase()) ?? 0;
      const reason: WeakTarget['reason'] | null =
        r.metaTitleLen < TITLE_MIN
          ? 'too-short'
          : r.metaTitleLen > TITLE_MAX
            ? 'too-long'
            : dup > 1
              ? 'duplicate'
              : null;
      if (reason) {
        weak.push({
          pageId: r.id,
          pageType,
          pagePath: r.path,
          pageTitle: r.title,
          kind: 'meta-title',
          current: r.metaTitle,
          currentLen: r.metaTitleLen,
          reason,
        });
      }
    }
    if (r.metaDescription && r.metaDescriptionLen > 0) {
      const dup = descSeen.get(r.metaDescription.trim().toLowerCase()) ?? 0;
      const reason: WeakTarget['reason'] | null =
        r.metaDescriptionLen < DESC_MIN
          ? 'too-short'
          : r.metaDescriptionLen > DESC_MAX
            ? 'too-long'
            : dup > 1
              ? 'duplicate'
              : null;
      if (reason) {
        weak.push({
          pageId: r.id,
          pageType,
          pagePath: r.path,
          pageTitle: r.title,
          kind: 'meta-desc',
          current: r.metaDescription,
          currentLen: r.metaDescriptionLen,
          reason,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, weak });
}

async function apply(
  targets: Array<{ pageId: string; pageType: 'product' | 'page' | 'article'; kind: 'meta-title' | 'meta-desc' }>,
) {
  if (targets.length === 0) {
    return NextResponse.json({ ok: false, error: 'No targets supplied' }, { status: 400 });
  }
  if (targets.length > 100) {
    return NextResponse.json({ ok: false, error: 'Too many targets in one call' }, { status: 400 });
  }

  const results: Array<{
    pageId: string;
    kind: 'meta-title' | 'meta-desc';
    ok: boolean;
    generated?: string;
    error?: string;
  }> = [];

  // Pre-fetch pages + articles in one shot each, products are fetched per-id.
  const [pages, articles] = await Promise.all([
    safe(() => listShopifyPages({ first: 250, maxPages: 20 })),
    safe(() => listArticles({ first: 250, maxPages: 20 })),
  ]);

  const system = await buildSystemPrompt({
    voice: 'evari',
    task: 'Rewrite a meta title or description for a Shopify page. Plain sentence case, no em-dashes, no en-dashes, no quotes around the output, no commentary. Output only the meta text.',
  });

  // Run sequentially to keep rate limits happy.
  for (const t of targets) {
    try {
      let entityTitle = '';
      let entityBody = '';
      let currentMeta = '';

      if (t.pageType === 'product') {
        const p = await getProduct(t.pageId);
        if (!p) throw new Error('Product not found');
        entityTitle = p.title;
        entityBody = stripHtml(p.descriptionHtml || '');
        currentMeta = t.kind === 'meta-title' ? p.seo?.title ?? '' : p.seo?.description ?? '';
      } else if (t.pageType === 'page') {
        const hit = (pages ?? []).find((x) => x.id === t.pageId);
        if (!hit) throw new Error('Page not found');
        entityTitle = hit.title;
        entityBody = stripHtml(hit.bodyHtml || '');
        currentMeta = t.kind === 'meta-title' ? hit.seo?.title ?? '' : hit.seo?.description ?? '';
      } else {
        const hit = (articles ?? []).find((x) => x.id === t.pageId);
        if (!hit) throw new Error('Article not found');
        entityTitle = hit.title;
        entityBody = stripHtml(hit.bodyHtml || '');
        currentMeta = t.kind === 'meta-title' ? hit.seo?.title ?? '' : hit.seo?.description ?? '';
      }

      const instruction =
        t.kind === 'meta-title'
          ? 'Write a meta title for this page. Target 50-60 characters (55 ideal). Front-load the primary term, include Evari only if natural, no clickbait.'
          : 'Write a meta description for this page. Target 140-155 characters. Stand alone as a SERP snippet, highlight concrete value to the reader, end with a soft call to action when it fits.';

      const prompt = [
        'Page: ' + entityTitle,
        'Type: ' + t.pageType,
        '',
        'Page body (first 1500 chars):',
        entityBody.slice(0, 1500),
        '',
        currentMeta ? 'Current weak meta: ' + currentMeta : '',
        '',
        'House rules:',
        '  - Never use em-dashes or en-dashes. Use commas, colons or full stops.',
        '  - Plain sentence case. No emoji.',
        '  - Output ONLY the meta text. No quotes, no prefix, no commentary.',
        '',
        instruction,
      ].filter(Boolean).join('\n');

      const { text } = await generateTextWithFallback({
        model: MODEL,
        system,
        prompt,
        temperature: 0.3,
      });

      const cleaned = text
        .trim()
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/[—–]/g, ',')
        .trim();

      if (!cleaned) throw new Error('Model returned empty');

      if (t.pageType === 'product') {
        await updateProduct({
          id: t.pageId,
          ...(t.kind === 'meta-title' ? { seoTitle: cleaned } : { seoDescription: cleaned }),
        });
      } else if (t.pageType === 'page') {
        await updatePageMetadata({
          pageId: t.pageId,
          ...(t.kind === 'meta-title' ? { metaTitle: cleaned } : { metaDescription: cleaned }),
        });
      } else {
        await updateArticleMetadata({
          articleId: t.pageId,
          ...(t.kind === 'meta-title' ? { metaTitle: cleaned } : { metaDescription: cleaned }),
        });
      }

      results.push({ pageId: t.pageId, kind: t.kind, ok: true, generated: cleaned });
    } catch (err) {
      results.push({
        pageId: t.pageId,
        kind: t.kind,
        ok: false,
        error: err instanceof Error ? err.message : 'Rewrite failed',
      });
    }
  }

  return NextResponse.json({
    ok: true,
    results,
    successes: results.filter((r) => r.ok).length,
    failures: results.filter((r) => !r.ok).length,
  });
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
