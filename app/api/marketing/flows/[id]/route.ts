import { NextResponse } from 'next/server';

import { deleteFlow, getFlow, listSteps, updateFlow } from '@/lib/marketing/flows';
import type { FlowTriggerType } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const flow = await getFlow(id);
  if (!flow) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  const steps = await listSteps(id);
  return NextResponse.json({ ok: true, flow, steps });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  const flow = await updateFlow(id, {
    name: typeof body.name === 'string' ? body.name : undefined,
    triggerType: typeof body.triggerType === 'string' ? (body.triggerType as FlowTriggerType) : undefined,
    triggerValue: typeof body.triggerValue === 'string' ? body.triggerValue : undefined,
    isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
  });
  if (!flow) return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 });
  return NextResponse.json({ ok: true, flow });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deleteFlow(id);
  return NextResponse.json({ ok });
}
