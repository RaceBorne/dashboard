import { NextResponse } from 'next/server';
import { getCachedScores } from '@/lib/marketing/fitScore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { domains?: string[]; playId?: string | null } | null;
  const domains = Array.isArray(body?.domains) ? (body!.domains!.filter((x) => typeof x === 'string') as string[]) : [];
  const scores = await getCachedScores(domains, body?.playId ?? null);
  return NextResponse.json({ ok: true, scores });
}
