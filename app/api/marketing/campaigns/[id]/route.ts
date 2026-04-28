import { NextResponse } from 'next/server';

import { deleteCampaign, getCampaign, updateCampaign } from '@/lib/marketing/campaigns';
import type { CampaignStatus } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, campaign });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  const allowed = ['name', 'subject', 'subjectVariants', 'content', 'segmentId', 'groupId', 'groupIds', 'recipientEmails', 'emailDesign', 'status', 'scheduledFor', 'kind'] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }
  // Audience exclusivity — selecting any one source clears the others
  // so a campaign always targets exactly one audience kind.
  if ('segmentId' in patch && patch.segmentId) { patch.groupId = null; patch.groupIds = null; }
  if ('groupId' in patch && patch.groupId) { patch.segmentId = null; patch.groupIds = null; }
  if ('groupIds' in patch && Array.isArray(patch.groupIds) && (patch.groupIds as unknown[]).length > 0) { patch.segmentId = null; patch.groupId = null; }
  const campaign = await updateCampaign(id, patch as Parameters<typeof updateCampaign>[1] & { status?: CampaignStatus });
  if (!campaign) return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 });
  return NextResponse.json({ ok: true, campaign });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deleteCampaign(id);
  return NextResponse.json({ ok });
}
