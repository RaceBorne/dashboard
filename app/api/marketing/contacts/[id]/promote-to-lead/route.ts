/**
 * POST /api/marketing/contacts/[id]/promote-to-lead
 * → { ok, lead }
 *
 * Mirrors a dashboard_mkt_contacts row into a fresh dashboard_leads
 * row (tier='lead') so a manual / CSV-imported contact gets a full
 * lead record. The contact's lead_id is updated to point at the new
 * lead so subsequent opens skip the promotion. Idempotent: if the
 * contact already carries a lead_id, returns the existing lead.
 *
 * Used by ListDetailClient when the operator clicks a member who
 * doesn't yet have a lead — so the same shared LeadDetailPanel
 * component can render for everyone, regardless of how they were
 * added to the list.
 */

import { NextResponse } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getContact } from '@/lib/marketing/contacts';
import { getLead, upsertLead } from '@/lib/dashboard/repository';
import type { Lead } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  const contact = await getContact(id);
  if (!contact) return NextResponse.json({ ok: false, error: 'Contact not found' }, { status: 404 });

  // Already promoted?
  const { data: existing } = await sb
    .from('dashboard_mkt_contacts')
    .select('lead_id')
    .eq('id', id)
    .maybeSingle();
  const existingLeadId = (existing as { lead_id: string | null } | null)?.lead_id;
  if (existingLeadId) {
    const lead = await getLead(sb, existingLeadId);
    if (lead) return NextResponse.json({ ok: true, lead, alreadyPromoted: true });
  }

  // Compose a Lead from the contact. Default fields keep the lead in
  // tier='lead' (since the operator explicitly added the contact to a
  // marketing list, they're an active lead).
  const leadId = `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const fullName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim();
  // Compose a Lead from the contact. Most fields are optional —
  // omit anything we don't know rather than passing null.
  const nowIso = new Date().toISOString();
  const lead: Lead = {
    id: leadId,
    fullName,
    email: contact.email,
    source: 'list_promote' as Lead['source'],
    stage: 'new' as Lead['stage'],
    intent: 'unknown' as Lead['intent'],
    firstSeenAt: nowIso,
    lastTouchAt: nowIso,
    tags: [],
    activity: [],
    tier: 'lead',
    prospectStatus: 'qualified' as Lead['prospectStatus'],
    ...(contact.company ? { companyName: contact.company } : {}),
    notes: '',
    noteEntries: [],
  };

  const saved = await upsertLead(sb, lead);
  if (!saved) return NextResponse.json({ ok: false, error: 'Lead create failed' }, { status: 500 });

  // Link the contact → the new lead so subsequent opens find it.
  await sb
    .from('dashboard_mkt_contacts')
    .update({ lead_id: saved.id })
    .eq('id', id);

  return NextResponse.json({ ok: true, lead: saved, alreadyPromoted: false });
}
