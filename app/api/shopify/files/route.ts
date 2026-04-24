import { NextResponse } from 'next/server';

import { listFiles } from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/shopify/files
 *
 * Paginated list of every file in the merchant's Shopify Files
 * library. Used by the Journals media-library drawer to show a grid
 * of usable images + videos.
 *
 * Query params:
 *   - type:   'all' | 'image' | 'video'  (default 'all')
 *   - query:  free-text search, matched against alt text / filename
 *   - cursor: opaque next-page cursor returned from a previous call
 *   - first:  page size (default 48, clamped to 100)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') as 'image' | 'video' | 'all' | null;
  const query = url.searchParams.get('query') ?? undefined;
  const cursor = url.searchParams.get('cursor');
  const first = Number(url.searchParams.get('first') ?? '48');
  try {
    const { files, hasNextPage, endCursor } = await listFiles({
      first,
      after: cursor,
      type: type ?? 'all',
      query: query || undefined,
    });
    return NextResponse.json({ ok: true, files, hasNextPage, endCursor });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'listFiles failed' },
      { status: 500 },
    );
  }
}
