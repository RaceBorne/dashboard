import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { addSuppression, listSuppressions } from '@/lib/dashboard/repository';
import type { SuppressionEntry } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REASONS: SuppressionEntry['reason'][] = [
  'unsubscribed',
  'hard_bounce',
  'complaint',
  'manual_dnc',
];

/**
 * GET /api/suppressions
 *
 * Returns the compliance list. Used by the Settings page, by the reply
 * listener (Phase 4) to check membership, and by the outreach send route
 * to gate first-touch emails.
 */
export async function GET() {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }
  const entries = await listSuppressions(supabase);
  return NextResponse.json({ ok: true, entries });
}

/**
 * POST /api/suppressions
 *
 * Body: { email: string; reason: SuppressionReason; playId?: string; notes?: string }
 * Creates a new suppression entry. The entry id is deterministic
 * (`supp-<reason>-<email>-<playScope>`) so POSTing the same pair twice is
 * idempotent.
 */
export async function POST(req: Request) {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as Partial<SuppressionEntry>;
  const email = (body.email ?? '').trim().toLowerCase();
  const reason = body.reason;

  if (!email || !email.includes('@')) {
    return NextResponse.json({ ok: false, error: 'Invalid email' }, { status: 400 });
  }
  if (!reason || !REASONS.includes(reason)) {
    return NextResponse.json({ ok: false, error: 'Invalid reason' }, { status: 400 });
  }

  const scope = body.playId ?? 'global';
  const entry: SuppressionEntry = {
    id: 'supp-' + reason + '-' + email + '-' + scope,
    email,
    reason,
    playId: body.playId,
    at: new Date().toISOString(),
    notes: body.notes,
  };

  await addSuppression(supabase, entry);
  return NextResponse.json({ ok: true, entry });
}
