import { NextResponse } from 'next/server';

import { createCampaign, listCampaigns } from '@/lib/marketing/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const campaigns = await listCampaigns();
  return NextResponse.json({ campaigns });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const subject = typeof body?.subject === 'string' ? body.subject : '';
  const content = typeof body?.content === 'string' ? body.content : '';
  if (!name) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });
  const segmentId = typeof body?.segmentId === 'string' ? body.segmentId : null;
  const groupId = typeof body?.groupId === 'string' ? body.groupId : null;
  const campaign = await createCampaign({ name, subject, content, segmentId, groupId });
  if (!campaign) return NextResponse.json({ ok: false, error: 'create failed' }, { status: 500 });
  return NextResponse.json({ ok: true, campaign });
}
