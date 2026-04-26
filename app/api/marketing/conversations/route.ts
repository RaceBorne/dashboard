import { NextResponse } from 'next/server';

import { listConversations } from '@/lib/marketing/conversations';
import type { ConversationStatus } from '@/lib/marketing/conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') as ConversationStatus | null;
  const search = url.searchParams.get('q') ?? undefined;
  const conversations = await listConversations({
    status: status ?? undefined,
    search,
    limit: 200,
  });
  return NextResponse.json({ ok: true, conversations });
}
