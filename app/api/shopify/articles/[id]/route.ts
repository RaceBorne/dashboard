import { NextResponse } from 'next/server';

import { deleteArticle } from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/shopify/articles/[id]
 *
 * Wraps the Shopify admin `articleDelete` mutation. `id` may be a
 * numeric article id or a GID. Only invoked by the Journals
 * unpublished-on-Shopify lane where the merchant has explicitly
 * confirmed they want the stub gone.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
  }
  const res = await deleteArticle(decodeURIComponent(id));
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deletedId: res.deletedId });
}
