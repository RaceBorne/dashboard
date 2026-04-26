import { NextResponse } from 'next/server';

import { createSegment, listSegments } from '@/lib/marketing/segments';
import type { SegmentRuleSet } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/marketing/segments
 * → { segments: Segment[] }
 */
export async function GET() {
  const segments = await listSegments();
  return NextResponse.json({ segments });
}

/**
 * POST /api/marketing/segments
 * body: { name: string, rules: SegmentRuleSet }
 * → { ok: true, segment }
 *
 * No deep validation of `rules` here — the engine treats unknown
 * variants as 'matches no-one', so a malformed rule yields a 0-match
 * segment rather than a 500. UI is the right layer to validate before
 * save.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { name?: string; rules?: SegmentRuleSet }
    | null;
  const name = body?.name?.trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });
  }
  const rules: SegmentRuleSet = body?.rules ?? { combinator: 'and', rules: [] };
  const segment = await createSegment({ name, rules });
  if (!segment) {
    return NextResponse.json({ ok: false, error: 'create failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, segment });
}
