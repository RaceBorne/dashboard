import { NextResponse } from 'next/server';

import { listRecentEvents, trackEvent } from '@/lib/marketing/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/marketing/events
 *   ?type=<type>     filter to one event type
 *   ?limit=<n>       default 200, max 500
 * → { events: MarketingEvent[] }
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') ?? undefined;
  const rawLimit = Number(url.searchParams.get('limit') ?? '200');
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 200, 1), 500);
  const events = await listRecentEvents({ type, limit });
  return NextResponse.json({ events });
}

/**
 * POST /api/marketing/events
 * body: {
 *   contactId?: string;          // either contactId
 *   email?: string;              // …or email (resolved server-side)
 *   type: string;                // e.g. 'page_view' / 'order_placed'
 *   metadata?: Record<string, unknown>;
 * }
 * → { ok: true, event }
 *
 * Returns 404 if no contact matches the contactId/email; 400 if type
 * is missing.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const type = typeof body.type === 'string' ? body.type.trim() : '';
  if (!type) {
    return NextResponse.json({ ok: false, error: 'type required' }, { status: 400 });
  }
  const contactId = typeof body.contactId === 'string' ? body.contactId : undefined;
  const email = typeof body.email === 'string' ? body.email : undefined;
  if (!contactId && !email) {
    return NextResponse.json(
      { ok: false, error: 'contactId or email required' },
      { status: 400 },
    );
  }
  const metadata =
    body.metadata && typeof body.metadata === 'object'
      ? (body.metadata as Record<string, unknown>)
      : undefined;
  const event = await trackEvent({ contactId, email, type, metadata });
  if (!event) {
    return NextResponse.json(
      { ok: false, error: 'Contact not found or insert failed' },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, event });
}
