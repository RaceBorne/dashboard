import { NextResponse } from 'next/server';
import { getFitCriteria, updateFitCriteria, type FitCriteria } from '@/lib/marketing/fitScore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const criteria = await getFitCriteria();
  return NextResponse.json({ ok: true, criteria });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<FitCriteria> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  const criteria = await updateFitCriteria(body);
  return NextResponse.json({ ok: true, criteria });
}
