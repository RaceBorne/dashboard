import { NextResponse } from 'next/server';

import { sendCampaign } from '@/lib/marketing/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/marketing/campaigns/[id]/send
 * → { ok, attempted, sent, suppressed, failed, error? }
 *
 * Synchronous send — small lists only. For large campaigns this
 * should be replaced with a queue + worker (out of scope for Phase 5).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await sendCampaign(id);
  return NextResponse.json({ ...result });
}
