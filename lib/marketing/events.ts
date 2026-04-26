/**
 * Events repository — wraps dashboard_mkt_events. Service-role only.
 *
 * Events are write-many / read-many. Anything the marketing system
 * needs to react to lands here:
 *   - product / page activity (manually tracked or from JS SDK later)
 *   - email engagement (Postmark webhook in Phase 6 stamps deliveries,
 *     opens, clicks here as well as on campaign_recipients)
 *   - flow triggers (Phase 7 wakes up sleeping flows by scanning the
 *     recent event stream for matching trigger_value)
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { MarketingEvent } from './types';

interface EventRow {
  id: string;
  contact_id: string;
  type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function rowToEvent(row: EventRow): MarketingEvent {
  return {
    id: row.id,
    contactId: row.contact_id,
    type: row.type,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

// ─── Read ─────────────────────────────────────────────────────────

export async function listEventsForContact(
  contactId: string,
  opts: { limit?: number } = {},
): Promise<MarketingEvent[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_mkt_events')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (error) {
    console.error('[marketing.listEventsForContact]', error);
    return [];
  }
  return (data ?? []).map(rowToEvent);
}

export async function listRecentEvents(
  opts: { type?: string; limit?: number } = {},
): Promise<MarketingEvent[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  let q = sb
    .from('dashboard_mkt_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.type) q = q.eq('type', opts.type);
  const { data, error } = await q;
  if (error) {
    console.error('[marketing.listRecentEvents]', error);
    return [];
  }
  return (data ?? []).map(rowToEvent);
}

// ─── Write ────────────────────────────────────────────────────────

/**
 * Resolve a contact by id OR by email. Lets event-track callers pass
 * whichever they have on hand (server-side: contactId; SDK / webhook:
 * usually email). Returns null if neither hits a row.
 */
async function resolveContactId(opts: {
  contactId?: string;
  email?: string;
}): Promise<string | null> {
  if (opts.contactId) return opts.contactId;
  if (!opts.email) return null;
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_contacts')
    .select('id')
    .eq('email', opts.email.trim().toLowerCase())
    .maybeSingle();
  if (error) {
    console.error('[marketing.events.resolveContactId]', error);
    return null;
  }
  return data?.id ?? null;
}

export async function trackEvent(input: {
  contactId?: string;
  email?: string;
  type: string;
  metadata?: Record<string, unknown>;
}): Promise<MarketingEvent | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const type = input.type?.trim();
  if (!type) return null;
  const contactId = await resolveContactId({
    contactId: input.contactId,
    email: input.email,
  });
  if (!contactId) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_events')
    .insert({
      contact_id: contactId,
      type,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();
  if (error) {
    console.error('[marketing.trackEvent]', error);
    return null;
  }
  return rowToEvent(data);
}
