/**
 * GET  /api/marketing/settings — return singleton settings.
 * PATCH /api/marketing/settings — update fields.
 */

import { NextResponse } from 'next/server';

import { getMktSettings, updateMktSettings } from '@/lib/marketing/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await getMktSettings();
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  const patch: Record<string, number> = {};
  if (typeof body.frequencyCapCount === 'number') patch.frequencyCapCount = body.frequencyCapCount;
  if (typeof body.frequencyCapDays === 'number') patch.frequencyCapDays = body.frequencyCapDays;
  const settings = await updateMktSettings(patch);
  return NextResponse.json({ ok: true, settings });
}
