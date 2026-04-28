/**
 * POST /api/marketing/followups/[id]/accept
 *
 * Materialise the AI-suggested follow-up as a real direct-message campaign
 * (status='draft', kind='direct'), targeting the non-openers of the
 * original campaign. The new campaign is left in draft so the operator
 * still reviews + sends it manually.
 */

import { NextResponse } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { createCampaign } from '@/lib/marketing/campaigns';
import { setFollowupStatus } from '@/lib/marketing/followups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  const { data: row } = await sb
    .from('dashboard_mkt_followup_suggestions')
    .select('id, campaign_id, draft_subject, draft_body')
    .eq('id', id)
    .maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

  // Find non-openers from the original campaign.
  const r = row as { campaign_id: string; draft_subject: string | null; draft_body: string | null };
  const { data: recips } = await sb
    .from('dashboard_mkt_campaign_recipients')
    .select('contact_id, opened_at')
    .eq('campaign_id', r.campaign_id);
  const nonOpenerIds = ((recips ?? []) as Array<{ contact_id: string; opened_at: string | null }>)
    .filter((x) => !x.opened_at).map((x) => x.contact_id);

  if (nonOpenerIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'No non-openers to follow up with' }, { status: 400 });
  }

  // Resolve to emails for recipientEmails.
  const { data: contacts } = await sb
    .from('dashboard_mkt_contacts')
    .select('email')
    .in('id', nonOpenerIds);
  const recipientEmails = ((contacts ?? []) as Array<{ email: string }>).map((c) => c.email);

  const { data: original } = await sb
    .from('dashboard_mkt_campaigns')
    .select('name')
    .eq('id', r.campaign_id)
    .maybeSingle();
  const originalName = (original as { name: string } | null)?.name ?? 'campaign';

  const created = await createCampaign({
    name: `Follow-up to ${originalName}`,
    subject: r.draft_subject ?? '',
    content: r.draft_body ?? '',
    recipientEmails,
    kind: 'direct',
  });

  if (!created) return NextResponse.json({ ok: false, error: 'Create failed' }, { status: 500 });

  await setFollowupStatus(id, 'sent');
  return NextResponse.json({ ok: true, campaignId: created.id });
}
