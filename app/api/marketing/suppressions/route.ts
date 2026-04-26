import { NextResponse } from 'next/server';

import { addSuppression, listSuppressions } from '@/lib/marketing/suppressions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.get('search') ?? undefined;
  const suppressions = await listSuppressions({ search });
  return NextResponse.json({ suppressions });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: string; reason?: string }
    | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: 'email required' }, { status: 400 });
  const sup = await addSuppression({ email, reason: body?.reason ?? 'manual', source: 'dashboard' });
  if (!sup) return NextResponse.json({ ok: false, error: 'add failed' }, { status: 500 });
  return NextResponse.json({ ok: true, suppression: sup });
}
