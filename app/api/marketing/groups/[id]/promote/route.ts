import { NextResponse } from 'next/server';
import { promoteMembers } from '@/lib/marketing/groups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as { contactIds?: string[] } | null;
  const contactIds = (body?.contactIds ?? []).filter((x) => typeof x === 'string');
  if (contactIds.length === 0) return NextResponse.json({ ok: false, error: 'contactIds[] required' }, { status: 400 });
  const promoted = await promoteMembers(id, contactIds);
  return NextResponse.json({ ok: true, promoted });
}
