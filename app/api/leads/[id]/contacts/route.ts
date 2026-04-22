import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getLead, upsertLead } from '@/lib/dashboard/repository';
import type { CompanyContact, Lead, OrgProfile } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Contact-row CRUD for the CompanyPanel Contacts tab.
 *
 * Identifies a contact by its original email address (case-insensitive). The
 * primary lead contact (lead.email / lead.fullName / lead.jobTitle) is treated
 * as a virtual contact pinned at position 0; edits to it flow back onto the
 * Lead's top-level fields. Enriched contacts live under
 * orgProfile.contacts[] — edits land in place there.
 *
 *   PATCH  { email, name?, jobTitle?, newEmail?, manualBucket? }   -> edit in place
 *   DELETE { email }                                              -> remove contact
 *
 * A blank/absent lead email should never identify; callers must always send
 * the exact address the panel rendered.
 */

type ManualBucket = 'person' | 'decision_maker' | 'generic';

interface PatchBody {
  email?: string;
  name?: string;
  jobTitle?: string;
  newEmail?: string;
  manualBucket?: ManualBucket | null;
}

interface DeleteBody {
  email?: string;
}

const VALID_BUCKETS: ManualBucket[] = ['person', 'decision_maker', 'generic'];

async function loadOr404(id: string): Promise<
  | { ok: true; lead: Lead; supabase: ReturnType<typeof createSupabaseAdmin> }
  | { ok: false; response: NextResponse }
> {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'Supabase admin client unavailable' },
        { status: 500 },
      ),
    };
  }
  const lead = await getLead(supabase, id);
  if (!lead) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 }),
    };
  }
  return { ok: true, lead, supabase };
}

function normaliseEmail(v?: string): string {
  return (v ?? '').trim().toLowerCase();
}

/**
 * Apply a PATCH to the primary lead email row (lead.email / lead.fullName /
 * lead.jobTitle). Returns a cloned lead when the target matched, or null.
 */
function patchPrimary(
  lead: Lead,
  target: string,
  body: PatchBody,
): Lead | null {
  const current = normaliseEmail(lead.email);
  if (!current || current !== target) return null;
  const next: Lead = { ...lead };
  if (typeof body.name === 'string' && body.name.trim()) {
    next.fullName = body.name.trim();
  }
  if (typeof body.jobTitle === 'string') {
    next.jobTitle = body.jobTitle.trim();
  }
  if (typeof body.newEmail === 'string') {
    const trimmed = body.newEmail.trim().toLowerCase();
    if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      next.email = trimmed;
      // A hand-edited email is a commitment signal — no longer a pattern guess.
      next.emailInferred = false;
    }
  }
  return next;
}

/**
 * Apply a PATCH to the matching contact in orgProfile.contacts. Returns a
 * cloned lead when the target matched, or null.
 */
function patchEnriched(
  lead: Lead,
  target: string,
  body: PatchBody,
): Lead | null {
  const contacts = lead.orgProfile?.contacts ?? [];
  const idx = contacts.findIndex((c) => normaliseEmail(c.email) === target);
  if (idx === -1) return null;
  const existing = contacts[idx]!;
  const updated: CompanyContact = { ...existing };
  if (typeof body.name === 'string' && body.name.trim()) {
    updated.name = body.name.trim();
  }
  if (typeof body.jobTitle === 'string') {
    updated.jobTitle = body.jobTitle.trim();
  }
  if (typeof body.newEmail === 'string') {
    const trimmed = body.newEmail.trim().toLowerCase();
    if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      updated.email = trimmed;
      updated.emailSource = 'scraped';
    }
  }
  if (body.manualBucket === null) {
    delete (updated as Partial<CompanyContact>).manualBucket;
  } else if (typeof body.manualBucket === 'string' && VALID_BUCKETS.includes(body.manualBucket)) {
    updated.manualBucket = body.manualBucket;
  }
  const nextContacts = [...contacts];
  nextContacts[idx] = updated;
  const orgProfile: OrgProfile = {
    ...(lead.orgProfile ?? { generatedAt: new Date().toISOString() }),
    contacts: nextContacts,
  };
  return { ...lead, orgProfile };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const loaded = await loadOr404(id);
  if (!loaded.ok) return loaded.response;

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  const target = normaliseEmail(body.email);
  if (!target) {
    return NextResponse.json({ ok: false, error: 'email is required' }, { status: 400 });
  }

  // manualBucket is the one field that also applies to the primary row, via
  // CompanyContact semantics. The primary row doesn't persist its bucket
  // anywhere today — treat manualBucket-only edits against the primary as
  // a no-op rather than a failure.
  let next = patchPrimary(loaded.lead, target, body);
  if (!next) {
    next = patchEnriched(loaded.lead, target, body);
  }
  if (!next) {
    return NextResponse.json({ ok: false, error: 'Contact not found' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  next = { ...next, lastTouchAt: nowIso };
  const saved = await upsertLead(loaded.supabase, next);
  if (!saved) {
    return NextResponse.json({ ok: false, error: 'Save failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, lead: saved });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const loaded = await loadOr404(id);
  if (!loaded.ok) return loaded.response;

  const body = (await req.json().catch(() => ({}))) as DeleteBody;
  const target = normaliseEmail(body.email);
  if (!target) {
    return NextResponse.json({ ok: false, error: 'email is required' }, { status: 400 });
  }

  let next: Lead = loaded.lead;
  let touched = false;

  // Clear the primary email when it matches.
  if (normaliseEmail(loaded.lead.email) === target) {
    next = { ...next, email: '', fullName: next.fullName, emailInferred: false };
    touched = true;
  }

  // Drop enriched contacts that match.
  const contacts = loaded.lead.orgProfile?.contacts ?? [];
  const filtered = contacts.filter((c) => normaliseEmail(c.email) !== target);
  if (filtered.length !== contacts.length) {
    const orgProfile: OrgProfile = {
      ...(loaded.lead.orgProfile ?? { generatedAt: new Date().toISOString() }),
      contacts: filtered,
    };
    next = { ...next, orgProfile };
    touched = true;
  }

  // Also drop matching relatedContacts entries, so deleting from one place
  // clears the row from every surface that reads emails for this lead.
  const related = loaded.lead.relatedContacts ?? [];
  const relatedFiltered = related.filter((r) => normaliseEmail(r.email) !== target);
  if (relatedFiltered.length !== related.length) {
    next = { ...next, relatedContacts: relatedFiltered };
    touched = true;
  }

  if (!touched) {
    return NextResponse.json({ ok: true, lead: loaded.lead });
  }

  const nowIso = new Date().toISOString();
  next = { ...next, lastTouchAt: nowIso };
  const saved = await upsertLead(loaded.supabase, next);
  if (!saved) {
    return NextResponse.json({ ok: false, error: 'Save failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, lead: saved });
}
