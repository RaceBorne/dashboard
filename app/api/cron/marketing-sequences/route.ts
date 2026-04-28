/**
 * Cron — fire due sequence steps. Walks dashboard_mkt_scheduled_steps
 * for rows whose run_after has passed and status='pending', sends each
 * to the campaign's audience (minus anyone who has already replied),
 * marks the step status, and rolls on. Runs every 5 minutes.
 */

import { NextResponse } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getCampaign, applyMerge } from '@/lib/marketing/campaigns';
import { renderEmailDesign } from '@/lib/marketing/email-design';
import { getBrand } from '@/lib/marketing/brand';
import { isSuppressed, unsubscribeUrlFor } from '@/lib/marketing/suppressions';
import { sendOne } from '@/lib/marketing/sender';
import { trackEvent } from '@/lib/marketing/events';
import { appendLeadActivity } from '@/lib/marketing/leads-as-contacts';
import { getDueSteps, markStepStatus } from '@/lib/marketing/sequences';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface ContactRow {
  id: string; email: string; status: string;
  first_name: string | null; last_name: string | null; company: string | null;
}

export async function GET() {
  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  const due = await getDueSteps(new Date(), 25);
  if (due.length === 0) return NextResponse.json({ ok: true, fired: 0 });

  let fired = 0;
  for (const step of due) {
    await markStepStatus(step.id, 'running');
    try {
      const campaign = await getCampaign(step.campaignId);
      if (!campaign) { await markStepStatus(step.id, 'failed'); continue; }

      // Resolve recipients = original campaign audience minus those who replied.
      const { data: recipRows } = await sb
        .from('dashboard_mkt_campaign_recipients')
        .select('contact_id')
        .eq('campaign_id', step.campaignId)
        .in('status', ['sent', 'delivered', 'opened', 'clicked']);
      const originalIds = ((recipRows ?? []) as Array<{ contact_id: string }>).map((r) => r.contact_id);
      if (originalIds.length === 0) { await markStepStatus(step.id, 'skipped'); continue; }

      // Drop those who've replied (inbound conversation since campaign send).
      const { data: replied } = await sb
        .from('dashboard_mkt_conversations')
        .select('contact_id')
        .eq('direction', 'inbound')
        .in('contact_id', originalIds);
      const replyIds = new Set(((replied ?? []) as Array<{ contact_id: string }>).map((r) => r.contact_id));

      const { data: contacts } = await sb
        .from('dashboard_mkt_contacts')
        .select('id, email, status, first_name, last_name, company')
        .in('id', originalIds);
      const sendable = ((contacts ?? []) as ContactRow[]).filter((c) => c.status === 'active' && !replyIds.has(c.id));

      // Resolve step body — if step.payload.html is null, fall back to campaign's primary body.
      const useHtml = step.payload.design
        ? renderEmailDesign(step.payload.design, await getBrand(), { includeFooter: false })
        : (step.payload.html ?? (campaign.emailDesign ? renderEmailDesign(campaign.emailDesign, await getBrand(), { includeFooter: false }) : campaign.content));
      const useSubject = step.payload.subject ?? campaign.subject;
      const skipBrandFooter = campaign.kind === 'direct';

      for (const contact of sendable) {
        if (await isSuppressed(contact.email)) continue;
        const merge = { firstName: contact.first_name, lastName: contact.last_name, email: contact.email, company: contact.company };
        const html = applyMerge(useHtml, merge);
        const subject = applyMerge(useSubject, merge);
        const res = await sendOne({
          to: contact.email,
          subject,
          html,
          context: `${campaign.name} (step ${step.stepIndex + 1})`,
          unsubscribeUrl: unsubscribeUrlFor(contact.email),
          skipBrandFooter,
        });
        if (res.ok) {
          await trackEvent({ contactId: contact.id, type: 'campaign_sent', metadata: { campaignId: step.campaignId, stepIndex: step.stepIndex, messageId: res.messageId } });
          await appendLeadActivity(contact.id, { type: 'campaign_sent', summary: `Sent campaign step ${step.stepIndex + 1} · ${campaign.name || 'Untitled'}`, meta: { campaignId: step.campaignId, stepIndex: step.stepIndex, messageId: res.messageId } });
        }
      }
      await markStepStatus(step.id, 'sent');
      fired++;
    } catch (e) {
      console.error('[cron.sequences]', e);
      await markStepStatus(step.id, 'failed');
    }
  }

  return NextResponse.json({ ok: true, fired });
}
