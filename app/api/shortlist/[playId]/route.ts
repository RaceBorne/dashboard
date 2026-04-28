/**
 * GET    /api/shortlist/[playId]              → list candidates for the idea
 * POST   /api/shortlist/[playId]              → add candidate(s) (body: { candidates: CandidateInput[] } or single)
 * PATCH  /api/shortlist/[playId]              → set status on selected ids (body: { ids, status })
 * DELETE /api/shortlist/[playId]              → remove ids (body: { ids })
 */

import { NextResponse } from 'next/server';
import { addCandidate, listShortlist, removeFromShortlist, setStatus, type ShortlistStatus } from '@/lib/marketing/shortlist';
import type { CandidateInput } from '@/lib/marketing/fitScore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(_req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  const items = await listShortlist(playId);
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  const body = (await req.json().catch(() => null)) as { candidate?: CandidateInput; candidates?: CandidateInput[] } | null;
  const list: CandidateInput[] = [];
  if (body?.candidate?.domain) list.push(body.candidate);
  if (Array.isArray(body?.candidates)) {
    for (const c of body!.candidates!) {
      if (c?.domain && c?.name) list.push(c);
    }
  }
  if (list.length === 0) return NextResponse.json({ ok: false, error: 'no candidates' }, { status: 400 });
  const added: Array<unknown> = [];
  for (const c of list) {
    const e = await addCandidate(playId, c);
    if (e) added.push(e);
  }
  return NextResponse.json({ ok: true, added });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  const body = (await req.json().catch(() => null)) as { ids?: unknown; status?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? (body!.ids as unknown[]).filter((x) => typeof x === 'string') as string[] : [];
  const status = body?.status as ShortlistStatus | undefined;
  if (!status || !['candidate', 'shortlisted', 'low_fit', 'removed'].includes(status)) {
    return NextResponse.json({ ok: false, error: 'invalid status' }, { status: 400 });
  }
  const updated = await setStatus(playId, ids, status);
  return NextResponse.json({ ok: true, updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? (body!.ids as unknown[]).filter((x) => typeof x === 'string') as string[] : [];
  const removed = await removeFromShortlist(playId, ids);
  return NextResponse.json({ ok: true, removed });
}
