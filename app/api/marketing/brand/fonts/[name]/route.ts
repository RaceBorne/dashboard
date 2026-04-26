import { NextResponse } from 'next/server';

import { removeCustomFont, renameFontFamily } from '@/lib/marketing/brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/marketing/brand/fonts/[name]?weight=400&style=italic
 *   With ?weight + ?style — drops only that one variant.
 *   Without them — drops every variant of that family.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const url = new URL(req.url);
  const weightStr = url.searchParams.get('weight');
  const styleStr  = url.searchParams.get('style');
  const variant: { weight?: number; style?: 'normal' | 'italic' } = {};
  if (weightStr) {
    const w = Number(weightStr);
    if (Number.isFinite(w)) variant.weight = w;
  }
  if (styleStr === 'italic' || styleStr === 'normal') variant.style = styleStr;
  const brand = await removeCustomFont(
    decodeURIComponent(name),
    Object.keys(variant).length > 0 ? variant : undefined,
  );
  if (!brand) return NextResponse.json({ ok: false, error: 'Remove failed' }, { status: 500 });
  return NextResponse.json({ ok: true, brand });
}

/**
 * PATCH /api/marketing/brand/fonts/[name]
 *   Body: { name: 'New Family Name' }
 *   Renames every variant of that family. Lets the user merge two
 *   sibling families ('Katerina' + 'KaterinaRegular') by renaming one
 *   onto the other, or correct an auto-detected family that misfired.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const next = typeof body.name === 'string' ? body.name : '';
  if (!next.trim()) {
    return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });
  }
  const brand = await renameFontFamily(decodeURIComponent(name), next);
  if (!brand) return NextResponse.json({ ok: false, error: 'Rename failed' }, { status: 500 });
  return NextResponse.json({ ok: true, brand });
}
