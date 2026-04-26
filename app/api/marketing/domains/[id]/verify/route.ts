import { NextResponse } from 'next/server';

import { verifyDomain } from '@/lib/marketing/domains';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/marketing/domains/[id]/verify
 * → { ok, status: { domain, checks: [...], fullyVerified } }
 *
 * Re-syncs from Postmark (DKIM may have changed) then performs DNS
 * lookups against SPF/DKIM/DMARC and reports per-record status.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const status = await verifyDomain(id);
  if (!status) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, status });
}
