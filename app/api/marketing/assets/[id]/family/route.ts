import { NextResponse } from 'next/server';
import { getAssetWithVariants } from '@/lib/marketing/assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/marketing/assets/[id]/family
 *
 * Returns { root, variants } so the workspace detail panel can show
 * the original alongside its variant family. Works when the supplied
 * id is either a root or a variant; the lookup walks back to the
 * root either way.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const family = await getAssetWithVariants(id);
  if (!family) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, ...family });
}
