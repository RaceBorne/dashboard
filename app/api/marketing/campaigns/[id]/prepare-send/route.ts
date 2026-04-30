import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { EmailBlock, EmailDesign, SplitCell, SplitCells, SplitItem } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BUCKET = 'mkt-assets';

interface ImageRef {
  src: string;
  /** Where in the design this src was found, for traceability. */
  location: string;
  /** Replace function: given a new URL, mutate the design in place. */
  replace: (newUrl: string) => void;
}

interface PerImageReport {
  src: string;
  filename: string | null;
  beforeBytes: number | null;
  afterBytes: number | null;
  beforeDims: string | null;
  afterDims: string | null;
  newUrl: string | null;
  reused: boolean;
  error?: string;
}

/**
 * POST /api/marketing/campaigns/[id]/prepare-send
 *
 * Walks the campaign's email design, finds every image src pointing
 * at our mkt-assets bucket, generates a small JPEG variant per image
 * sized for the campaign's content width × 2 (retina), tags each
 * variant with `campaign:<id>` for traceability, rewrites the src
 * URLs in the design, and persists the updated design back.
 *
 * Idempotent: re-running on an already-prepared campaign is fast
 * because each variant is keyed by (parent_asset_id, campaign tag)
 * and reused if found.
 *
 * Response shape:
 *   { ok, perImage[], totals: { count, beforeBytes, afterBytes },
 *     htmlBytes, ceilings: { gmailClip, totalSize } }
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;
  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  // Load campaign.
  const { data: campaign, error: campErr } = await sb
    .from('dashboard_mkt_campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle();
  if (campErr || !campaign) {
    return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
  }
  const design = (campaign.email_design ?? null) as EmailDesign | null;
  if (!design) {
    return NextResponse.json({ ok: false, error: 'Campaign has no email design to prepare' }, { status: 400 });
  }

  // Target width: content width × 2 for retina, capped at 1200.
  const contentWidth = design.widthPx ?? 600;
  const targetWidth = Math.min(1200, contentWidth * 2);

  // Walk the design and collect every src reference we can rewrite.
  const refs: ImageRef[] = collectImageRefs(design);
  const ourRefs = refs.filter((r) => r.src.includes(`/${BUCKET}/`));
  // Group by src so each unique source is converted once even if it
  // appears multiple times in the design.
  const bySrc = new Map<string, ImageRef[]>();
  for (const r of ourRefs) {
    const list = bySrc.get(r.src) ?? [];
    list.push(r);
    bySrc.set(r.src, list);
  }

  const campaignTag = `campaign:${campaignId}`;
  const perImage: PerImageReport[] = [];

  for (const [src, refList] of bySrc.entries()) {
    const report = await prepareOne({
      src,
      campaignId,
      campaignTag,
      targetWidth,
    });
    if (report.newUrl) {
      for (const r of refList) r.replace(report.newUrl);
    }
    perImage.push(report);
  }

  // Persist the updated design.
  const { error: upErr } = await sb
    .from('dashboard_mkt_campaigns')
    .update({ email_design: design, updated_at: new Date().toISOString() })
    .eq('id', campaignId);
  if (upErr) {
    return NextResponse.json({ ok: false, error: 'Could not save updated design: ' + upErr.message }, { status: 500 });
  }

  // Compute totals + ceilings.
  const totalsBefore = perImage.reduce((sum, r) => sum + (r.beforeBytes ?? 0), 0);
  const totalsAfter = perImage.reduce((sum, r) => sum + (r.afterBytes ?? 0), 0);
  // HTML body size estimate: stringify the design as a proxy. The
  // real renderer adds boilerplate, but the design size is the
  // dominant factor and a useful indicator for Gmail's 102KB cap.
  const designJson = JSON.stringify(design);
  const htmlBytesEstimate = Buffer.byteLength(designJson, 'utf8');

  const GMAIL_CLIP_BYTES = 102 * 1024;
  const TOTAL_CEILING_BYTES = 2 * 1024 * 1024;

  return NextResponse.json({
    ok: true,
    perImage,
    totals: {
      count: perImage.length,
      beforeBytes: totalsBefore,
      afterBytes: totalsAfter,
    },
    htmlBytes: htmlBytesEstimate,
    targetWidth,
    ceilings: {
      gmailClip: htmlBytesEstimate <= GMAIL_CLIP_BYTES,
      gmailClipBytes: GMAIL_CLIP_BYTES,
      totalSize: (htmlBytesEstimate + totalsAfter) <= TOTAL_CEILING_BYTES,
      totalCeilingBytes: TOTAL_CEILING_BYTES,
    },
  });
}

async function prepareOne(opts: {
  src: string;
  campaignId: string;
  campaignTag: string;
  targetWidth: number;
}): Promise<PerImageReport> {
  const sb = createSupabaseAdmin();
  if (!sb) return { src: opts.src, filename: null, beforeBytes: null, afterBytes: null, beforeDims: null, afterDims: null, newUrl: null, reused: false, error: 'DB unavailable' };

  // Look up the source asset by its public URL.
  const { data: sourceRow } = await sb
    .from('dashboard_mkt_assets')
    .select('*')
    .eq('url', opts.src)
    .maybeSingle();
  if (!sourceRow) {
    return { src: opts.src, filename: null, beforeBytes: null, afterBytes: null, beforeDims: null, afterDims: null, newUrl: null, reused: false, error: 'Source asset not found in library' };
  }
  const source = sourceRow as {
    id: string;
    parent_asset_id: string | null;
    filename: string;
    storage_key: string;
    url: string;
    width: number | null;
    height: number | null;
    size_bytes: number | null;
    alt_text: string | null;
    tags: string[] | null;
    purposes: string[] | null;
  };

  const rootId = source.parent_asset_id ?? source.id;

  // Idempotency: if a variant already exists for this campaign +
  // root + the current target width, reuse it.
  const { data: existing } = await sb
    .from('dashboard_mkt_assets')
    .select('id, url, width, height, size_bytes, filename')
    .eq('parent_asset_id', rootId)
    .contains('tags', [opts.campaignTag])
    .eq('width', opts.targetWidth)
    .maybeSingle();
  if (existing) {
    const ex = existing as { id: string; url: string; width: number | null; height: number | null; size_bytes: number | null; filename: string };
    return {
      src: opts.src,
      filename: source.filename,
      beforeBytes: source.size_bytes,
      afterBytes: ex.size_bytes,
      beforeDims: source.width && source.height ? `${source.width}×${source.height}` : null,
      afterDims: ex.width && ex.height ? `${ex.width}×${ex.height}` : null,
      newUrl: ex.url,
      reused: true,
    };
  }

  // Fetch + process.
  let buffer: Buffer;
  try {
    const r = await fetch(opts.src);
    if (!r.ok) throw new Error('Source fetch failed: ' + r.status);
    buffer = Buffer.from(await r.arrayBuffer());
  } catch (err) {
    return {
      src: opts.src,
      filename: source.filename,
      beforeBytes: source.size_bytes,
      afterBytes: null,
      beforeDims: source.width && source.height ? `${source.width}×${source.height}` : null,
      afterDims: null,
      newUrl: null,
      reused: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let outBuf: Buffer;
  let outMeta: { width?: number; height?: number };
  try {
    const { data, info } = await sharp(buffer)
      .resize({ width: opts.targetWidth, withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    outBuf = data;
    outMeta = { width: info.width, height: info.height };
  } catch (err) {
    return {
      src: opts.src,
      filename: source.filename,
      beforeBytes: source.size_bytes,
      afterBytes: null,
      beforeDims: source.width && source.height ? `${source.width}×${source.height}` : null,
      afterDims: null,
      newUrl: null,
      reused: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Upload + insert.
  const baseName = source.filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60);
  const newFilename = `${baseName}-newsletter-${opts.targetWidth}w.jpg`;
  const storageKey = `${baseName}-newsletter-${opts.campaignId.slice(0, 8)}-${Date.now()}.jpg`;

  const { error: upErr } = await sb.storage.from(BUCKET).upload(storageKey, outBuf, {
    cacheControl: '31536000, immutable',
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (upErr) {
    return {
      src: opts.src,
      filename: source.filename,
      beforeBytes: source.size_bytes,
      afterBytes: null,
      beforeDims: source.width && source.height ? `${source.width}×${source.height}` : null,
      afterDims: null,
      newUrl: null,
      reused: false,
      error: 'Upload failed: ' + upErr.message,
    };
  }
  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storageKey);

  await sb.from('dashboard_mkt_assets').insert({
    kind: 'image',
    filename: newFilename,
    storage_key: storageKey,
    url: pub.publicUrl,
    mime_type: 'image/jpeg',
    size_bytes: outBuf.length,
    width: outMeta.width ?? null,
    height: outMeta.height ?? null,
    tags: [opts.campaignTag],
    alt_text: source.alt_text,
    purposes: ['global', 'newsletter'],
    parent_asset_id: rootId,
    variant_label: `Newsletter ${opts.targetWidth}w (campaign)`,
  });

  return {
    src: opts.src,
    filename: source.filename,
    beforeBytes: source.size_bytes,
    afterBytes: outBuf.length,
    beforeDims: source.width && source.height ? `${source.width}×${source.height}` : null,
    afterDims: outMeta.width && outMeta.height ? `${outMeta.width}×${outMeta.height}` : null,
    newUrl: pub.publicUrl,
    reused: false,
  };
}

/**
 * Walk the email design and surface every image src reference along
 * with a closure that knows how to mutate the design to swap that
 * src for a new URL. Image blocks, split cells (legacy + items), and
 * cell background images are all surfaced.
 */
