import { NextResponse } from 'next/server';

import { evaluateSegment } from '@/lib/marketing/segments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/marketing/segments/[id]/evaluate
 * → { ok: true, evaluation: { contactIds: string[], count: number } }
 *
 * POST (not GET) because evaluating is non-cacheable + may be expensive
 * — the verb makes intent explicit. No body required.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const evaluation = await evaluateSegment(id);
  if (!evaluation) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, evaluation });
}
