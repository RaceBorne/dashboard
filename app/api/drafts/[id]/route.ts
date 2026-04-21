import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { deleteDraft, getDraft, upsertDraft } from '@/lib/dashboard/repository';
import type { DraftMessage, DraftMessageStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EDITABLE_STATUSES: DraftMessageStatus[] = [
  'draft',
  'approved',
  'rejected',
];

/**
 * PATCH /api/drafts/[id]
 *
 * Edit subject / body / status / reviewerNotes. Sent drafts are immutable —
 * once Gmail dispatches, we don't pretend we can un-send.
 *
 * Status transitions permitted here:
 *   draft    → approved | rejected
 *   approved → draft | rejected
 *   rejected → draft
 * Actually sending (approved → sent) happens inside the Phase 3 send route,
 * not here.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  const existing = await getDraft(supabase, id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Draft not found' }, { status: 404 });
  }

  if (existing.status === 'sent' || existing.status === 'failed') {
    return NextResponse.json(
      { ok: false, error: 'Draft is locked — status is ' + existing.status },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    subject?: string;
    body?: string;
    status?: DraftMessageStatus;
    reviewerNotes?: string;
  };

  const patch: Partial<DraftMessage> = {};
  if (typeof body.subject === 'string') {
    const s = body.subject.trim();
    if (!s) {
      return NextResponse.json(
        { ok: false, error: 'Subject cannot be empty' },
        { status: 400 },
      );
    }
    patch.subject = s;
  }
  if (typeof body.body === 'string') {
    const b = body.body.trim();
    if (!b) {
      return NextResponse.json(
        { ok: false, error: 'Body cannot be empty' },
        { status: 400 },
      );
    }
    patch.body = b;
  }
  if (typeof body.reviewerNotes === 'string') {
    patch.reviewerNotes = body.reviewerNotes;
  }
  if (typeof body.status === 'string') {
    if (!EDITABLE_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid status transition via PATCH' },
        { status: 400 },
      );
    }
    patch.status = body.status;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No editable fields provided' },
      { status: 400 },
    );
  }

  const next: DraftMessage = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await upsertDraft(supabase, next);
  return NextResponse.json({ ok: true, draft: next });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }
  await deleteDraft(supabase, id);
  return NextResponse.json({ ok: true });
}
