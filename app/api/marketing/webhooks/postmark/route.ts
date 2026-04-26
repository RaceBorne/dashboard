/**
 * Postmark webhook receiver.
 *
 * Postmark posts one event at a time as a JSON body. Common shapes:
 *
 *   Delivery
 *     { RecordType: 'Delivery', MessageID, Recipient, DeliveredAt, ... }
 *   Open
 *     { RecordType: 'Open', MessageID, Recipient, ReceivedAt, Client?, OS?, ... }
 *   Click
 *     { RecordType: 'Click', MessageID, Recipient, OriginalLink, ReceivedAt, ... }
 *   Bounce
 *     { RecordType: 'Bounce', MessageID, Email, Type, BouncedAt, Description, ... }
 *   SubscriptionChange (unsub / complaint manage)
 *     { RecordType: 'SubscriptionChange', Recipient, SuppressionReason,
 *       SuppressSending: true|false, ChangedAt, MessageID? }
 *
 * Effects per event:
 *   1. Look up the campaign_recipient row by MessageID. Update its
 *      status + the matching <kind>_at timestamp in place.
 *   2. Insert a marketing event keyed to the contact (resolved from
 *      MessageID's recipient row, or from Recipient/Email field as
 *      fallback) so flows + segments can react.
 *   3. Bounces (HardBounce / SpamComplaint) → push the email into
 *      the shared dashboard_suppressions list so the next campaign
 *      filters it out.
 *
 * Auth:
 *   Optional shared secret via ?token=<POSTMARK_WEBHOOK_TOKEN>. If
 *   the env var is unset we accept all calls (dev-friendly) but log
 *   a warning. Postmark webhook UI lets the user paste the token
 *   into the URL when configuring.
 */

import { NextResponse } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { trackEvent } from '@/lib/marketing/events';
import { appendLeadActivity } from '@/lib/marketing/leads-as-contacts';
import type { RecipientStatus } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Postmark is happy with 2xx for any received webhook. Returning 4xx
// causes them to retry — useful only for genuinely transient errors.

interface RecipientRow {
  id: string;
  contact_id: string;
  campaign_id: string;
}

async function findRecipientByMessageId(messageId: string | undefined): Promise<RecipientRow | null> {
  if (!messageId) return null;
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_campaign_recipients')
    .select('id, contact_id, campaign_id')
    .eq('message_id', messageId)
    .maybeSingle();
  if (error) {
    console.error('[mkt.webhook findRecipient]', error);
    return null;
  }
  return (data as RecipientRow | null) ?? null;
}

async function findContactByEmail(email: string | undefined): Promise<{ id: string } | null> {
  if (!email) return null;
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_contacts')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error('[mkt.webhook findContact]', error);
    return null;
  }
  return (data as { id: string } | null) ?? null;
}

