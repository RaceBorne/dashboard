/**
 * POST /api/marketing/campaigns/<id>/inspect
 *
 * Pre-send AI safety inspection. Body accepts either:
 *   { recipients: PreviewRecipient[] }   ← client-supplied (modal already has them)
 *   {}                                    ← auto-derive by re-running preview
 *
 * Returns { ok, results: Array<{ contactId, flags: HeldFlag[] }> } in the
 * same order as the input. Never auto-holds anyone — flags are advisory.
 */

import { NextResponse } from 'next/server';

import { inspectBatch, type InspectionInput } from '@/lib/marketing/aiInspect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface RecipientPayload {
  contactId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  subject: string;
  html: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { recipients?: RecipientPayload[] } | null;

  let recipients: RecipientPayload[] = [];
  if (body?.recipients && Array.isArray(body.recipients)) {
    recipients = body.recipients;
  } else {
    // Re-derive from the preview endpoint to avoid duplicating audience logic.
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const host = req.headers.get('host');
    if (!host) return NextResponse.json({ ok: false, error: 'No host' }, { status: 400 });
    const url = `${proto}://${host}/api/marketing/campaigns/${id}/preview-recipients`;
    const res = await fetch(url, { headers: { cookie: req.headers.get('cookie') ?? '' } });
    if (!res.ok) return NextResponse.json({ ok: false, error: 'Preview failed' }, { status: 502 });
    const json = (await res.json()) as { ok?: boolean; recipients?: RecipientPayload[] };
    recipients = json.recipients ?? [];
  }

  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const inputs: InspectionInput[] = recipients.map((r) => ({
    contactId: r.contactId,
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    company: r.company,
    subject: r.subject,
    html: r.html,
  }));

  const results = await inspectBatch(inputs, { concurrency: 6 });
  return NextResponse.json({ ok: true, results });
}
