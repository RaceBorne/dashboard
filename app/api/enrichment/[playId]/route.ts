import { NextResponse } from 'next/server';
import { addEnrichmentContact, listEnrichment, setEnrichmentStatus, type EnrichmentStatus } from '@/lib/marketing/enrichment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  const items = await listEnrichment(playId);
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body?.companyName || !body?.fullName) {
    return NextResponse.json({ ok: false, error: 'companyName + fullName required' }, { status: 400 });
  }
  const out = await addEnrichmentContact({
    playId,
    shortlistId: (body.shortlistId as string) ?? null,
    domain: (body.domain as string) ?? null,
    companyName: body.companyName as string,
    fullName: body.fullName as string,
    email: (body.email as string) ?? null,
    jobTitle: (body.jobTitle as string) ?? null,
    linkedinUrl: (body.linkedinUrl as string) ?? null,
    fitScore: typeof body.fitScore === 'number' ? body.fitScore : null,
    aiSummary: (body.aiSummary as string) ?? null,
    suggestedTags: Array.isArray(body.suggestedTags) ? body.suggestedTags as string[] : null,
    signals: Array.isArray(body.signals) ? body.signals as never[] : null,
  });
  return NextResponse.json({ ok: true, contact: out });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  const body = (await req.json().catch(() => null)) as { ids?: string[]; status?: EnrichmentStatus } | null;
  const ids = Array.isArray(body?.ids) ? body!.ids : [];
  if (!body?.status) return NextResponse.json({ ok: false, error: 'status required' }, { status: 400 });
  const updated = await setEnrichmentStatus(playId, ids, body.status);
  return NextResponse.json({ ok: true, updated });
}
