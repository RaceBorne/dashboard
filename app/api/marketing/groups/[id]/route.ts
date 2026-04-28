/**
 * Single-group endpoints — rename + delete.
 *
 *   GET    /api/marketing/groups/<id>            -> { ok, group }
 *   PATCH  /api/marketing/groups/<id>            -> body { name?, description? }
 *   DELETE /api/marketing/groups/<id>            -> drops the group + every membership row
 */

import { NextResponse } from 'next/server';

import { deleteGroup, getGroup, updateGroup } from '@/lib/marketing/groups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const group = await getGroup(id);
  if (!group) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, group });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as { name?: string; description?: string | null } | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  const patch: { name?: string; description?: string | null } = {};
  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (!trimmed) return NextResponse.json({ ok: false, error: 'Name cannot be empty' }, { status: 400 });
    patch.name = trimmed;
  }
  if ('description' in body) patch.description = body.description ?? null;
  const group = await updateGroup(id, patch);
  if (!group) return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 });
  return NextResponse.json({ ok: true, group });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deleteGroup(id);
  if (!ok) return NextResponse.json({ ok: false, error: 'Delete failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
