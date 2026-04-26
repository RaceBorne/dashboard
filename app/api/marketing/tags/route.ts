import { NextResponse } from 'next/server';

import { createTag, listTags } from '@/lib/marketing/tags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const tags = await listTags();
  return NextResponse.json({ tags });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });
  const tag = await createTag(name);
  if (!tag) return NextResponse.json({ ok: false, error: 'create failed' }, { status: 500 });
  return NextResponse.json({ ok: true, tag });
}
