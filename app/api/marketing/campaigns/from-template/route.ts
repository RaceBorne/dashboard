/**
 * One-click campaign creation from a saved template.
 * POST /api/marketing/campaigns/from-template { templateId, name? }
 *  → deep-copies the template's design into a fresh draft campaign.
 */

import { NextResponse } from 'next/server';

import { getTemplate } from '@/lib/marketing/templates';
import { createCampaign } from '@/lib/marketing/campaigns';
import type { EmailDesign } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { templateId?: string; name?: string } | null;
  if (!body?.templateId) return NextResponse.json({ ok: false, error: 'templateId required' }, { status: 400 });
  const t = await getTemplate(body.templateId);
  if (!t) return NextResponse.json({ ok: false, error: 'template not found' }, { status: 404 });
  const design = JSON.parse(JSON.stringify(t.design)) as EmailDesign;
  const campaign = await createCampaign({
    name: (body.name ?? `${t.name} — campaign`).trim(),
    subject: '',
    content: '', // emailDesign supersedes
    emailDesign: design,
  });
  if (!campaign) return NextResponse.json({ ok: false, error: 'create failed' }, { status: 500 });
  return NextResponse.json({ ok: true, campaign });
}
