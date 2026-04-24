import { NextResponse } from 'next/server';

import {
  deleteDraft,
  getDraft,
  updateDraft,
} from '@/lib/journals/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const draft = await getDraft(id);
  if (!draft) {
    return NextResponse.json(
      { ok: false, error: 'Not found' },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, draft });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!body) {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON' },
      { status: 400 },
    );
  }
  const allowed = [
    'title',
    'editorData',
    'blogTarget',
    'coverImageUrl',
    'summary',
    'tags',
    'author',
    'seoTitle',
    'seoDescription',
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }
  const draft = await updateDraft(id, patch as never);
  if (!draft) {
    return NextResponse.json(
      { ok: false, error: 'Update failed' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, draft });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deleteDraft(id);
  return NextResponse.json({ ok });
}
