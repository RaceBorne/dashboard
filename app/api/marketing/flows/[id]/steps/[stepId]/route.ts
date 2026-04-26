import { NextResponse } from 'next/server';

import { deleteStep, updateStep } from '@/lib/marketing/flows';
import type { FlowStepConfig } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const { stepId } = await params;
  const body = (await req.json().catch(() => null)) as
    | { config?: FlowStepConfig; order?: number; stepType?: 'delay' | 'email' | 'condition' }
    | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  const step = await updateStep(stepId, body);
  if (!step) return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 });
  return NextResponse.json({ ok: true, step });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const { stepId } = await params;
  const ok = await deleteStep(stepId);
  return NextResponse.json({ ok });
}
