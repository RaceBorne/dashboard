import { NextResponse } from 'next/server';

import { createStep, listSteps } from '@/lib/marketing/flows';
import type { FlowStepConfig } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const steps = await listSteps(id);
  return NextResponse.json({ steps });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as
    | { stepType?: 'delay' | 'email' | 'condition'; config?: FlowStepConfig; order?: number }
    | null;
  if (!body || !body.stepType || !body.config) {
    return NextResponse.json({ ok: false, error: 'stepType + config required' }, { status: 400 });
  }
  // Auto-assign order = current step count if omitted.
  const existing = await listSteps(id);
  const order = typeof body.order === 'number' ? body.order : existing.length;
  const step = await createStep({ flowId: id, stepType: body.stepType, config: body.config, order });
  if (!step) return NextResponse.json({ ok: false, error: 'create failed' }, { status: 500 });
  return NextResponse.json({ ok: true, step });
}
