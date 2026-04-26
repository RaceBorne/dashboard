import { NextResponse } from 'next/server';

import { getBrand, updateBrand } from '@/lib/marketing/brand';
import type { BrandColors, BrandFonts, FooterDesign } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const brand = await getBrand();
  return NextResponse.json({ brand });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  const patch: Parameters<typeof updateBrand>[0] = {};
  if ('companyName' in body)    patch.companyName    = body.companyName as string | null;
  if ('companyAddress' in body) patch.companyAddress = body.companyAddress as string | null;
  if ('replyToEmail' in body)   patch.replyToEmail   = body.replyToEmail as string | null;
  if ('logoLightUrl' in body)   patch.logoLightUrl   = body.logoLightUrl as string | null;
  if ('logoDarkUrl' in body)    patch.logoDarkUrl    = body.logoDarkUrl as string | null;
  if ('colors' in body)         patch.colors         = body.colors as BrandColors;
  if ('fonts' in body)          patch.fonts          = body.fonts as BrandFonts;
  if ('signatureHtml' in body)  patch.signatureHtml  = body.signatureHtml as string | null;
  if ('footerDesign' in body)   patch.footerDesign   = body.footerDesign as FooterDesign | null;
  const brand = await updateBrand(patch);
  if (!brand) return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 });
  return NextResponse.json({ ok: true, brand });
}
