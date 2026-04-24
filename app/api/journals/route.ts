import { NextResponse } from 'next/server';

import { createDraft, listDrafts, updateDraft } from '@/lib/journals/repository';

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
 *
 * Create a new draft. Optional `initial` seeds every other field
 * so the template flow can duplicate an existing article into a
 * new draft in one round trip.
 *
 * body: {
 *   blogTarget: 'cs_plus' | 'blogs' | string,
 *   title?: string,
 *   initial?: {
 *     title?: string;
 *     summary?: string;
 *     coverImageUrl?: string;
 *     tags?: string[];
 *     author?: string;
 *     seoTitle?: string;
 *     seoDescription?: string;
 *     editorData?: { blocks: unknown[] };
 *   }
 * }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | {
        blogTarget?: string;
        title?: string;
        initial?: {
          title?: string;
          summary?: string;
          coverImageUrl?: string;
          tags?: string[];
          author?: string;
          seoTitle?: string;
          seoDescription?: string;
          editorData?: { blocks: unknown[] };
        };
      }
    | null;
  const blogTarget = body?.blogTarget?.trim();
  if (!blogTarget) {
    return NextResponse.json(
      { ok: false, error: 'blogTarget required' },
      { status: 400 },
    );
  }
  let draft = await createDraft({
    blogTarget,
    title: body?.initial?.title ?? body?.title ?? '',
  });
  if (!draft) {
    return NextResponse.json(
      { ok: false, error: 'Failed to create draft' },
      { status: 500 },
    );
  }
  if (body?.initial) {
    const i = body.initial;
    const patched = await updateDraft(draft.id, {
      ...(i.summary !== undefined ? { summary: i.summary } : {}),
      ...(i.coverImageUrl !== undefined ? { coverImageUrl: i.coverImageUrl } : {}),
      ...(i.tags !== undefined ? { tags: i.tags } : {}),
      ...(i.author !== undefined ? { author: i.author } : {}),
      ...(i.seoTitle !== undefined ? { seoTitle: i.seoTitle } : {}),
      ...(i.seoDescription !== undefined ? { seoDescription: i.seoDescription } : {}),
      ...(i.editorData !== undefined ? { editorData: i.editorData } : {}),
    });
    if (patched) draft = patched;
  }
  return NextResponse.json({ ok: true, draft });
}
