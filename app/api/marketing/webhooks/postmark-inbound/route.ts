/**
 * Postmark Inbound webhook receiver — drops one Conversation row per
 * inbound email. Configure the Postmark inbound stream's "Set webhook"
 * URL to point here (with the same POSTMARK_WEBHOOK_TOKEN guard as
 * the events webhook for parity).
 */

import { NextResponse } from 'next/server';

import { ingestInbound } from '@/lib/marketing/conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Optional shared secret. Postmark lets you put it in the URL.
  const expected = process.env.POSTMARK_WEBHOOK_TOKEN;
  if (expected) {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (token !== expected) return NextResponse.json({ ok: false, error: 'bad token' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const conversation = await ingestInbound(body as Parameters<typeof ingestInbound>[0]);
  return NextResponse.json({ ok: true, id: conversation?.id ?? null });
}
