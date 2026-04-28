import { NextResponse } from 'next/server';
import { getOrCreateBrief, updateBrief, type StrategyBrief } from '@/lib/marketing/strategy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  const brief = await getOrCreateBrief(playId);
  if (!brief) return NextResponse.json({ ok: false, error: 'Could not load' }, { status: 500 });
  return NextResponse.json({ ok: true, brief });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  const body = (await req.json().catch(() => null)) as Partial<StrategyBrief> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  const brief = await updateBrief(playId, body);
  if (!brief) return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 });
  return NextResponse.json({ ok: true, brief });
}
