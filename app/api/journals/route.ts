import { NextResponse } from 'next/server';

import { createDraft, listDrafts } from '@/lib/journals/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/journals
 *   → { drafts: JournalDraft[] }
 *
 * Optional ?blogTarget=cs_plus|blogs|<blogHandle>
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const blogTarget = url.searchParams.get('blogTarget') ?? undefined;
  const drafts = await listDrafts({ blogTarget });
  return NextResponse.json({ drafts });
}

/**
 * POST /api/journals
 *   body: { blogTarget: 'cs_plus' | 'blogs' | string, title?: string }
 *   → { draft }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { blogTarget?: string; title?: string }
    | null;
  const blogTarget = body?.blogTarget?.trim();
  if (!blogTarget) {
    return NextResponse.json(
      { ok: false, error: 'blogTarget required' },
      { status: 400 },
    );
  }
  const draft = await createDraft({
    blogTarget,
    title: body?.title?.trim() || '',
  });
  if (!draft) {
    return NextResponse.json(
      { ok: false, error: 'Failed to create draft' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, draft });
}
