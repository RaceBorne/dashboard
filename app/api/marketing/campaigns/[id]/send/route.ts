import { NextResponse } from 'next/server';

import { sendCampaign } from '@/lib/marketing/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/marketing/campaigns/[id]/send
 *   body { excludeContactIds?: string[] }   // optional held-by-reviewer list
 * → { ok, attempted, sent, suppressed, failed, error? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as { excludeContactIds?: unknown } | null;
  const excludeContactIds = Array.isArray(body?.excludeContactIds)
    ? (body!.excludeContactIds as unknown[]).filter((x) => typeof x === 'string') as string[]
    : [];
  const result = await sendCampaign(id, { excludeContactIds });
  return NextResponse.json({ ...result });
}
