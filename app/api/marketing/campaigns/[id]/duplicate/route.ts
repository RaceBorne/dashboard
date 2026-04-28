/**
 * POST /api/marketing/campaigns/<id>/duplicate
 * → { ok, campaign }
 *
 * Clones an existing campaign as a fresh draft (status='draft',
 * sentAt=null, scheduledFor=null) and returns the new id so the
 * UI can navigate to it. Recipient set + email design + subject
 * carry over so the operator can re-send to the same audience
 * without rebuilding the campaign from scratch.
 */

import { NextResponse } from 'next/server';

import { createCampaign, getCampaign } from '@/lib/marketing/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const original = await getCampaign(id);
  if (!original) return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
  const dup = await createCampaign({
    name: `${original.name} (copy)`,
    subject: original.subject,
    content: original.content,
    kind: original.kind,
    segmentId: original.segmentId,
    groupId: original.groupId,
    recipientEmails: original.recipientEmails,
    emailDesign: original.emailDesign,
  });
  if (!dup) return NextResponse.json({ ok: false, error: 'Duplicate failed' }, { status: 500 });
  return NextResponse.json({ ok: true, campaign: dup });
}
