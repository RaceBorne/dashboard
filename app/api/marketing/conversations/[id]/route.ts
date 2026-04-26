import { NextResponse } from 'next/server';

import { getConversation, setConversationStatus } from '@/lib/marketing/conversations';
import type { ConversationStatus } from '@/lib/marketing/conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getConversation(id);
  if (!c) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, conversation: c });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as { status?: ConversationStatus } | null;
  if (!body?.status) return NextResponse.json({ ok: false, error: 'status required' }, { status: 400 });
  const c = await setConversationStatus(id, body.status);
  if (!c) return NextResponse.json({ ok: false, error: 'update failed' }, { status: 500 });
  return NextResponse.json({ ok: true, conversation: c });
}
