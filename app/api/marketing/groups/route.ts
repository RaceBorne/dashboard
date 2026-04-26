import { NextResponse } from 'next/server';

import { createGroup, listGroups } from '@/lib/marketing/groups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const groups = await listGroups();
  return NextResponse.json({ groups });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { name?: string; description?: string } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });
  const group = await createGroup({ name, description: body?.description ?? null });
  if (!group) return NextResponse.json({ ok: false, error: 'create failed' }, { status: 500 });
  return NextResponse.json({ ok: true, group });
}
