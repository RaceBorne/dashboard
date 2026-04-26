import { NextResponse } from 'next/server';

import { removeCustomFont } from '@/lib/marketing/brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const brand = await removeCustomFont(decodeURIComponent(name));
  if (!brand) return NextResponse.json({ ok: false, error: 'Remove failed' }, { status: 500 });
  return NextResponse.json({ ok: true, brand });
}
