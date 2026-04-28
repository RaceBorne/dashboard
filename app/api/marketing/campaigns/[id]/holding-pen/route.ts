/**
 * Holding pen API for a single campaign.
 *
 *   GET  /api/marketing/campaigns/<id>/holding-pen
 *     → { ok: true, held: HeldRecipient[] }
 *
 *   DELETE /api/marketing/campaigns/<id>/holding-pen
 *     body { contactIds?: string[] }   // omit for "clear all"
 *     → { ok: true, removed: number }
 */

import { NextResponse } from 'next/server';

import {
  clearHeld,
  listHeldForCampaign,
  removeHeld,
} from '@/lib/marketing/heldRecipients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const held = await listHeldForCampaign(id);
  return NextResponse.json({ ok: true, held });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { contactIds?: unknown } | null;
  if (Array.isArray(body?.contactIds)) {
    const ids = body!.contactIds!.filter((x): x is string => typeof x === 'string');
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, removed: 0 });
    }
    const removed = await removeHeld(id, ids);
    return NextResponse.json({ ok: true, removed });
  }
  const removed = await clearHeld(id);
  return NextResponse.json({ ok: true, removed });
}
