import { NextResponse } from 'next/server';
import { applyFix, suggestFix } from '@/lib/seo/fix';
import { applyFixesToCache, getCachedScan } from '@/lib/seo/scan';
import type { ScanFinding } from '@/lib/seo/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/seo/fix
 *
 * Body: { findingIds: string[], values?: Record<findingId, string> }
 *
 * Applies one or more fixes. Safe-auto checks just need the id; review
 * checks need the user-approved value passed in `values`.
 *
 * Returns { applied, errors, scan } where `scan` is the updated scan
 * with the fixed findings removed.
 *
 * GET /api/seo/fix?findingId=...
 *   Returns a suggested fix value (does NOT apply). Used by the review
 *   UI to populate the editor before the user approves.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const findingId = url.searchParams.get('findingId');
  if (!findingId) {
    return NextResponse.json({ error: 'findingId is required' }, { status: 400 });
  }
  const cached = getCachedScan();
  const finding = cached?.findings.find((f) => f.id === findingId);
  if (!finding) {
    return NextResponse.json(
      { error: 'Finding not found in current scan' },
      { status: 404 },
    );
  }
  try {
    const suggestion = await suggestFix(finding);
    return NextResponse.json({ suggestion });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  let body: { findingIds?: string[]; values?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const ids = Array.isArray(body.findingIds) ? body.findingIds : [];
  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'findingIds[] is required' },
      { status: 400 },
    );
  }
  const cached = getCachedScan();
  if (!cached) {
    return NextResponse.json(
      { error: 'No scan in cache. Run a scan first.' },
      { status: 409 },
    );
  }
  const findingsById = new Map<string, ScanFinding>();
  cached.findings.forEach((f) => findingsById.set(f.id, f));

  const applied: Array<{ findingId: string; undoId: string; summary: string }> = [];
  const errors: Array<{ findingId: string; error: string }> = [];

  for (const id of ids) {
    const f = findingsById.get(id);
    if (!f) {
      errors.push({ findingId: id, error: 'Finding not in current scan' });
      continue;
    }
    try {
      const value = body.values?.[id];
      const result = await applyFix(f, value !== undefined ? { value } : {});
      applied.push({
        findingId: id,
        undoId: result.undoId,
        summary: result.summary,
      });
    } catch (err) {
      errors.push({
        findingId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Remove successfully-applied findings from the cached scan.
  const scan = applyFixesToCache(applied.map((a) => a.findingId));
  return NextResponse.json({ applied, errors, scan });
}
