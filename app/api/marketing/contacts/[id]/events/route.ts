import { NextResponse } from 'next/server';

import { listEventsForContact } from '@/lib/marketing/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/marketing/contacts/[id]/events?limit=N
 * → { events: MarketingEvent[] }   (most-recent first)
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get('limit') ?? '100');
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500);
  const events = await listEventsForContact(id, { limit });
  return NextResponse.json({ events });
}