function collectImageRefs(design: EmailDesign): ImageRef[] {
  const refs: ImageRef[] = [];
  for (let bi = 0; bi < design.blocks.length; bi++) {
    walkBlock(design.blocks[bi], `block[${bi}]`, refs);
  }
  return refs;
}

function walkBlock(block: EmailBlock, path: string, refs: ImageRef[]) {
  if (block.type === 'image' && typeof block.src === 'string') {
    refs.push({
      src: block.src,
      location: `${path}.image.src`,
      replace: (u) => { (block as { src: string }).src = u; },
    });
  }
  if (block.type === 'split') {
    const cells = block.cells as SplitCells | undefined;
    if (cells) {
      walkSplitCell(cells.left, `${path}.split.left`, refs);
      walkSplitCell(cells.right, `${path}.split.right`, refs);
    }
  }
}

function walkSplitCell(cell: SplitCell, path: string, refs: ImageRef[]) {
  if (cell.backgroundImage && typeof cell.backgroundImage.src === 'string') {
    refs.push({
      src: cell.backgroundImage.src,
      location: `${path}.backgroundImage.src`,
      replace: (u) => { cell.backgroundImage!.src = u; },
    });
  }
  // Legacy single-image-per-cell.
  if (cell.kind === 'image' && typeof cell.src === 'string') {
    refs.push({
      src: cell.src,
      location: `${path}.legacy.src`,
      replace: (u) => { cell.src = u; },
    });
  }
  // New per-cell items array.
  if (Array.isArray(cell.items)) {
    for (let i = 0; i < cell.items.length; i++) {
      const item = cell.items[i] as SplitItem;
      if (item.kind === 'image' && typeof item.src === 'string') {
        refs.push({
          src: item.src,
          location: `${path}.items[${i}].src`,
          replace: (u) => { (item as { src: string }).src = u; },
        });
      }
    }
  }
}
