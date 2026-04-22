import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getLead, upsertLead } from '@/lib/dashboard/repository';
import type { CompanyContact, Lead } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/[id]/append-contacts
 *
 * Non-streaming companion to hunt-contacts. Takes an array of operator-picked
 * contact candidates and appends them to `lead.orgProfile.contacts`, preserving
 * anything already there and de-duping by email (case-insensitive) then by name.
 *
 * Body: { contacts: Array<Partial<CompanyContact>> }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    contacts?: Array<Partial<CompanyContact>>;
    sourceNote?: string;
  };
  const incoming = Array.isArray(body.contacts) ? body.contacts : [];
  if (incoming.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No contacts supplied' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  const lead = await getLead(supabase, id);
  if (!lead) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });
  }

  const existing = lead.orgProfile?.contacts ?? [];
  const seenEmails = new Set<string>(
    existing
      .map((c) => (c.email ?? '').trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
  const seenNames = new Set<string>(
    existing.map((c) => c.name.trim().toLowerCase()).filter((n) => n.length > 0),
  );

  const added: CompanyContact[] = [];
  for (const raw of incoming) {
    const name = (raw.name ?? '').trim();
    const email = (raw.email ?? '').trim();
    if (!name && !email) continue;

    const lcEmail = email.toLowerCase();
    const lcName = name.toLowerCase();
    if (lcEmail && seenEmails.has(lcEmail)) continue;
    if (!lcEmail && lcName && seenNames.has(lcName)) continue;

    const contact: CompanyContact = {
      name: name || email, // fall back to email if no name given
      jobTitle: raw.jobTitle?.trim() || undefined,
      email: email || undefined,
      emailSource: raw.emailSource ?? 'scraped',
      confidence: raw.confidence ?? 'medium',
      department: raw.department,
      seniority: raw.seniority,
      linkedinUrl: raw.linkedinUrl?.trim() || undefined,
      phone: raw.phone?.trim() || undefined,
      sourceUrl: raw.sourceUrl?.trim() || undefined,
    };
    added.push(contact);
    if (lcEmail) seenEmails.add(lcEmail);
    if (lcName) seenNames.add(lcName);
  }

  if (added.length === 0) {
    return NextResponse.json({
      ok: true,
      added: 0,
      skipped: incoming.length,
      lead,
    });
  }

  const nowIso = new Date().toISOString();
  const mergedContacts = [...existing, ...added];
  const existingNote = lead.orgProfile?.contactsSourceNote ?? '';
  const appendedNote = body.sourceNote?.trim() || `Added ${added.length} contact(s) via open-web hunt`;
  const nextNote = existingNote
    ? existingNote + ' · ' + appendedNote
    : appendedNote;

  const next: Lead = {
    ...lead,
    orgProfile: {
      ...(lead.orgProfile ?? { generatedAt: nowIso }),
      contacts: mergedContacts,
      contactsSourceNote: nextNote,
      contactsEnrichedAt: nowIso,
      generatedAt: lead.orgProfile?.generatedAt ?? nowIso,
    },
  };

  const saved = await upsertLead(supabase, next);
  if (!saved) {
    return NextResponse.json(
      { ok: false, error: 'Save failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    added: added.length,
    skipped: incoming.length - added.length,
    contacts: mergedContacts,
    lead: saved,
  });
}
