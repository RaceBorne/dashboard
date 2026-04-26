import { NextResponse } from 'next/server';

import { deleteTemplate, duplicateTemplate, getTemplate, updateTemplate } from '@/lib/marketing/templates';
import type { EmailDesign } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTemplate(id);
  if (!t) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, template: t });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  const patch: Parameters<typeof updateTemplate>[1] = {};
  if (typeof body.name === 'string')         patch.name = body.name;
  if (body.design && typeof body.design === 'object') patch.design = body.design as EmailDesign;
  if ('description' in body)                 patch.description = (body.description as string | null) ?? null;
  if ('thumbnailUrl' in body)                patch.thumbnailUrl = (body.thumbnailUrl as string | null) ?? null;
  const template = await updateTemplate(id, patch);
  if (!template) return NextResponse.json({ ok: false, error: 'update failed' }, { status: 500 });
  return NextResponse.json({ ok: true, template });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deleteTemplate(id);
  if (!ok) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// POST /[id] with body { duplicate: true } — convenience for copy actions
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  if (body.duplicate) {
    const dup = await duplicateTemplate(id);
    if (!dup) return NextResponse.json({ ok: false }, { status: 500 });
    return NextResponse.json({ ok: true, template: dup });
  }
  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
