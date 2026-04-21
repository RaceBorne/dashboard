import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  listDraftsByPlay,
  listDraftsByStatus,
} from '@/lib/dashboard/repository';
import type { DraftMessage, DraftMessageStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES: DraftMessageStatus[] = [
  'draft',
  'approved',
  'sent',
  'rejected',
  'failed',
];

/**
 * GET /api/drafts
 *
 * Query params:
 *   playId=<id>     — list drafts for a single play (recommended)
 *   status=<status> — filter by lifecycle state
 *
 * At least one of playId / status should be provided. If neither is set we
 * return an empty list rather than exposing the whole queue — this is a
 * deliberate guard to keep the approval surface intentional.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const playId = url.searchParams.get('playId');
  const statusParam = url.searchParams.get('status');

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  let drafts: DraftMessage[] = [];
  if (playId) {
    drafts = await listDraftsByPlay(supabase, playId);
    if (statusParam && STATUSES.includes(statusParam as DraftMessageStatus)) {
      drafts = drafts.filter((d) => d.status === statusParam);
    }
  } else if (statusParam && STATUSES.includes(statusParam as DraftMessageStatus)) {
    drafts = await listDraftsByStatus(supabase, statusParam as DraftMessageStatus);
  }

  return NextResponse.json({ ok: true, drafts });
}
