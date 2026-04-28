import { NextResponse } from 'next/server';
import { getPersonFeed } from '@/lib/marketing/personFeed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPersonFeed(id);
  if (!result.person) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, ...result });
}
