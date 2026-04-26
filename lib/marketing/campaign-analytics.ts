/**
 * Campaign analytics — Klaviyo-style three-tab dataset for the
 * /email/campaigns/[id] detail page.
 *
 *   Overview            Headline rates + engagement-over-time bucket
 *   Recipient activity  Per-row status + per-event timestamps
 *   Link activity       Per-URL click counts (URLs extracted from
 *                       the campaign body; counts derived from the
 *                       'clicked_at' timestamp on each recipient).
 *
 * All read-only — written by the Postmark events webhook (Phase 6).
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export interface RecipientActivity {
  id: string;
  contactId: string;
  email: string | null;
  fullName: string | null;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  error: string | null;
}

export interface CampaignBucket {
  /** ISO hour or day boundary. */
  at: string;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
}

export interface CampaignAnalytics {
  totals: {
    total: number;
    delivered: number;
    bounced: number;
    skipped: number;
    opened: number;
    clicked: number;
    unsubscribed: number;
    spamComplaints: number;
  };
  rates: {
    openRate: number;
    clickRate: number;
    clickToOpenRate: number;
    bounceRate: number;
    unsubscribeRate: number;
  };
  recipients: RecipientActivity[];
  /** Time-bucketed engagement series. Hourly when window <= 48h, daily otherwise. */
  buckets: CampaignBucket[];
  /** Distinct URLs in the campaign body, with click counts derived from
   * recipients.clicked_at (count of recipients who clicked at all).
   * Per-URL counts require Postmark Click webhook payload retention,
   * which we don't store yet — UI shows the link list with the total
   * 'people clicked' figure. */
  links: { url: string; uniqueClicks: number; totalClicks: number }[];
  peopleClicked: number;
  totalClicks: number;
}

