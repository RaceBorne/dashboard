import { NextResponse } from 'next/server';
import { deleteAsset, getAsset, updateAsset } from '@/lib/marketing/assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, asset });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  const patch: Parameters<typeof updateAsset>[1] = {};
  if ('altText' in body) patch.altText = body.altText as string | null;
  if ('tags' in body && Array.isArray(body.tags)) {
    patch.tags = (body.tags as unknown[]).filter((t): t is string => typeof t === 'string');
  }
  const asset = await updateAsset(id, patch);
  if (!asset) return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 });
  return NextResponse.json({ ok: true, asset });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deleteAsset(id);
  return NextResponse.json({ ok });
}
