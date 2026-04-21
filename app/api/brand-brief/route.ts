/**
 * GET  /api/brand-brief  — fetch the active brief
 * PATCH /api/brand-brief — overwrite the brief (admin edits)
 *
 * Anyone with dashboard access can read; PATCH is gated by the admin
 * Supabase client + CRON_SECRET header so casual page-level callers
 * can't trash the grounding.
 */
import { NextResponse } from 'next/server';
import {
  getBrandBrief,
  upsertBrandBrief,
  invalidateBrandBriefCache,
} from '@/lib/brand/brandBrief';
import type { BrandBrief } from '@/lib/brand/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const brief = await getBrandBrief();
    return NextResponse.json({ ok: true, brief });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  const authz = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authz !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  let body: Partial<BrandBrief>;
  try {
    body = (await req.json()) as Partial<BrandBrief>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  try {
    const current = await getBrandBrief();
    const next: BrandBrief = { ...current, ...body, id: 'brand_brief' };
    const saved = await upsertBrandBrief(next);
    invalidateBrandBriefCache();
    return NextResponse.json({ ok: true, brief: saved });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
