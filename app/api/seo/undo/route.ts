import { NextResponse } from 'next/server';
import { getUndoLog, undoFix } from '@/lib/seo/fix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET  /api/seo/undo            -> list recent undoable changes (newest first)
 * POST /api/seo/undo            -> body: { undoId: string }
 */
export async function GET() {
  return NextResponse.json({ entries: getUndoLog() });
}

export async function POST(req: Request) {
  let body: { undoId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.undoId) {
    return NextResponse.json({ error: 'undoId is required' }, { status: 400 });
  }
  try {
    const result = await undoFix(body.undoId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
