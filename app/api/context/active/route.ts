import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ACTIVE_CONTEXT_COOKIE, getActiveContext } from '@/lib/context/activeContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getActiveContext();
  return NextResponse.json({ ok: true, context: ctx });
}

interface PostBody {
  id?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as PostBody;
  if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
  const c = await cookies();
  c.set(ACTIVE_CONTEXT_COOKIE, body.id, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.json({ ok: true, id: body.id });
}
