import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getLead, upsertLead } from '@/lib/dashboard/repository';
import type { Lead, LeadStage, ProspectStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/leads/[id]
 *
 * Generic partial-update for a Lead row. Handles the small set of fields the
 * Prospects/Leads CRMs flip: tier, prospectStatus, stage, notes, category.
 * Anything else is deliberately ignored — keep the surface narrow.
 */
interface PatchBody {
  tier?: 'prospect' | 'lead';
  prospectStatus?: ProspectStatus;
  stage?: LeadStage;
  notes?: string;
  category?: string;
  /** Contact person's full name (editable from the Prospect card). */
  fullName?: string;
  /** Real, sendable email. Setting this on a prospect auto-promotes to Lead. */
  email?: string;
  /** Tagged true when the email is a pattern-inferred guess, not verified. */
  emailInferred?: boolean;
  /** Phone number. */
  phone?: string;
}

const LEAD_STAGES: LeadStage[] = [
  'new',
  'contacted',
  'discovery',
  'configuring',
  'quoted',
  'won',
  'lost',
  'cold',
];
const PROSPECT_STATUSES: ProspectStatus[] = [
  'pending',
  'sent',
  'bounced',
  'no_reply',
  'replied_positive',
  'replied_neutral',
  'replied_negative',
  'qualified',
  'archived',
];

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
  const existing = await getLead(supabase, id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  const nowIso = new Date().toISOString();

  const next: Lead = { ...existing, lastTouchAt: nowIso };
  const activityEntries: Lead['activity'] = [];

  if (body.tier === 'prospect' || body.tier === 'lead') {
    if (body.tier !== existing.tier) {
      next.tier = body.tier;
      activityEntries.push({
        id: 'act-' + Date.now(),
        type: 'stage_change',
        at: nowIso,
        summary:
          body.tier === 'lead'
            ? 'Promoted to Lead'
            : 'Moved back to Prospect tier',
      });
    }
  }
  if (body.prospectStatus && PROSPECT_STATUSES.includes(body.prospectStatus)) {
    next.prospectStatus = body.prospectStatus;
  }
  if (body.stage && LEAD_STAGES.includes(body.stage)) {
    next.stage = body.stage;
  }
  if (typeof body.notes === 'string') {
    next.notes = body.notes;
  }
  if (typeof body.category === 'string') {
    next.category = body.category.trim();
  }

  // -- Contact details + auto-promote --------------------------------------
  let autoPromoted = false;
  if (typeof body.fullName === 'string') {
    const trimmed = body.fullName.trim();
    if (trimmed.length > 0) next.fullName = trimmed;
  }
  if (typeof body.phone === 'string') {
    next.phone = body.phone.trim();
  }
  if (typeof body.email === 'string') {
    const trimmedEmail = body.email.trim().toLowerCase();
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    const changed = trimmedEmail !== (existing.email ?? '').toLowerCase();
    if (looksLikeEmail) {
      next.email = trimmedEmail;
      // Caller can override, but the default when a human types in an
      // email is that it's verified (not inferred).
      const emailInferred =
        typeof body.emailInferred === 'boolean'
          ? body.emailInferred
          : false;
      next.emailInferred = emailInferred;
      // Auto-promote: a prospect becomes a lead the moment it gains a
      // real (non-inferred) email. This is the commitment signal — we
      // can now actually send to this row.
      if (
        changed &&
        !emailInferred &&
        (existing.tier ?? 'lead') === 'prospect' &&
        body.tier !== 'prospect'
      ) {
        next.tier = 'lead';
        next.prospectStatus = 'qualified';
        autoPromoted = true;
        activityEntries.push({
          id: 'act-' + Date.now(),
          type: 'stage_change',
          at: nowIso,
          summary: 'Auto-promoted to Lead — email added: ' + trimmedEmail,
        });
      }
    } else if (trimmedEmail.length === 0) {
      // Explicit clear.
      next.email = '';
    }
  }

  if (activityEntries.length > 0) {
    next.activity = [...(existing.activity ?? []), ...activityEntries];
  }

  const saved = await upsertLead(supabase, next);
  if (!saved) {
    return NextResponse.json(
      { ok: false, error: 'Update failed' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, lead: saved, promoted: autoPromoted });
}
