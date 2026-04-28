import { NextResponse } from 'next/server';
import { getHomeCanvas, saveHomeCanvas, type HomeCanvasState } from '@/lib/home/canvasPrefs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  const state = await getHomeCanvas();
  return NextResponse.json({ ok: true, state });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as HomeCanvasState | null;
  if (!body || !Array.isArray(body.tiles) || !body.prefs) {
    return NextResponse.json({ ok: false, error: 'Invalid state' }, { status: 400 });
  }
  await saveHomeCanvas(body);
  return NextResponse.json({ ok: true });
}
