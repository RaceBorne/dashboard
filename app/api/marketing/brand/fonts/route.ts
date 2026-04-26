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


/**
 * Parse a font filename into its family + weight + style components.
 *
 * Most foundries ship files like:
 *   Katerina-Regular.woff2          → family Katerina, 400 normal
 *   Katerina-BoldItalic.woff2       → family Katerina, 700 italic
 *   KaterinaAlt-300.ttf             → family KaterinaAlt, 300 normal
 *   Inter Variable Bold Italic.otf  → family Inter Variable, 700 italic
 *   KaterinaBold.otf                → family Katerina, 700 normal       (CamelCase)
 *   KaterinaAltBoldItalic.woff      → family Katerina Alt, 700 italic
 *   OpinionProCondensed.woff2       → family Opinion Pro Condensed, 400
 *
 * Strategy: split the basename into tokens on - _ space AND on CamelCase
 * boundaries, then walk right-to-left peeling off any tokens that match
 * a known weight or style word (or numeric weight). Whatever remains is
 * the family name. CamelCase splitting handles filenames with no
 * separators at all (very common for paid foundries).
 */
const WEIGHT_WORDS: Record<string, number> = {
  hairline: 100, thin: 100,
  extralight: 200, ultralight: 200,
  light: 300,
  regular: 400, normal: 400, book: 400, roman: 400,
  medium: 500,
  semibold: 600, demibold: 600, demi: 600,
  bold: 700,
  extrabold: 800, ultrabold: 800, heavy: 800,
  black: 900, ultra: 900,
};
const STYLE_WORDS = new Set(['italic', 'oblique', 'slanted']);

/** CamelCase splitter — XMLParser → ["XML","Parser"], FooBar → ["Foo","Bar"]. */
function splitCamelCase(token: string): string[] {
  if (token === token.toLowerCase() || token === token.toUpperCase()) return [token];
  return token
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
}

function parseFontName(filename: string): {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
} {
  const base = filename.replace(/\.[^.]+$/, '');
  // Split on explicit separators first, then expand each fragment by CamelCase
  // so we catch both 'Katerina-Bold' and 'KaterinaBold' uniformly.
  const tokens = base
    .split(/[-_\s]+/)
    .filter(Boolean)
    .flatMap(splitCamelCase);
  let weight: number | null = null;
  let style: 'normal' | 'italic' = 'normal';
  // Walk right-to-left, peeling off recognised tokens. Stop the moment we
  // hit an unrecognised token — anything to the left is the family name.
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    const lower = last.toLowerCase();
    if (/^[1-9]00$/.test(lower)) {
      weight = weight ?? Number(lower);
      tokens.pop();
      continue;
    }
    if (STYLE_WORDS.has(lower)) {
      style = 'italic';
      tokens.pop();
      continue;
    }
    let matched = false;
    for (const word of Object.keys(WEIGHT_WORDS)) {
      if (lower === word) {
        weight = weight ?? WEIGHT_WORDS[word];
        matched = true;
        break;
      }
      // Compound: 'bolditalic', 'mediumitalic', etc. Survives even after
      // CamelCase splitting if a foundry mashes them as 'BoldItalic'.
      if (lower === word + 'italic' || lower === word + 'oblique') {
        weight = weight ?? WEIGHT_WORDS[word];
        style = 'italic';
        matched = true;
        break;
      }
    }
    if (matched) {
      tokens.pop();
      continue;
    }
    break;
  }
  return {
    family: tokens.join(' ') || base,
    weight: weight ?? 400,
    style,
  };
}

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

  // Auto-derive family + weight + style from the filename, then let
  // explicit form fields override (lets the user be lazy AND precise).
  const auto = parseFontName(f.name);
  const rawName = String(form.get('name') ?? '').trim();
  const familyName = rawName || auto.family;
  const weightRawForm = form.get('weight');
  const weightRaw = weightRawForm == null || weightRawForm === '' ? auto.weight : Number(weightRawForm);
  const weight = Number.isFinite(weightRaw) && weightRaw >= 100 && weightRaw <= 900 ? Math.round(weightRaw) : auto.weight;
  const styleRawForm = form.get('style');
  const styleRaw = styleRawForm == null || styleRawForm === '' ? auto.style : String(styleRawForm).toLowerCase();
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
