import { NextResponse } from 'next/server';
import { getSendTimeRecommendation } from '@/lib/marketing/sendTime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const rec = await getSendTimeRecommendation();
  return NextResponse.json({ ok: true, recommendation: rec });
}
