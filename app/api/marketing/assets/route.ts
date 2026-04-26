import { NextResponse } from 'next/server';
import { listAssets, uploadAsset } from '@/lib/marketing/assets';
import type { AssetKind } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: AssetKind[] = ['image', 'gif', 'logo', 'video_thumb', 'other'];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kindRaw = url.searchParams.get('kind');
  const kind = kindRaw && KINDS.includes(kindRaw as AssetKind) ? (kindRaw as AssetKind) : undefined;
  const search = url.searchParams.get('search') ?? undefined;
  const tag = url.searchParams.get('tag') ?? undefined;
  const assets = await listAssets({ kind, search, tag });
  return NextResponse.json({ assets });
}

export async function POST(req: Request) {
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
  const filename = (file as File).name || 'asset';
  const tagsRaw = String(form.get('tags') ?? '').trim();
  const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const altText = (form.get('altText') as string | null) ?? null;
  const kindRaw = form.get('kind') as string | null;
  const kind = kindRaw && KINDS.includes(kindRaw as AssetKind) ? (kindRaw as AssetKind) : undefined;
  const asset = await uploadAsset({ file, filename, kind, tags, altText: altText ?? undefined });
  if (!asset) return NextResponse.json({ ok: false, error: 'Upload failed' }, { status: 500 });
  return NextResponse.json({ ok: true, asset });
}
