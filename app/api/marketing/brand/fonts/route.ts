/**
 * Custom-font upload for the brand kit.
 *
 *   POST /api/marketing/brand/fonts
 *   Content-Type: multipart/form-data
 *   Fields:
 *     file    (required)  the font file (.woff2 / .woff / .ttf / .otf, ≤5MB)
 *     name    (optional)  display + font-family name. Defaults to the file
 *                          basename minus extension.
 *     weight  (optional)  100..900, default 400
 *     style   (optional)  'normal' | 'italic', default 'normal'
 *
 * Stores the file in the public 'mkt-brand-fonts' bucket and appends a
 * record to dashboard_mkt_brand.custom_fonts. Returns the updated brand.
 */

import { NextResponse } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { appendCustomFont } from '@/lib/marketing/brand';
import type { CustomFont } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'mkt-brand-fonts';

function detectFormat(filename: string): CustomFont['format'] | null {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'woff2') return 'woff2';
  if (ext === 'woff')  return 'woff';
  if (ext === 'ttf')   return 'truetype';
  if (ext === 'otf')   return 'opentype';
  return null;
}

function safeSlug(s: string): string {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function POST(req: Request) {
  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'Supabase admin unavailable' }, { status: 500 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'multipart/form-data required' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof Blob) || (file as File).size === 0) {
    return NextResponse.json({ ok: false, error: 'file required' }, { status: 400 });
  }
  const f = file as File;
  if (f.size > 5_242_880) {
    return NextResponse.json({ ok: false, error: 'File too large (max 5MB)' }, { status: 400 });
  }
  const format = detectFormat(f.name);
  if (!format) {
    return NextResponse.json({ ok: false, error: 'Unsupported font file. Use .woff2 / .woff / .ttf / .otf' }, { status: 400 });
  }

  const rawName = String(form.get('name') ?? '').trim();
  const baseName = rawName || f.name.replace(/\.[^.]+$/, '');
  const familyName = baseName.trim() || 'Custom font';
  const weightRaw = Number(form.get('weight') ?? '400');
  const weight = Number.isFinite(weightRaw) && weightRaw >= 100 && weightRaw <= 900 ? Math.round(weightRaw) : 400;
  const styleRaw = String(form.get('style') ?? 'normal').toLowerCase();
  const style: CustomFont['style'] = styleRaw === 'italic' ? 'italic' : 'normal';

  // Storage key — slug + timestamp so re-uploads don't clobber and we
  // sidestep filename casing issues with mailbox @font-face cache.
  const slug = safeSlug(`${familyName}-${weight}-${style}`);
  const key = `${slug}-${Date.now()}.${f.name.split('.').pop()?.toLowerCase()}`;

  const arrayBuffer = await f.arrayBuffer();
  const { error: uploadErr } = await sb.storage.from(BUCKET).upload(key, arrayBuffer, {
    cacheControl: '31536000, immutable',
    contentType: f.type || 'font/' + format,
    upsert: false,
  });
  if (uploadErr) {
    console.error('[mkt.brand.fonts.upload]', uploadErr);
    return NextResponse.json({ ok: false, error: uploadErr.message }, { status: 500 });
  }
  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(key);
  const url = pub.publicUrl;

  const font: CustomFont = {
    name: familyName,
    weight,
    style,
    url,
    filename: f.name,
    format,
    uploadedAt: new Date().toISOString(),
  };
  const brand = await appendCustomFont(font);
  if (!brand) return NextResponse.json({ ok: false, error: 'Brand update failed' }, { status: 500 });
  return NextResponse.json({ ok: true, font, brand });
}
