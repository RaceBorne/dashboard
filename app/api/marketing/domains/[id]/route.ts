import { NextResponse } from 'next/server';

import { deleteDomain, getDomain } from '@/lib/marketing/domains';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const domain = await getDomain(id);
  if (!domain) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, domain });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deleteDomain(id);
  return NextResponse.json({ ok });
}
