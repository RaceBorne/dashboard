import { NextResponse } from 'next/server';

import { createFlow, listFlows } from '@/lib/marketing/flows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const flows = await listFlows();
  return NextResponse.json({ flows });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const triggerValue = typeof body?.triggerValue === 'string' ? body.triggerValue.trim() : '';
  if (!name || !triggerValue) {
    return NextResponse.json({ ok: false, error: 'name + triggerValue required' }, { status: 400 });
  }
  const flow = await createFlow({
    name,
    triggerType: 'event',
    triggerValue,
    isActive: Boolean(body?.isActive),
  });
  if (!flow) return NextResponse.json({ ok: false, error: 'create failed' }, { status: 500 });
  return NextResponse.json({ ok: true, flow });
}
