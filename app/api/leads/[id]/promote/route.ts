import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getLead, upsertLead } from '@/lib/dashboard/repository';
import type { Lead } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/[id]/promote
 *
 * Promotes a prospect row to the Lead tier: sets tier='lead', marks the
 * prospectStatus as 'qualified' for history, and stamps an activity entry.
 * Idempotent — calling on an already-promoted Lead is a no-op.
 */
export async function POST(
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
  const existing = await getLead(supabase, id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });
  }
  if (existing.tier === 'lead') {
    return NextResponse.json({ ok: true, lead: existing, noop: true });
  }

  const nowIso = new Date().toISOString();
  const next: Lead = {
    ...existing,
    tier: 'lead',
    prospectStatus: 'qualified',
    lastTouchAt: nowIso,
    activity: [
      ...(existing.activity ?? []),
      {
        id: 'act-' + Date.now(),
        type: 'stage_change',
        at: nowIso,
        summary: 'Promoted from Prospect to Lead',
      },
    ],
  };

  const saved = await upsertLead(supabase, next);
  if (!saved) {
    return NextResponse.json(
      { ok: false, error: 'Promote failed' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, lead: saved });
}
