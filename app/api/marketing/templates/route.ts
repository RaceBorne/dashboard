import { NextResponse } from 'next/server';

import { createTemplate, listTemplates } from '@/lib/marketing/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.get('q') ?? undefined;
  const templates = await listTemplates({ search });
  return NextResponse.json({ ok: true, templates });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });
  const design = body?.design && typeof body.design === 'object' ? body.design as Parameters<typeof createTemplate>[0]['design'] : undefined;
  const description = typeof body?.description === 'string' ? body.description : null;
  const template = await createTemplate({ name, design, description });
  if (!template) return NextResponse.json({ ok: false, error: 'create failed' }, { status: 500 });
  return NextResponse.json({ ok: true, template });
}
