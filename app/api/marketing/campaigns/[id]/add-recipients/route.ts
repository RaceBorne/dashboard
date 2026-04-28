/**
 * Append contacts to a campaign's ad-hoc recipientEmails list.
 *
 *   POST /api/marketing/campaigns/<id>/add-recipients
 *   body: { contactIds: string[] }
 *
 * Idempotent merge — duplicates (case-insensitive on email) are
 * collapsed against the campaign's existing recipientEmails. Returns
 * { ok, added, total, alreadyPresent, suppressedSkipped, campaign }.
 *
 * Hard-blocks adding to a campaign whose status is 'sent' or 'sending'
 * since the recipient set is already locked at that point.
 */

import { NextResponse } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getCampaign, updateCampaign } from '@/lib/marketing/campaigns';
import { isSuppressed } from '@/lib/marketing/suppressions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { contactIds?: unknown } | null;
  const contactIds = Array.isArray(body?.contactIds)
    ? (body!.contactIds as unknown[]).filter((x) => typeof x === 'string') as string[]
    : [];
  if (contactIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'contactIds[] required' }, { status: 400 });
  }
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
  if (campaign.status === 'sending' || campaign.status === 'sent') {
    return NextResponse.json({ ok: false, error: `Cannot add recipients to a ${campaign.status} campaign` }, { status: 409 });
  }

  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });
  const { data, error } = await sb
    .from('dashboard_mkt_contacts')
    .select('id, email')
    .in('id', contactIds);
  if (error) {
    console.error('[mkt.campaigns.addRecipients]', error);
    return NextResponse.json({ ok: false, error: 'Lookup failed' }, { status: 500 });
  }
  const lookedUp = (data ?? []) as Array<{ id: string; email: string }>;

  const suppressedSkipped: string[] = [];
  const candidates: string[] = [];
  for (const row of lookedUp) {
    const email = (row.email ?? '').trim().toLowerCase();
    if (!email) continue;
    if (await isSuppressed(email)) {
      suppressedSkipped.push(email);
    } else {
      candidates.push(email);
    }
  }

  const existing = (campaign.recipientEmails ?? []).map((e) => e.toLowerCase());
  const existingSet = new Set(existing);
  const alreadyPresent: string[] = [];
  const newlyAdded: string[] = [];
  for (const e of candidates) {
    if (existingSet.has(e)) {
      alreadyPresent.push(e);
    } else {
      existingSet.add(e);
      newlyAdded.push(e);
    }
  }
  const merged = [...existing, ...newlyAdded];

  const updated = await updateCampaign(campaign.id, { recipientEmails: merged });
  if (!updated) return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 });

  return NextResponse.json({
    ok: true,
    added: newlyAdded.length,
    total: merged.length,
    alreadyPresent: alreadyPresent.length,
    suppressedSkipped: suppressedSkipped.length,
    campaign: updated,
  });
}
