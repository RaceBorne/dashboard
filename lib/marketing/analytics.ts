/**
 * Email analytics — aggregates straight off
 * dashboard_mkt_campaign_recipients. The Postmark webhook (Phase 6)
 * writes per-event status updates onto each recipient row, so the
 * 'sent / delivered / opened / clicked / bounced' funnel is just a
 * count(*) per status.
 *
 * Range filter (7d / 30d / 90d / all) is applied via the recipient
 * row's created_at — i.e. when the row was enqueued for that
 * campaign. created_at is essentially 'we tried to send this' time.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { Campaign, RecipientStatus } from './types';

export type AnalyticsRange = '7d' | '30d' | '90d' | 'all';

export interface FunnelTotals {
  total: number;       // every recipient row
  sent: number;        // sent + delivered + opened + clicked
  delivered: number;   // delivered + opened + clicked
  opened: number;      // opened + clicked
  clicked: number;     // clicked
  bounced: number;     // bounced
  failed: number;      // failed
  suppressed: number;  // suppressed
}

export interface FunnelRates {
  /** opened / delivered */
  openRate: number;
  /** clicked / delivered */
  clickRate: number;
  /** clicked / opened — click-through-open */
  clickToOpenRate: number;
  /** bounced / sent */
  bounceRate: number;
}

export interface AnalyticsSummary {
  range: AnalyticsRange;
  since: string | null;
  totals: FunnelTotals;
  rates: FunnelRates;
  campaignsRun: number;
  /** Top campaigns in the window by recipient count, max 10. */
  topCampaigns: Array<{
    campaign: Pick<Campaign, 'id' | 'name' | 'subject' | 'status' | 'sentAt' | 'createdAt'>;
    totals: FunnelTotals;
    rates: FunnelRates;
  }>;
}

function ratesFor(t: FunnelTotals): FunnelRates {
  const div = (n: number, d: number) => (d > 0 ? n / d : 0);
  return {
    openRate: div(t.opened, t.delivered),
    clickRate: div(t.clicked, t.delivered),
    clickToOpenRate: div(t.clicked, t.opened),
    bounceRate: div(t.bounced, t.sent),
  };
}

function tally(rows: Array<{ status: RecipientStatus }>): FunnelTotals {
  const t: FunnelTotals = {
    total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0,
    bounced: 0, failed: 0, suppressed: 0,
  };
  for (const r of rows) {
    t.total += 1;
    switch (r.status) {
      case 'sent':       t.sent += 1; break;
      case 'delivered':  t.sent += 1; t.delivered += 1; break;
      case 'opened':     t.sent += 1; t.delivered += 1; t.opened += 1; break;
      case 'clicked':    t.sent += 1; t.delivered += 1; t.opened += 1; t.clicked += 1; break;
      case 'bounced':    t.bounced += 1; break;
      case 'failed':     t.failed += 1; break;
      case 'suppressed': t.suppressed += 1; break;
      // queued has no engagement data yet
    }
  }
  return t;
}

function sinceFor(range: AnalyticsRange): Date | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

interface RecipientRow {
  status: RecipientStatus;
  campaign_id: string;
  created_at: string;
}

interface CampaignSlim {
  id: string;
  name: string;
  subject: string;
  status: Campaign['status'];
  sent_at: string | null;
  created_at: string;
}

export async function getAnalytics(range: AnalyticsRange = '30d'): Promise<AnalyticsSummary> {
  const sb = createSupabaseAdmin();
  const empty: AnalyticsSummary = {
    range,
    since: null,
    totals: { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0, suppressed: 0 },
    rates: { openRate: 0, clickRate: 0, clickToOpenRate: 0, bounceRate: 0 },
    campaignsRun: 0,
    topCampaigns: [],
  };
  if (!sb) return empty;

  const since = sinceFor(range);
  const sinceIso = since?.toISOString();

  // 1. Pull all recipient rows in window. Tiny scale right now —
  //    raise pagination if this ever balloons.
  let rq = sb
    .from('dashboard_mkt_campaign_recipients')
    .select('status, campaign_id, created_at')
    .limit(50000);
  if (sinceIso) rq = rq.gte('created_at', sinceIso);
  const { data: recipients, error: rErr } = await rq;
  if (rErr) {
    console.error('[mkt.analytics recipients]', rErr);
    return empty;
  }
  const rows = (recipients ?? []) as RecipientRow[];

  // Overall totals
  const totals = tally(rows);
  const rates = ratesFor(totals);

  // Per-campaign breakdown (group + tally)
  const byCampaign = new Map<string, RecipientRow[]>();
  for (const r of rows) {
    if (!byCampaign.has(r.campaign_id)) byCampaign.set(r.campaign_id, []);
    byCampaign.get(r.campaign_id)!.push(r);
  }
  const campaignIds = [...byCampaign.keys()];
  const campaignsRun = campaignIds.length;

  // 2. Resolve campaign metadata for the top set. Order by recipient
  //    count desc and slice the top 10.
  const ranked = campaignIds
    .map((id) => ({ id, count: byCampaign.get(id)!.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  let campaigns: CampaignSlim[] = [];
  if (ranked.length > 0) {
    const { data, error } = await sb
      .from('dashboard_mkt_campaigns')
      .select('id, name, subject, status, sent_at, created_at')
      .in('id', ranked.map((r) => r.id));
    if (error) {
      console.error('[mkt.analytics campaigns]', error);
    } else {
      campaigns = (data ?? []) as CampaignSlim[];
    }
  }
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

  const topCampaigns: AnalyticsSummary['topCampaigns'] = ranked
    .map((r) => {
      const meta = campaignMap.get(r.id);
      if (!meta) return null;
      const t = tally(byCampaign.get(r.id)!);
      return {
        campaign: {
          id: meta.id,
          name: meta.name,
          subject: meta.subject,
          status: meta.status,
          sentAt: meta.sent_at,
          createdAt: meta.created_at,
        },
        totals: t,
        rates: ratesFor(t),
      };
    })
    .filter(Boolean) as AnalyticsSummary['topCampaigns'];

  return {
    range,
    since: sinceIso ?? null,
    totals,
    rates,
    campaignsRun,
    topCampaigns,
  };
}
