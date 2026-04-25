import { NextResponse } from 'next/server';

import { publishDraft } from '@/lib/journals/publish';
import { getDraft } from '@/lib/journals/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/journals/[id]/publish
 *   body: { blogId?: string; isPublished?: boolean }
 *
 * Thin wrapper around `publishDraft()` so the dashboard's publish
 * button and the Vercel cron worker share the same code path.
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
  const res = await publishDraft(draft, {
    blogId: body.blogId,
    isPublished: body.isPublished,
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
  }
  return NextResponse.json({
    ok: true,
    article: res.article,
    dryRun: res.dryRun,
  });
}
