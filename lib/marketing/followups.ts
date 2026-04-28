/**
 * Smart follow-up suggestions.
 *
 * scanCampaignsForFollowups() looks at every campaign sent ≥ 48h ago
 * that hasn't already had a suggestion, computes the open rate, and
 * if it's under the threshold writes a pending suggestion with a
 * drafted "haven't heard back" follow-up. The drafting step uses the
 * shared evari-copy gateway so the suggestion sounds like Craig.
 *
 * Operator picks it up on /email/campaigns from a yellow card. The
 * follow-up campaign isn't created automatically; accepting just
 * spawns a draft direct-message campaign targeting non-openers.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { generateTextWithFallback, hasAIGatewayCredentials, buildSystemPrompt } from '@/lib/ai/gateway';

const FOLLOWUP_OPEN_THRESHOLD = 0.30;   // 30%
const FOLLOWUP_AGE_HOURS_MIN = 48;
const FOLLOWUP_AGE_HOURS_MAX = 14 * 24; // 14 days — don't generate suggestions for ancient sends

export interface FollowupSuggestion {
  id: string;
  campaignId: string;
  campaignName: string;
  reason: string;
  openRate: number;
  recipientCount: number;
  nonOpenerCount: number;
  draftSubject: string;
  draftBody: string;
  status: 'pending' | 'dismissed' | 'sent';
  createdAt: string;
}

interface SuggestionRow {
  id: string;
  campaign_id: string;
  reason: string;
  open_rate: number | null;
  recipient_count: number | null;
  non_opener_count: number | null;
  draft_subject: string | null;
  draft_body: string | null;
  status: 'pending' | 'dismissed' | 'sent';
  created_at: string;
}

export async function listPendingFollowups(): Promise<FollowupSuggestion[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_mkt_followup_suggestions')
    .select('id, campaign_id, reason, open_rate, recipient_count, non_opener_count, draft_subject, draft_body, status, created_at, campaign:dashboard_mkt_campaigns(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[mkt.followups.list]', error);
    return [];
  }
  type Joined = SuggestionRow & { campaign?: { name: string } | { name: string }[] | null };
  return ((data ?? []) as unknown as Joined[]).map((r) => {
    const c = Array.isArray(r.campaign) ? r.campaign[0] : r.campaign;
    return {
      id: r.id,
      campaignId: r.campaign_id,
      campaignName: c?.name ?? '(deleted)',
      reason: r.reason,
      openRate: r.open_rate ?? 0,
      recipientCount: r.recipient_count ?? 0,
      nonOpenerCount: r.non_opener_count ?? 0,
      draftSubject: r.draft_subject ?? '',
      draftBody: r.draft_body ?? '',
      status: r.status,
      createdAt: r.created_at,
    };
  });
}

export async function setFollowupStatus(id: string, status: 'pending' | 'dismissed' | 'sent'): Promise<void> {
  const sb = createSupabaseAdmin();
  if (!sb) return;
  await sb
    .from('dashboard_mkt_followup_suggestions')
    .update({ status, resolved_at: status === 'pending' ? null : new Date().toISOString() })
    .eq('id', id);
}

interface ScanResult {
  considered: number;
  created: number;
  skipped: number;
}

export async function scanCampaignsForFollowups(): Promise<ScanResult> {
  const sb = createSupabaseAdmin();
  if (!sb) return { considered: 0, created: 0, skipped: 0 };

  const minSentAt = new Date(Date.now() - FOLLOWUP_AGE_HOURS_MAX * 3600_000).toISOString();
  const maxSentAt = new Date(Date.now() - FOLLOWUP_AGE_HOURS_MIN * 3600_000).toISOString();

  const { data: campaigns } = await sb
    .from('dashboard_mkt_campaigns')
    .select('id, name, subject, kind, sent_at')
    .eq('status', 'sent')
    .lte('sent_at', maxSentAt)
    .gte('sent_at', minSentAt);

  let considered = 0, created = 0, skipped = 0;
  for (const c of (campaigns ?? []) as Array<{ id: string; name: string; subject: string; kind: string | null; sent_at: string }>) {
    considered++;
    // Skip if a suggestion already exists for this campaign (any status).
    const { data: existing } = await sb
      .from('dashboard_mkt_followup_suggestions')
      .select('id')
      .eq('campaign_id', c.id)
      .limit(1)
      .maybeSingle();
    if (existing) { skipped++; continue; }

    // Compute open rate from recipient rows.
    const { data: recips } = await sb
      .from('dashboard_mkt_campaign_recipients')
      .select('contact_id, status, opened_at, delivered_at')
      .eq('campaign_id', c.id);
    const rows = (recips ?? []) as Array<{ contact_id: string; status: string; opened_at: string | null; delivered_at: string | null }>;
    const delivered = rows.filter((r) => r.delivered_at).length;
    const opened = rows.filter((r) => r.opened_at).length;
    const recipientCount = rows.length;
    const openRate = delivered > 0 ? opened / delivered : 0;
    if (delivered === 0) { skipped++; continue; }
    if (openRate >= FOLLOWUP_OPEN_THRESHOLD) { skipped++; continue; }

    const nonOpenerCount = delivered - opened;

    // Draft a follow-up. If AI not configured, write generic placeholder copy.
    let draftSubject = `Quick follow-up: ${c.subject || c.name}`;
    let draftBody = `Hi {{firstName}},\n\nWanted to make sure my last note didn't slip past you. If now's not the right time, no worries.\n\nCraig`;
    if (hasAIGatewayCredentials()) {
      try {
        const system = await buildSystemPrompt({
          voice: 'evari',
          task: 'Drafting a brief follow-up email after a campaign with low open rate. The recipient did not open the original. Tone: warm, low-pressure, one short paragraph.',
        });
        const prompt = [
          'Original campaign:',
          `  Name: ${c.name}`,
          `  Subject: ${c.subject}`,
          '',
          'Write a short follow-up. Output JSON: {"subject": string, "body": string}. No em-dashes. Use {{firstName}} merge token if naming the recipient. Body uses blank lines for paragraph breaks.',
        ].join('\n');
        const { text } = await generateTextWithFallback({
          model: process.env.AI_DRAFT_MODEL || 'anthropic/claude-haiku-4-5',
          system, prompt, temperature: 0.5,
        });
        const start = text.indexOf('{'); const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
          const obj = JSON.parse(text.slice(start, end + 1));
          if (obj && typeof obj.subject === 'string') draftSubject = obj.subject;
          if (obj && typeof obj.body === 'string') draftBody = obj.body;
        }
      } catch (e) {
        console.warn('[mkt.followups.draft]', e);
      }
    }

    await sb.from('dashboard_mkt_followup_suggestions').insert({
      campaign_id: c.id,
      reason: `Open rate ${(openRate * 100).toFixed(1)}% after 48h is below 30%`,
      open_rate: openRate,
      recipient_count: recipientCount,
      non_opener_count: nonOpenerCount,
      draft_subject: draftSubject,
      draft_body: draftBody,
    });
    created++;
  }
  return { considered, created, skipped };
}
