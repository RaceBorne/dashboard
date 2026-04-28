import { NextResponse } from 'next/server';
import { scoreCompany, type CandidateInput } from '@/lib/marketing/fitScore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { candidate?: CandidateInput; playId?: string | null } | null;
  if (!body?.candidate?.domain || !body.candidate.name) {
    return NextResponse.json({ ok: false, error: 'candidate.domain + name required' }, { status: 400 });
  }
  const score = await scoreCompany(body.candidate, body.playId ?? null);
  return NextResponse.json({ ok: true, score });
}
