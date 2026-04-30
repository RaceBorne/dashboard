import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getAsset } from '@/lib/marketing/assets';
import type { AssetPurpose } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'mkt-assets';
const ALLOWED_FORMATS = ['jpeg', 'png', 'webp', 'gif'] as const;
type Format = typeof ALLOWED_FORMATS[number];

interface CropRect {
  /** All in source pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Body {
  width?: number;
  height?: number;
  format?: Format;
  purpose?: AssetPurpose;
  /** Human-readable label for the variant. Falls back to a sensible
   *  default if missing. */
  label?: string;
  /** When supplied, the source is cropped to this region (in source
   *  pixels) before being resized to width/height. */
  crop?: CropRect;
}

/**
 * POST /api/marketing/assets/[id]/convert
 *
 * Resize + reformat an existing asset and save the result as a new
 * asset row tagged with the chosen purpose. The original is kept
 * untouched. Returns the new asset.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Body;
  const format = ALLOWED_FORMATS.includes(body.format as Format) ? (body.format as Format) : 'jpeg';
  const targetWidth = Math.max(16, Math.min(8000, Math.round(body.width ?? 1200)));
  const targetHeight = body.height ? Math.max(16, Math.min(8000, Math.round(body.height))) : null;
  const purpose = (body.purpose === 'web' || body.purpose === 'newsletter') ? body.purpose : 'web';

  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  const source = await getAsset(id);
  if (!source) {
    return NextResponse.json({ ok: false, error: 'Source asset not found' }, { status: 404 });
  }

  // Pull the source bytes from the public URL. Using fetch() rather
  // than supabase.storage.download because the public URL is what we
  // know and it works regardless of bucket policy.
  let sourceBuffer: Buffer;
  try {
    const res = await fetch(source.url);
    if (!res.ok) throw new Error('Source fetch failed: ' + res.status);
    const ab = await res.arrayBuffer();
    sourceBuffer = Buffer.from(ab);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'Could not fetch source bytes', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // Sharp pipeline. If a crop rect was supplied, extract that region
  // from the source first; then resize to the target box. Format
  // dictates the encoder.
  let pipeline = sharp(sourceBuffer);
  if (body.crop && body.crop.width > 0 && body.crop.height > 0) {
    const left = Math.max(0, Math.round(body.crop.x));
    const top = Math.max(0, Math.round(body.crop.y));
    const cropW = Math.max(1, Math.round(body.crop.width));
    const cropH = Math.max(1, Math.round(body.crop.height));
    pipeline = pipeline.extract({ left, top, width: cropW, height: cropH });
  }
  pipeline = pipeline.resize({
    width: targetWidth,
    height: targetHeight ?? undefined,
    fit: targetHeight ? 'cover' : 'inside',
    withoutEnlargement: false,
  });

  let mime: string;
  let ext: string;
  switch (format) {
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
      mime = 'image/jpeg';
      ext = 'jpg';
      break;
    case 'png':
      pipeline = pipeline.png({ compressionLevel: 9 });
      mime = 'image/png';
      ext = 'png';
      break;
    case 'webp':
      pipeline = pipeline.webp({ quality: 85 });
      mime = 'image/webp';
      ext = 'webp';
      break;
    case 'gif':
      pipeline = pipeline.gif();
      mime = 'image/gif';
      ext = 'gif';
      break;
  }

  let output: Buffer;
  let outMeta: { width?: number; height?: number };
  try {
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    output = data;
    outMeta = { width: info.width, height: info.height };
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'Conversion failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  // Upload the converted bytes as a new file. Filename pattern:
  // <slug>-<purpose>-<width>w.<ext>
  const baseName = source.filename.replace(/\.[^.]+$/, '');
  const safeBase = baseName.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60);
  const newFilename = `${safeBase}-${purpose}-${targetWidth}w.${ext}`;
  const storageKey = `${safeBase}-${purpose}-${Date.now()}.${ext}`;

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(storageKey, output, {
      cacheControl: '31536000, immutable',
      contentType: mime,
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json({ ok: false, error: 'Upload failed: ' + upErr.message }, { status: 500 });
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storageKey);
  const url = pub.publicUrl;

  // Variants always anchor on the ROOT, never on another variant.
  // If the convert was requested against a variant, walk one hop back
  // to its parent so the family stays flat and one level deep.
  const rootId = source.parentAssetId ?? source.id;

  // Default label captures the salient settings so even if the user
  // doesn't type one, the variant is identifiable inside the family.
  const defaultLabel = `${purpose === 'newsletter' ? 'Newsletter' : 'Web'} ${targetWidth}w ${format.toUpperCase()}`;
  const label = (body.label ?? '').trim() || defaultLabel;

  const { data: row, error: insErr } = await sb
    .from('dashboard_mkt_assets')
    .insert({
      kind: source.kind,
      filename: newFilename,
      storage_key: storageKey,
      url,
      mime_type: mime,
      size_bytes: output.length,
      width: outMeta.width ?? null,
      height: outMeta.height ?? null,
      tags: source.tags,
      alt_text: source.altText,
      purposes: ['global', purpose],
      parent_asset_id: rootId,
      variant_label: label,
    })
    .select('*')
    .single();

  if (insErr || !row) {
    return NextResponse.json({ ok: false, error: 'Insert failed: ' + (insErr?.message ?? 'unknown') }, { status: 500 });
  }

  // Map row -> client-facing asset (mirror lib/marketing/assets.ts).
  const r = row as {
    id: string;
    kind: string;
    filename: string;
    storage_key: string;
    url: string;
    mime_type: string | null;
    size_bytes: number | null;
    width: number | null;
    height: number | null;
    tags: string[] | null;
    purposes: string[] | null;
    parent_asset_id: string | null;
    variant_label: string | null;
    alt_text: string | null;
    created_at: string;
    updated_at: string;
  };
  return NextResponse.json({
    ok: true,
    asset: {
      id: r.id,
      kind: r.kind,
      filename: r.filename,
      storageKey: r.storage_key,
      url: r.url,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      width: r.width,
      height: r.height,
      tags: r.tags ?? [],
      purposes: r.purposes ?? ['global', purpose],
      parentAssetId: rootId,
      variantLabel: label,
      altText: r.alt_text,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    },
  });
}
