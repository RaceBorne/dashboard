import { NextResponse } from 'next/server';

import { loadAudienceBundle } from '@/lib/marketing/audience';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const bundle = await loadAudienceBundle();
  return NextResponse.json({ ok: true, ...bundle });
}
