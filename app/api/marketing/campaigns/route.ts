import { NextResponse } from 'next/server';

import { createCampaign, listCampaigns } from '@/lib/marketing/campaigns';
import { getBrand } from '@/lib/marketing/brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const campaigns = await listCampaigns();
  return NextResponse.json({ campaigns });
}

/**
 * Create a campaign. If `content` is omitted we seed the body with a
 * starter that pulls the resolved brand signature directly — this is
 * the same outreach template the prospecting tool uses, so new
 * campaigns inherit your brand kit + sender details out of the box.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const subject = typeof body?.subject === 'string' ? body.subject : '';
  let content = typeof body?.content === 'string' ? body.content : '';
  if (!name) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });
  if (!content.trim()) {
    const brand = await getBrand();
    const sig = brand.signatureHtml ?? '';
    content = `<p>Hi {{firstName}},</p>\n<p>Write your message here. The signature below comes from your Brand Kit and updates everywhere when you change it.</p>\n${sig}`;
  }
  const segmentId = typeof body?.segmentId === 'string' ? body.segmentId : null;
  const groupId = typeof body?.groupId === 'string' ? body.groupId : null;
  const campaign = await createCampaign({ name, subject, content, segmentId, groupId });
  if (!campaign) return NextResponse.json({ ok: false, error: 'create failed' }, { status: 500 });
  return NextResponse.json({ ok: true, campaign });
}
