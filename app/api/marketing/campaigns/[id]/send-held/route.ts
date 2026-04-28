/**
 * POST /api/marketing/campaigns/<id>/send-held
 *
 * Sends to recipients currently sitting in this campaign's holding pen.
 * Body:
 *   { contactIds?: string[] }   ← omit to send to every held contact
 *
 * On success per recipient, the held row is removed from the pen.
 * Failures stay in the pen so the operator can see what's still
 * outstanding.
 *
 * Mirrors sendCampaign's per-recipient logic (recipient row, suppress
 * gate, merge substitution, sender call, event + activity stamp) but
 * never resolves audience and never flips campaign.status.
 */

import { NextResponse } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { applyMerge, getCampaign } from '@/lib/marketing/campaigns';
import { renderEmailDesign } from '@/lib/marketing/email-design';
import { getBrand } from '@/lib/marketing/brand';
import { isSuppressed, unsubscribeUrlFor } from '@/lib/marketing/suppressions';
import { sendOne } from '@/lib/marketing/sender';
import { trackEvent } from '@/lib/marketing/events';
import { appendLeadActivity } from '@/lib/marketing/leads-as-contacts';
import { listHeldForCampaign, removeHeld } from '@/lib/marketing/heldRecipients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface ContactRow {
  id: string;
  email: string;
  status: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { contactIds?: unknown } | null;

  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });

  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  // Decide which held contacts to send.
  const heldList = await listHeldForCampaign(id);
  let targetIds: string[];
  if (Array.isArray(body?.contactIds)) {
    const requested = (body!.contactIds as unknown[]).filter((x): x is string => typeof x === 'string');
    const inPen = new Set(heldList.map((h) => h.contactId));
    targetIds = requested.filter((cid) => inPen.has(cid));
  } else {
    targetIds = heldList.map((h) => h.contactId);
  }

  if (targetIds.length === 0) {
    return NextResponse.json({ ok: true, attempted: 0, sent: 0, failed: 0, suppressed: 0, removed: 0 });
  }

  // Load full contact rows for merge.
  const { data: contactRows } = await sb
    .from('dashboard_mkt_contacts')
    .select('id, email, status, first_name, last_name, company')
    .in('id', targetIds);
  const contacts = ((contactRows ?? []) as ContactRow[]).filter((c) => c.status === 'active');

  // Render once per campaign — same pipeline as sendCampaign.
  const baseHtml = campaign.emailDesign
    ? renderEmailDesign(campaign.emailDesign, await getBrand(), { includeFooter: false })
    : campaign.content;
  const skipBrandFooter = campaign.kind === 'direct';

  let attempted = 0;
  let sent = 0;
  let failed = 0;
  let suppressedCount = 0;
  const sentContactIds: string[] = [];

  for (const contact of contacts) {
    attempted += 1;

    if (await isSuppressed(contact.email)) {
      suppressedCount += 1;
      continue;
    }

    const { data: existing } = await sb
      .from('dashboard_mkt_campaign_recipients')
      .select('id, status')
      .eq('campaign_id', id)
      .eq('contact_id', contact.id)
      .maybeSingle();

    let recipientId: string | null = null;
    if (existing) {
      const st = (existing as { status: string }).status;
      if (['sent', 'delivered', 'opened', 'clicked'].includes(st)) {
        sent += 1;
        sentContactIds.push(contact.id);
        continue;
      }
      recipientId = (existing as { id: string }).id;
    } else {
      const { data: inserted, error: insertErr } = await sb
        .from('dashboard_mkt_campaign_recipients')
        .insert({ campaign_id: id, contact_id: contact.id, status: 'queued' })
        .select('id')
        .single();
      if (insertErr || !inserted) {
        console.error('[marketing.sendHeld insert]', insertErr);
        failed += 1;
        continue;
      }
      recipientId = (inserted as { id: string }).id;
    }

    const mergeContact = {
      firstName: contact.first_name,
      lastName: contact.last_name,
      email: contact.email,
      company: contact.company,
    };
    const mergedHtml = applyMerge(baseHtml, mergeContact);
    const mergedSubject = applyMerge(campaign.subject, mergeContact);

    const res = await sendOne({
      to: contact.email,
      subject: mergedSubject,
      html: mergedHtml,
      context: campaign.name,
      unsubscribeUrl: unsubscribeUrlFor(contact.email),
      skipBrandFooter,
    });

    const nowIso = new Date().toISOString();
    if (res.ok) {
      sent += 1;
      sentContactIds.push(contact.id);
      if (recipientId) {
        await sb
          .from('dashboard_mkt_campaign_recipients')
          .update({ status: 'sent', message_id: res.messageId ?? null, sent_at: nowIso, error: null })
          .eq('id', recipientId);
      }
      await trackEvent({
        contactId: contact.id,
        type: 'campaign_sent',
        metadata: { campaignId: id, campaignName: campaign.name, messageId: res.messageId, fromHoldingPen: true },
      });
      await appendLeadActivity(contact.id, {
        type: 'campaign_sent',
        summary: `Sent campaign (held resend) · ${campaign.name || 'Untitled'}`,
        meta: { campaignId: id, messageId: res.messageId, fromHoldingPen: true },
      });
    } else {
      failed += 1;
      if (recipientId) {
        await sb
          .from('dashboard_mkt_campaign_recipients')
          .update({ status: 'failed', error: res.error ?? 'send failed' })
          .eq('id', recipientId);
      }
    }
  }

  let removed = 0;
  if (sentContactIds.length > 0) {
    removed = await removeHeld(id, sentContactIds);
  }

  return NextResponse.json({ ok: sent > 0 || attempted === 0, attempted, sent, failed, suppressed: suppressedCount, removed });
}