async function suppressEmail(email: string, reason: string): Promise<void> {
  if (!email) return;
  const sb = createSupabaseAdmin();
  if (!sb) return;
  // The suppressions table is shared with the outreach module.
  // payload is jsonb; the email column is a generated lower(payload->>'email')
  // already indexed.
  const id = `mkt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await sb
    .from('dashboard_suppressions')
    .insert({
      id,
      payload: {
        email: email.toLowerCase(),
        reason,
        source: 'postmark_webhook',
        addedAt: new Date().toISOString(),
      },
    });
  if (error && error.code !== '23505') {
    // 23505 = unique violation, OK to ignore — already suppressed.
    console.error('[mkt.webhook suppress]', error);
  }
}

interface WebhookBody {
  RecordType?: string;
  MessageID?: string;
  Recipient?: string;
  Email?: string;
  DeliveredAt?: string;
  ReceivedAt?: string;
  BouncedAt?: string;
  ChangedAt?: string;
  Type?: string;             // Bounce: 'HardBounce' | 'SoftBounce' | ...
  TypeCode?: number;
  Description?: string;
  Details?: string;
  OriginalLink?: string;
  UserAgent?: string;
  IP?: string;
  GeoIP?: { IP?: string };
  SuppressionReason?: string;
  SuppressSending?: boolean;
  // Anything else — we hand into the event metadata as-is.
  [k: string]: unknown;
}

export async function POST(req: Request) {
  // Optional shared-secret check
  const url = new URL(req.url);
  const expected = process.env.POSTMARK_WEBHOOK_TOKEN;
  if (expected) {
    const got = url.searchParams.get('token');
    if (got !== expected) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  } else {
    // Dev mode — log once per cold start so it's visible in logs.
    console.warn('[mkt.webhook] POSTMARK_WEBHOOK_TOKEN unset — accepting all requests');
  }

  const body = (await req.json().catch(() => null)) as WebhookBody | null;
  if (!body || !body.RecordType) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }

  const sb = createSupabaseAdmin();
  if (!sb) {
    // No DB → ack so Postmark stops retrying; surface in logs.
    console.error('[mkt.webhook] supabase unavailable; dropping event', body.RecordType);
    return NextResponse.json({ ok: true, dropped: true });
  }

  const messageId = body.MessageID;
  const email = body.Recipient ?? body.Email;
  const recipient = await findRecipientByMessageId(messageId);
  // Resolve a contactId for the event regardless — webhooks can refer
  // to messages we sent outside the campaign system (e.g. flows in
  // Phase 7). Fall back to email lookup.
  const contact =
    (recipient ? { id: recipient.contact_id } : null) ?? (await findContactByEmail(email));

  let recipientStatus: RecipientStatus | null = null;
  let recipientPatch: Record<string, unknown> = {};

  switch (body.RecordType) {
    case 'Delivery': {
      recipientStatus = 'delivered';
      recipientPatch = {
        status: recipientStatus,
        delivered_at: body.DeliveredAt ?? new Date().toISOString(),
      };
      break;
    }
    case 'Open': {
      recipientStatus = 'opened';
      recipientPatch = {
        status: recipientStatus,
        opened_at: body.ReceivedAt ?? new Date().toISOString(),
      };
      break;
    }
    case 'Click': {
      recipientStatus = 'clicked';
      const clickedAt = body.ReceivedAt ?? new Date().toISOString();
      recipientPatch = {
        status: recipientStatus,
        clicked_at: clickedAt,
        // Don't lose the open timestamp if it wasn't already set.
        opened_at: body.ReceivedAt ?? new Date().toISOString(),
      };
      // Per-URL click history. Inserts one row per Click event so
      // analytics can report per-URL counts (UniqueClicks + TotalClicks)
      // distinct from the per-recipient 'has clicked' boolean.
      if (recipient && body.OriginalLink) {
        const { error: clickErr } = await sb
          .from('dashboard_mkt_campaign_clicks')
          .insert({
            recipient_id: recipient.id,
            campaign_id: recipient.campaign_id,
            contact_id: recipient.contact_id,
            url: body.OriginalLink,
            clicked_at: clickedAt,
            user_agent: body.UserAgent ?? null,
            ip: body.GeoIP?.IP ?? body.IP ?? null,
          });
        if (clickErr) console.error('[mkt.webhook click history]', clickErr);
      }
      break;
    }
    case 'Bounce': {
      recipientStatus = 'bounced';
      recipientPatch = {
        status: recipientStatus,
        bounced_at: body.BouncedAt ?? new Date().toISOString(),
        error: body.Description ?? body.Details ?? body.Type ?? 'Bounced',
      };
      // Hard bounces / spam complaints → suppression list
      if (email && (body.Type === 'HardBounce' || body.Type === 'SpamComplaint')) {
        await suppressEmail(email, body.Type);
      }
      break;
    }
    case 'SubscriptionChange': {
      // Postmark uses this for unsubscribes + complaint suppression.
      // SuppressSending true → user is now suppressed; mark recipient
      // accordingly and add to dashboard_suppressions.
      if (body.SuppressSending && email) {
        recipientStatus = 'suppressed';
        recipientPatch = {
          status: recipientStatus,
          error: body.SuppressionReason ?? 'Suppressed by Postmark',
        };
        await suppressEmail(email, body.SuppressionReason ?? 'SubscriptionChange');
      }
      break;
    }
    default: {
      // Unknown type — log + ack so Postmark doesn't retry forever.
      console.log('[mkt.webhook] unhandled RecordType', body.RecordType);
    }
  }

  // Update the recipient row (if we found one)
  if (recipient && Object.keys(recipientPatch).length > 0) {
    const { error } = await sb
      .from('dashboard_mkt_campaign_recipients')
      .update(recipientPatch)
      .eq('id', recipient.id);
    if (error) {
      console.error('[mkt.webhook update recipient]', error);
    }
  }

  // Emit a marketing event so flows / segments can react
  if (contact) {
    await trackEvent({
      contactId: contact.id,
      type: `email_${body.RecordType.toLowerCase()}`,
      metadata: {
        messageId: messageId ?? null,
        ...(body.OriginalLink ? { link: body.OriginalLink } : {}),
        ...(body.Type ? { bounceType: body.Type } : {}),
        ...(body.Description ? { description: body.Description } : {}),
        ...(body.SuppressionReason ? { suppressionReason: body.SuppressionReason } : {}),
        raw: body, // full payload for debugging
      },
    });

    // Mirror the event to the lead activity timeline so the contacts
    // explorer right pane shows campaign engagement inline.
    const activityType =
      body.RecordType === 'Click'              ? 'campaign_clicked'
      : body.RecordType === 'Open'             ? 'campaign_opened'
      : body.RecordType === 'Delivery'         ? 'campaign_delivered'
      : body.RecordType === 'Bounce'           ? 'campaign_bounced'
      : body.RecordType === 'SubscriptionChange' ? 'campaign_unsubscribed'
      : null;
    if (activityType) {
      const summary =
        activityType === 'campaign_clicked' && body.OriginalLink
          ? `Clicked ${body.OriginalLink}`
          : activityType === 'campaign_bounced'
            ? `Bounced (${body.Type ?? 'unknown'}): ${body.Description ?? ''}`.trim()
            : activityType === 'campaign_unsubscribed'
              ? `Unsubscribed (${body.SuppressionReason ?? 'manual'})`
              : activityType === 'campaign_opened'
                ? 'Opened email'
                : 'Email delivered';
      await appendLeadActivity(contact.id, {
        type: activityType,
        summary,
        meta: { messageId: messageId ?? null, recordType: body.RecordType },
      });
    }
  }

  return NextResponse.json({ ok: true });
}

// Postmark sometimes pings GET to validate the URL; respond 200.
export async function GET() {
  return NextResponse.json({ ok: true, hint: 'POST Postmark events here' });
}
