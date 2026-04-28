/**
 * GET /api/marketing/campaigns/<id>/preview-recipients
 * → { ok, recipients: Array<{ contactId, email, firstName, lastName, company, leadId, html, subject }> }
 *
 * For the per-recipient Review walk-through. Resolves the campaign's
 * audience exactly the way sendCampaign would (segment / group /
 * custom emails -> contact_ids -> contacts, minus suppressions),
 * applies the same merge substitution per-contact, and returns each
 * recipient's individually rendered subject + body. The Review modal
 * then walks through them one by one so the operator can approve or
 * hold each before sending.
 *
 * Audience is intentionally NOT trimmed here — the suppression filter
 * mirrors send time so the operator sees exactly who would be sent
 * to. Held contacts get excluded at send time via excludeContactIds
 * passed to /send.
 *
 * For preview-only callers — never sends, never persists.
 */

import { NextResponse } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getCampaign, applyMerge } from '@/lib/marketing/campaigns';
import { isSuppressed } from '@/lib/marketing/suppressions';
import { findFrequencyCapBreaches } from '@/lib/marketing/settings';
import { evaluateSegment } from '@/lib/marketing/segments';
import { getBrand } from '@/lib/marketing/brand';
import { renderEmailDesign } from '@/lib/marketing/email-design';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ContactRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  lead_id: string | null;
  status: string;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  // Resolve recipient ids — same logic as sendCampaign.resolveRecipientIds.
  let recipientIds: string[] = [];
  if (campaign.segmentId) {
    const ev = await evaluateSegment(campaign.segmentId);
    recipientIds = ev?.contactIds ?? [];
  } else if ((campaign.groupIds && campaign.groupIds.length > 0) || campaign.groupId) {
    const groups = campaign.groupIds && campaign.groupIds.length > 0 ? campaign.groupIds : [campaign.groupId as string];
    const { data } = await sb
      .from('dashboard_mkt_contact_groups')
      .select('contact_id')
      .in('group_id', groups)
      // Approved-only when reading membership (sends ignore pending).
      .eq('status', 'approved');
    const seen = new Set<string>();
    for (const r of (data ?? []) as Array<{ contact_id: string }>) {
      if (!seen.has(r.contact_id)) { seen.add(r.contact_id); recipientIds.push(r.contact_id); }
    }
  } else if (campaign.recipientEmails && campaign.recipientEmails.length > 0) {
    const lowered = campaign.recipientEmails.map((e) => e.toLowerCase());
    const { data } = await sb
      .from('dashboard_mkt_contacts')
      .select('id, email')
      .in('email', lowered);
    recipientIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  }
  if (recipientIds.length === 0) {
    return NextResponse.json({ ok: true, recipients: [] });
  }

  const { data: contacts } = await sb
    .from('dashboard_mkt_contacts')
    .select('id, email, first_name, last_name, company, lead_id, status')
    .in('id', recipientIds);
  const rows = (contacts ?? []) as ContactRow[];

  // Frequency cap breaches — keyed by contact id for the per-row check below.
  const breaches = await findFrequencyCapBreaches(rows.map((r) => r.id));
  const breachMap = new Map(breaches.map((b) => [b.contactId, b.recentCount] as const));

  // Pre-compute the body once. Visual designs render via the email
  // pipeline; legacy plain-HTML campaigns use content as-is.
  const baseHtml = campaign.emailDesign
    ? renderEmailDesign(campaign.emailDesign, await getBrand(), { includeFooter: false })
    : campaign.content;

  // For each contact: drop suppressions + non-active, then run merge.
  const out: Array<{
    contactId: string; email: string; firstName: string | null; lastName: string | null; company: string | null; leadId: string | null;
    html: string; subject: string;
    excludedReason?: string;
  }> = [];
  for (const r of rows) {
    let excludedReason: string | undefined;
    if (r.status !== 'active') excludedReason = `Contact status is ${r.status}`;
    if (await isSuppressed(r.email)) excludedReason = 'On suppression list';
    if (breachMap.has(r.id)) excludedReason = `Frequency cap (${breachMap.get(r.id)} sends in window)`;
    const merged = applyMerge(baseHtml, { firstName: r.first_name, lastName: r.last_name, email: r.email, company: r.company });
    const subject = applyMerge(campaign.subject, { firstName: r.first_name, lastName: r.last_name, email: r.email, company: r.company });
    out.push({
      contactId: r.id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      company: r.company,
      leadId: r.lead_id,
      html: merged,
      subject,
      excludedReason,
    });
  }

  return NextResponse.json({ ok: true, recipients: out });
}
