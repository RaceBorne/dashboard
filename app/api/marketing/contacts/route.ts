import { NextResponse } from 'next/server';

import { createContact, listContacts } from '@/lib/marketing/contacts';
import type { ContactStatus } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/marketing/contacts
 *   ?status=active|unsubscribed|suppressed
 *   ?search=<q>
 *   ?limit=<n>           (default 500)
 * → { contacts: Contact[] }
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') as ContactStatus | null;
  const search = url.searchParams.get('search') ?? undefined;
  const limit = Number(url.searchParams.get('limit') ?? '500');
  const contacts = await listContacts({
    status: status ?? undefined,
    search,
    limit: Number.isFinite(limit) ? limit : 500,
  });
  return NextResponse.json({ contacts });
}

/**
 * POST /api/marketing/contacts
 * body: { email, firstName?, lastName?, phone?, company?, source?, status? }
 * → { ok: true, contact }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!email) {
    return NextResponse.json({ ok: false, error: 'email required' }, { status: 400 });
  }
  const contact = await createContact({
    email,
    firstName: (body?.firstName as string) ?? null,
    lastName: (body?.lastName as string) ?? null,
    phone: (body?.phone as string) ?? null,
    company: (body?.company as string) ?? null,
    source: (body?.source as string) ?? null,
    status: (body?.status as ContactStatus) ?? 'active',
  });
  if (!contact) {
    return NextResponse.json({ ok: false, error: 'create failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, contact });
}
