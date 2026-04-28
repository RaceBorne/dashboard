import { NextResponse } from 'next/server';
import { setFollowupStatus } from '@/lib/marketing/followups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH body: { status: 'dismissed' | 'pending' | 'sent' } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { status?: string } | null;
  const status = body?.status;
  if (status !== 'dismissed' && status !== 'pending' && status !== 'sent') {
    return NextResponse.json({ ok: false, error: 'invalid status' }, { status: 400 });
  }
  await setFollowupStatus(id, status);
  return NextResponse.json({ ok: true });
}