export async function getCampaignAnalytics(campaignId: string, htmlBody: string): Promise<CampaignAnalytics | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;

  // Pull recipient rows + join the contact (lightweight projection).
  const { data: rRows, error: rErr } = await sb
    .from('dashboard_mkt_campaign_recipients')
    .select(`
      id, contact_id, status,
      sent_at, delivered_at, opened_at, clicked_at, bounced_at, error,
      contact:dashboard_mkt_contacts ( email, first_name, last_name )
    `)
    .eq('campaign_id', campaignId);
  if (rErr) {
    console.error('[mkt.analytics.recipients]', rErr);
    return null;
  }

  type Joined = {
    id: string;
    contact_id: string;
    status: string;
    sent_at: string | null;
    delivered_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
    bounced_at: string | null;
    error: string | null;
    contact: { email: string | null; first_name: string | null; last_name: string | null } | { email: string | null; first_name: string | null; last_name: string | null }[] | null;
  };

  const recipients: RecipientActivity[] = ((rRows ?? []) as unknown as Joined[]).map((r) => {
    const contact = Array.isArray(r.contact) ? r.contact[0] : r.contact;
    return {
      id: r.id,
      contactId: r.contact_id,
      email: contact?.email ?? null,
      fullName: [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || null,
      status: r.status,
      sentAt: r.sent_at,
      deliveredAt: r.delivered_at,
      openedAt: r.opened_at,
      clickedAt: r.clicked_at,
      bouncedAt: r.bounced_at,
      error: r.error,
    };
  });

  // Totals.
  let delivered = 0, bounced = 0, opened = 0, clicked = 0, skipped = 0;
  for (const r of recipients) {
    if (r.deliveredAt) delivered++;
    if (r.bouncedAt) bounced++;
    if (r.openedAt) opened++;
    if (r.clickedAt) clicked++;
    if (r.status === 'skipped') skipped++;
  }
  const total = recipients.length;
  // Unsub / spam come from the events table.
  const since = recipients.reduce<string | null>((min, r) => {
    const s = r.sentAt ?? r.deliveredAt ?? null;
    if (!s) return min;
    if (!min || s < min) return s;
    return min;
  }, null);

  let unsubscribed = 0;
  let spamComplaints = 0;
  if (since) {
    const contactIds = recipients.map((r) => r.contactId);
    if (contactIds.length > 0) {
      const { data: events } = await sb
        .from('dashboard_mkt_events')
        .select('type, contact_id, created_at')
        .in('contact_id', contactIds)
        .gte('created_at', since);
      for (const e of (events ?? []) as { type: string }[]) {
        if (e.type === 'unsubscribed' || e.type === 'subscription_changed') unsubscribed++;
        if (e.type === 'spam_complaint') spamComplaints++;
      }
    }
  }

  const safe = (numerator: number, denominator: number) => (denominator > 0 ? numerator / denominator : 0);
  const rates = {
    openRate:        safe(opened, delivered) * 100,
    clickRate:       safe(clicked, delivered) * 100,
    clickToOpenRate: safe(clicked, opened) * 100,
    bounceRate:      safe(bounced, total) * 100,
    unsubscribeRate: safe(unsubscribed, delivered) * 100,
  };

  // Bucket the engagement series. Hourly buckets if the campaign is
  // recent (< 48h since first sent), daily otherwise.
  const events: Array<{ at: string; kind: keyof Omit<CampaignBucket, 'at'> }> = [];
  for (const r of recipients) {
    if (r.deliveredAt) events.push({ at: r.deliveredAt, kind: 'delivered' });
    if (r.openedAt)    events.push({ at: r.openedAt,    kind: 'opened' });
    if (r.clickedAt)   events.push({ at: r.clickedAt,   kind: 'clicked' });
    if (r.bouncedAt)   events.push({ at: r.bouncedAt,   kind: 'bounced' });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  const earliest = events[0]?.at;
  const latest = events[events.length - 1]?.at;
  const hourly = earliest && latest && new Date(latest).getTime() - new Date(earliest).getTime() <= 48 * 3600 * 1000;
  const trunc = (iso: string) => {
    const d = new Date(iso);
    if (hourly) {
      d.setMinutes(0, 0, 0);
    } else {
      d.setHours(0, 0, 0, 0);
    }
    return d.toISOString();
  };
  const buckets = new Map<string, CampaignBucket>();
  for (const e of events) {
    const key = trunc(e.at);
    if (!buckets.has(key)) buckets.set(key, { at: key, delivered: 0, opened: 0, clicked: 0, bounced: 0 });
    buckets.get(key)![e.kind]++;
  }

  // Links — extract distinct URLs from the campaign HTML body for the
  // 'didn't see any clicks yet' empty case, then merge with the real
  // per-URL click history from dashboard_mkt_campaign_clicks (uniqueClicks
  // = distinct contact_id, totalClicks = row count, both per URL).
  const linkSet = new Set<string>();
  const linkRe = /\bhref\s*=\s*"([^"]+)"|\bhref\s*=\s*'([^']+)'/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(htmlBody)) !== null) {
    const url = (match[1] || match[2] || '').trim();
    if (url && /^https?:\/\//i.test(url) && !url.includes('{{')) linkSet.add(url);
  }

  const { data: clickRows, error: clickErr } = await sb
    .from('dashboard_mkt_campaign_clicks')
    .select('url, contact_id')
    .eq('campaign_id', campaignId);
  if (clickErr) console.error('[mkt.analytics.clicks]', clickErr);

  type ClickAgg = { url: string; uniqueClicks: number; totalClicks: number };
  const perUrl = new Map<string, { contacts: Set<string>; total: number }>();
  let totalClicks = 0;
  const distinctClickContacts = new Set<string>();
  for (const c of (clickRows ?? []) as { url: string; contact_id: string }[]) {
    if (!perUrl.has(c.url)) perUrl.set(c.url, { contacts: new Set(), total: 0 });
    const agg = perUrl.get(c.url)!;
    agg.contacts.add(c.contact_id);
    agg.total += 1;
    totalClicks += 1;
    distinctClickContacts.add(c.contact_id);
  }
  // Merge: every URL we found in the body, plus every URL we have clicks
  // for (Postmark may rewrite a URL that didn't appear literally in the
  // body via tracking redirects).
  const allUrls = new Set<string>([...linkSet, ...perUrl.keys()]);
  const links: ClickAgg[] = [...allUrls]
    .map((url) => {
      const agg = perUrl.get(url);
      return {
        url,
        uniqueClicks: agg?.contacts.size ?? 0,
        totalClicks: agg?.total ?? 0,
      };
    })
    .sort((a, b) => b.totalClicks - a.totalClicks);

  // peopleClicked prefers the click-history-derived count when available
  // (handles cases where the recipient row's clicked_at column got reset
  // or never set), falling back to the recipients projection.
  const peopleClicked = distinctClickContacts.size > 0 ? distinctClickContacts.size : clicked;

  return {
    totals: { total, delivered, bounced, skipped, opened, clicked, unsubscribed, spamComplaints },
    rates,
    recipients,
    buckets: [...buckets.values()].sort((a, b) => a.at.localeCompare(b.at)),
    links,
    peopleClicked,
    totalClicks: totalClicks > 0 ? totalClicks : clicked,
  };
}
