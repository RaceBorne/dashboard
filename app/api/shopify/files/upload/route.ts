import { NextResponse } from 'next/server';

import { uploadFileToShopify } from '@/lib/integrations/shopify';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * POST /api/shopify/files/upload
 *
 * multipart/form-data with a single "file" field. Runs the full
 * stagedUploadsCreate → GCS POST → fileCreate flow. Returns the
 * projected ShopifyFile so the Journals media-library drawer can
 * drop it straight into the grid.
 *
 * Videos typically land in `fileStatus: 'PROCESSING'` until Shopify
 * finishes transcoding — the drawer polls listFiles() until READY.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'Missing "file" field' },
        { status: 400 },
      );
    }
    const altText = form.get('alt');
    const bytes = await file.arrayBuffer();
    const res = await uploadFileToShopify({
      filename: file.name || 'upload',
      mimeType: file.type || 'application/octet-stream',
      bytes,
      altText: typeof altText === 'string' ? altText : undefined,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, file: res.file });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'upload failed' },
      { status: 500 },
    );
  }
}
