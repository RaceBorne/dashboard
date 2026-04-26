import { NextResponse } from 'next/server';

import { evaluateRuleSet } from '@/lib/marketing/segments';
import type { SegmentRuleSet } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/marketing/segments/preview
 * body: { rules: SegmentRuleSet }
 * → { ok: true, evaluation: { contactIds, count } }
 *
 * Evaluate a rule set without saving — for the segment-builder UI to
 * show 'this would match N contacts' as the user edits the rules.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { rules?: SegmentRuleSet }
    | null;
  const rules: SegmentRuleSet = body?.rules ?? { combinator: 'and', rules: [] };
  const evaluation = await evaluateRuleSet(rules);
  return NextResponse.json({ ok: true, evaluation });
}
