/**
 * Pre-send performance forecast.
 *
 * Returns predictions for open rate, reply rate, meetings booked, and
 * pipeline impact so the operator can sanity-check before launching a
 * campaign. Strategy:
 *   - When there's enough historical send data (≥5 sends), use the
 *     trailing average per channel adjusted by the recipient count.
 *   - When data is thin, fall back to the founder-tuned defaults.
 *
 * No LLM call here on purpose — forecast should be instant.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export interface Forecast {
  recipientCount: number;
  predictedOpenRate: number;       // 0..1
  predictedReplyRate: number;      // 0..1
  predictedOpenCount: number;
  predictedReplyCount: number;
  predictedMeetings: { lo: number; hi: number };
  predictedPipeline: { lo: number; hi: number; currency: string };
  basis: 'historical' | 'defaults';
}

const DEFAULTS = {
  open: 0.42,
  reply: 0.04,
  meetingPerReply: { lo: 0.20, hi: 0.40 }, // 20-40% of replies become meetings
  pipelinePerMeeting: { lo: 35000, hi: 65000 },
  currency: 'GBP',
};

const MIN_HISTORY = 5;

export async function forecastForCampaign(campaignId: string, recipientCount: number): Promise<Forecast> {
  const sb = createSupabaseAdmin();
  if (!sb) return makeForecast(recipientCount, DEFAULTS.open, DEFAULTS.reply, 'defaults');

  // Roll last 90 days of sent campaigns for a trailing baseline.
  const since = new Date(Date.now() - 90 * 86400_000).toISOString();
  const { data } = await sb
    .from('dashboard_mkt_campaign_recipients')
    .select('id, opened_at, delivered_at, sent_at, campaign_id')
    .gte('sent_at', since);
  const rows = (data ?? []) as Array<{ delivered_at: string | null; opened_at: string | null; campaign_id: string }>;
  if (rows.length < MIN_HISTORY) {
    return makeForecast(recipientCount, DEFAULTS.open, DEFAULTS.reply, 'defaults');
  }

  let delivered = 0, opened = 0;
  for (const r of rows) {
    if (r.campaign_id === campaignId) continue; // exclude self
    if (r.delivered_at) delivered++;
    if (r.opened_at) opened++;
  }
  if (delivered === 0) return makeForecast(recipientCount, DEFAULTS.open, DEFAULTS.reply, 'defaults');

  const open = opened / delivered;

  // Replies aren't directly recorded on recipient rows; pull from
  // marketing conversations as a rough proxy when available.
  let replyRate = DEFAULTS.reply;
  const { data: convs } = await sb
    .from('dashboard_mkt_conversations')
    .select('id, direction, created_at')
    .eq('direction', 'inbound')
    .gte('created_at', since);
  const inbound = (convs ?? []).length;
  if (delivered > 50 && inbound > 0) {
    replyRate = Math.min(0.5, inbound / delivered);
  }
  return makeForecast(recipientCount, open, replyRate, 'historical');
}

function makeForecast(n: number, open: number, reply: number, basis: 'historical' | 'defaults'): Forecast {
  const openCount = Math.round(n * open);
  const replyCount = Math.round(n * reply);
  const meetingsLo = Math.round(replyCount * DEFAULTS.meetingPerReply.lo);
  const meetingsHi = Math.round(replyCount * DEFAULTS.meetingPerReply.hi);
  const pipelineLo = meetingsLo * DEFAULTS.pipelinePerMeeting.lo;
  const pipelineHi = meetingsHi * DEFAULTS.pipelinePerMeeting.hi;
  return {
    recipientCount: n,
    predictedOpenRate: open,
    predictedReplyRate: reply,
    predictedOpenCount: openCount,
    predictedReplyCount: replyCount,
    predictedMeetings: { lo: meetingsLo, hi: meetingsHi },
    predictedPipeline: { lo: pipelineLo, hi: pipelineHi, currency: DEFAULTS.currency },
    basis,
  };
}
