import { NextResponse } from 'next/server';

import { assignGroups } from '@/lib/marketing/contacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/marketing/contacts/[id]/groups
 * body: { groupIds: string[] }   (replace semantics)
 * → { ok: true }
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { groupIds?: unknown } | null;
  const ids = Array.isArray(body?.groupIds)
    ? (body!.groupIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const ok = await assignGroups(id, ids);
  if (!ok) return NextResponse.json({ ok: false, error: 'Assign failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
