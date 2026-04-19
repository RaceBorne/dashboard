import { NextResponse } from 'next/server';
import { deleteRedirect, ShopifyApiError } from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/shopify/redirects/:id
 *
 * `id` may be the GID (`gid://shopify/UrlRedirect/123`) URL-encoded.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const result = await deleteRedirect(decodeURIComponent(id));
    return NextResponse.json({ ok: true, ...result });
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
