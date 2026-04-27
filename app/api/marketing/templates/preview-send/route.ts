/**
 * One-shot test-send for the template editor preview modal. Same
 * sender abstraction the campaign pipeline uses, but without all
 * the recipient-row + suppression bookkeeping — this is just for
 * the operator to see the design in their own inbox before saving.
 */

import { NextResponse } from 'next/server';

import { sendOne } from '@/lib/marketing/sender';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { to?: string; html?: string; subject?: string; skipBrandFooter?: boolean } | null;
  if (!body?.to || !body?.html) {
    return NextResponse.json({ ok: false, error: 'to + html required' }, { status: 400 });
  }
  const res = await sendOne({
    to: body.to,
    subject: body.subject ?? '[Test] Template preview',
    html: body.html,
    context: 'Template preview',
    skipBrandFooter: body.skipBrandFooter ?? false,
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error ?? 'send failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, messageId: res.messageId });
}
