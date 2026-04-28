import { NextResponse } from 'next/server';
import { getStrategyAnalytics } from '@/lib/marketing/strategyAnalytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  const analytics = await getStrategyAnalytics(playId);
  return NextResponse.json({ ok: true, analytics });
}
