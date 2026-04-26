/**
 * Bulk operations for the Email · Contacts explorer.
 *
 *   POST { ids: string[], op: 'addTag' | 'removeTag', value: string }
 *
 *  Returns { ok, updated: <count> }.
 */

import { NextResponse } from 'next/server';

import { bulkAddTag, bulkRemoveTag } from '@/lib/marketing/leads-as-contacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x) => typeof x === 'string') as string[] : [];
  const op = String(body.op ?? '');
  const value = String(body.value ?? '').trim();
  if (ids.length === 0) return NextResponse.json({ ok: false, error: 'ids[] required' }, { status: 400 });
  if (!value) return NextResponse.json({ ok: false, error: 'value required' }, { status: 400 });

  let updated = 0;
  if (op === 'addTag')         updated = await bulkAddTag(ids, value);
  else if (op === 'removeTag') updated = await bulkRemoveTag(ids, value);
  else return NextResponse.json({ ok: false, error: `Unknown op: ${op}` }, { status: 400 });

  return NextResponse.json({ ok: true, updated });
}
