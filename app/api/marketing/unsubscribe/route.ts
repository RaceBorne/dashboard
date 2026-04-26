/**
 * Public unsubscribe endpoint.
 *
 *   GET  /api/marketing/unsubscribe?u=<token>
 *        Verifies the token + returns { ok, email } so the public
 *        /unsubscribe page can show 'Unsubscribe <email>?'.
 *
 *   POST /api/marketing/unsubscribe?u=<token>
 *        Performs the unsubscribe. Idempotent — if the email is
 *        already suppressed it still returns ok:true.
 *
 *        Also handles RFC 8058 one-click POST: when an email client
 *        (Gmail, Apple Mail, Outlook) submits the List-Unsubscribe
 *        header URL via POST with body 'List-Unsubscribe=One-Click',
 *        the same handler resolves and adds the suppression.
 */

import { NextResponse } from 'next/server';

import { addSuppression, isSuppressed, verifyUnsubToken } from '@/lib/marketing/suppressions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenFromRequest(req: Request): string | null {
  return new URL(req.url).searchParams.get('u');
}

export async function GET(req: Request) {
  const token = tokenFromRequest(req);
  const verified = token ? verifyUnsubToken(token) : null;
  if (!verified) return NextResponse.json({ ok: false, error: 'Invalid or expired link' }, { status: 400 });
  const already = await isSuppressed(verified.email);
  return NextResponse.json({ ok: true, email: verified.email, alreadySuppressed: already });
}

export async function POST(req: Request) {
  const token = tokenFromRequest(req);
  const verified = token ? verifyUnsubToken(token) : null;
  if (!verified) return NextResponse.json({ ok: false, error: 'Invalid or expired link' }, { status: 400 });
  await addSuppression({
    email: verified.email,
    reason: 'unsubscribe',
    source: 'unsubscribe_link',
  });
  return NextResponse.json({ ok: true, email: verified.email });
}
