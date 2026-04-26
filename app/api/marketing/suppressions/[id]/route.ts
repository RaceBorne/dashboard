import { NextResponse } from 'next/server';

import { removeSuppression } from '@/lib/marketing/suppressions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await removeSuppression(id);
  return NextResponse.json({ ok });
}
