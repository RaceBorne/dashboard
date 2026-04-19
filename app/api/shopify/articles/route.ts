import { NextResponse } from 'next/server';
import {
  isShopifyConnected,
  listArticles,
  listBlogs,
  updateArticleMetadata,
  ShopifyApiError,
} from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/shopify/articles?blogId=gid://... (optional)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const blogId = url.searchParams.get('blogId') ?? undefined;
    const first = Math.min(250, Number(url.searchParams.get('first') ?? '50'));
    const [blogs, articles] = await Promise.all([
      listBlogs(),
      listArticles({ blogId, first }),
    ]);
    return NextResponse.json({
      mock: !isShopifyConnected(),
      blogs,
      count: articles.length,
      articles,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: err instanceof ShopifyApiError ? err.status || 500 : 500 },
    );
  }
}

/**
 * PATCH /api/shopify/articles
 * Body: { articleId, metaTitle?, metaDescription?, title?, bodyHtml?, summary? }
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body?.articleId) {
      return NextResponse.json(
        { error: 'Missing required field: articleId' },
        { status: 400 },
      );
    }
    const result = await updateArticleMetadata(body);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        userErrors: err instanceof ShopifyApiError ? err.userErrors : undefined,
      },
      { status: 500 },
    );
  }
}
