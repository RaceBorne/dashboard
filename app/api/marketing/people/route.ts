import { NextResponse } from 'next/server';
import { listPeople } from '@/lib/marketing/personFeed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.get('q') ?? undefined;
  const people = await listPeople({ search, limit: 300 });
  return NextResponse.json({ ok: true, people });
}
