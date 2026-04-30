import { NextResponse } from 'next/server';
import { listAssetsWithVariants } from '@/lib/marketing/assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const families = await listAssetsWithVariants();
  return NextResponse.json({ ok: true, families });
}
