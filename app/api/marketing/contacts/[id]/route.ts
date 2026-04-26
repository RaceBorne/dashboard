import { NextResponse } from 'next/server';

import { getContactWithMeta, updateContact } from '@/lib/marketing/contacts';
import type { ContactStatus } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/marketing/contacts/[id]
 * → { ok: true, contact: ContactWithMeta }
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contact = await getContactWithMeta(id);
  if (!contact) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, contact });
}

/**
 * PATCH /api/marketing/contacts/[id]
 * body: any subset of { firstName, lastName, email, phone, company, source, status }
 * → { ok: true, contact }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  const allowed = ['firstName', 'lastName', 'email', 'phone', 'company', 'source', 'status'] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }
  const contact = await updateContact(id, patch as Parameters<typeof updateContact>[1]);
  if (!contact) {
    return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, contact: { ...contact, status: contact.status as ContactStatus } });
}
