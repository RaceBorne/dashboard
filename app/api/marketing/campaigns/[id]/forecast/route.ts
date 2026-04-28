import { NextResponse } from 'next/server';
import { forecastForCampaign } from '@/lib/marketing/forecast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const recipientCount = Number(url.searchParams.get('recipientCount') ?? '0');
  const forecast = await forecastForCampaign(id, recipientCount);
  return NextResponse.json({ ok: true, forecast });
}
