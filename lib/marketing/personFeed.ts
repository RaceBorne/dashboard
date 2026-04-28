/**
 * Per-person unified feed.
 *
 * Pulls everything the system knows about a single contact into one
 * chronological list. Sources today:
 *
 *   - dashboard_mkt_events    (campaign_sent, campaign_opened, etc)
 *   - dashboard_mkt_conversations (inbound + outbound emails)
 *   - dashboard_mkt_campaign_recipients (sent / delivered / opened / clicked / bounced)
 *
 * Returns FeedItem[] sorted newest first. Caller decides how many to
 * show; the page paginates client-side.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export interface FeedItem {
  id: string;
  at: string; // ISO
  kind: 'event' | 'conversation_in' | 'conversation_out' | 'recipient';
  title: string;
  detail?: string | null;
  href?: string | null;
}

export interface PersonHeader {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  status: string;
  leadId: string | null;
}

export async function getPersonFeed(contactId: string): Promise<{ person: PersonHeader | null; feed: FeedItem[] }> {
  const sb = createSupabaseAdmin();
  if (!sb) return { person: null, feed: [] };
  const { data: contact } = await sb
    .from('dashboard_mkt_contacts')
    .select('id, email, first_name, last_name, company, status, lead_id')
    .eq('id', contactId)
    .maybeSingle();
  if (!contact) return { person: null, feed: [] };
  const c = contact as { id: string; email: string; first_name: string | null; last_name: string | null; company: string | null; status: string; lead_id: string | null };
  const person: PersonHeader = {
    id: c.id,
    email: c.email,
    firstName: c.first_name,
    lastName: c.last_name,
    company: c.company,
    status: c.status,
    leadId: c.lead_id,
  };

  const [evRes, convRes, recipRes] = await Promise.all([
    sb.from('dashboard_mkt_events').select('id, type, metadata, created_at').eq('contact_id', contactId).order('created_at', { ascending: false }).limit(200),
    sb.from('dashboard_mkt_conversations').select('id, direction, subject, snippet, created_at').eq('contact_id', contactId).order('created_at', { ascending: false }).limit(200),
    sb.from('dashboard_mkt_campaign_recipients').select('id, campaign_id, status, sent_at, opened_at, clicked_at, bounced_at, campaign:dashboard_mkt_campaigns(name)').eq('contact_id', contactId).limit(200),
  ]);

  const feed: FeedItem[] = [];

  for (const r of (evRes.data ?? []) as Array<{ id: string; type: string; metadata: Record<string, unknown> | null; created_at: string }>) {
    const meta = r.metadata ?? {};
    const campaignName = typeof meta.campaignName === 'string' ? meta.campaignName : null;
    feed.push({
      id: `ev:${r.id}`, at: r.created_at, kind: 'event',
      title: prettyEventType(r.type),
      detail: campaignName ? `Campaign · ${campaignName}` : null,
      href: typeof meta.campaignId === 'string' ? `/email/campaigns/${meta.campaignId}` : null,
    });
  }

  for (const r of (convRes.data ?? []) as Array<{ id: string; direction: string; subject: string | null; snippet: string | null; created_at: string }>) {
    const inbound = r.direction === 'inbound';
    feed.push({
      id: `conv:${r.id}`, at: r.created_at, kind: inbound ? 'conversation_in' : 'conversation_out',
      title: inbound ? 'Reply received' : 'Message sent',
      detail: r.subject || r.snippet || null,
      href: '/email/conversations',
    });
  }

  type RecRow = { id: string; campaign_id: string; status: string; sent_at: string | null; opened_at: string | null; clicked_at: string | null; bounced_at: string | null; campaign?: { name: string } | { name: string }[] | null };
  for (const r of (recipRes.data ?? []) as unknown as RecRow[]) {
    const campaignName = (Array.isArray(r.campaign) ? r.campaign[0] : r.campaign)?.name ?? '';
    if (r.sent_at) feed.push({ id: `rec:${r.id}:sent`, at: r.sent_at, kind: 'recipient', title: 'Campaign sent', detail: campaignName, href: `/email/campaigns/${r.campaign_id}` });
    if (r.opened_at) feed.push({ id: `rec:${r.id}:open`, at: r.opened_at, kind: 'recipient', title: 'Campaign opened', detail: campaignName, href: `/email/campaigns/${r.campaign_id}` });
    if (r.clicked_at) feed.push({ id: `rec:${r.id}:click`, at: r.clicked_at, kind: 'recipient', title: 'Campaign clicked', detail: campaignName, href: `/email/campaigns/${r.campaign_id}` });
    if (r.bounced_at) feed.push({ id: `rec:${r.id}:bounce`, at: r.bounced_at, kind: 'recipient', title: 'Campaign bounced', detail: campaignName, href: `/email/campaigns/${r.campaign_id}` });
  }

  feed.sort((a, b) => b.at.localeCompare(a.at));
  return { person, feed };
}

export interface PersonRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  status: string;
  lastTouchAt: string | null;
  lastTouchKind: 'event' | 'conversation_in' | 'conversation_out' | 'recipient' | null;
}

export async function listPeople(opts: { limit?: number; search?: string } = {}): Promise<PersonRow[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const limit = opts.limit ?? 200;
  let q = sb
    .from('dashboard_mkt_contacts')
    .select('id, email, first_name, last_name, company, status, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (opts.search) {
    const like = `%${opts.search.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    q = q.or(`email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like}`);
  }
  const { data } = await q;
  return ((data ?? []) as Array<{ id: string; email: string; first_name: string | null; last_name: string | null; company: string | null; status: string; updated_at: string }>).map((r) => ({
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    company: r.company,
    status: r.status,
    lastTouchAt: r.updated_at,
    lastTouchKind: null,
  }));
}

function prettyEventType(t: string): string {
  const map: Record<string, string> = {
    campaign_sent: 'Campaign sent',
    campaign_opened: 'Email opened',
    campaign_clicked: 'Link clicked',
    campaign_bounced: 'Email bounced',
    spam_complaint: 'Spam complaint',
    unsubscribed: 'Unsubscribed',
    subscription_changed: 'Subscription changed',
  };
  return map[t] ?? t;
}
