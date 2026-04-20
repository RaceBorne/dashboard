import { NextResponse } from 'next/server';
import { applyFix, suggestFix } from '@/lib/seo/fix';
import { applyFixesToCache, ensureScanHydrated, getCachedScan } from '@/lib/seo/scan';
import { recordFixEvent } from '@/lib/seo/history';
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
  await ensureScanHydrated();
  const url = new URL(req.url);
  const findingId = url.searchParams.get('findingId');
  if (!findingId) {
    return NextResponse.json({ error: 'findingId is required' }, { status: 400 });
  }
  const cached = getCachedScan();
  const finding = cached?.findings.find((f) => f.id === findingId);
  if (!finding) {
    // Use a distinct status code so the client can auto-heal (same pattern
    // as the POST 409 for scan-cache-lost). 409 "Conflict" is the right
    // signal: the cached server state doesn't reflect the finding the
    // client is asking about.
    return NextResponse.json(
      {
        error:
          'Finding not in current server scan — the cache was refreshed since the UI loaded. Rescan to sync.',
        code: 'scan-out-of-sync',
      },
      { status: 409 },
    );
  }
  try {
    // eslint-disable-next-line no-console
    console.log(
      `[seo/fix] GET suggest ${finding.check.id} on ${finding.entity.type} "${finding.entity.title}"`,
    );
    const suggestion = await suggestFix(finding);
    return NextResponse.json({ suggestion });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(
      `[seo/fix] GET suggest FAILED for ${finding.check.id} on "${finding.entity.title}":`,
      msg,
    );
    if (err instanceof Error && err.stack) {
      // eslint-disable-next-line no-console
      console.error(err.stack);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  await ensureScanHydrated();
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
      // eslint-disable-next-line no-console
      console.log(
        `[seo/fix] POST apply ${f.check.id} on ${f.entity.type} "${f.entity.title}" ` +
          `value=${value === undefined ? '(generate)' : JSON.stringify(String(value).slice(0, 60))}`,
      );
      const result = await applyFix(f, value !== undefined ? { value } : {});
      // eslint-disable-next-line no-console
      console.log(`[seo/fix] POST apply SUCCESS ${f.check.id} on "${f.entity.title}"`);
      applied.push({
        findingId: id,
        undoId: result.undoId,
        summary: result.summary,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(
        `[seo/fix] POST apply FAILED ${f.check.id} on "${f.entity.title}":`,
        msg,
      );
      if (err instanceof Error && err.stack) {
        // eslint-disable-next-line no-console
        console.error(err.stack);
      }
      errors.push({ findingId: id, error: msg });
    }
  }

  // Remove successfully-applied findings from the cached scan.
  const scan = applyFixesToCache(applied.map((a) => a.findingId));
  // Append a history row so the dashboard can chart fix velocity.
  // Fire-and-forget; history is never load-bearing on the response.
  if (scan && applied.length > 0) {
    void recordFixEvent(scan, applied.length);
  }
  return NextResponse.json({ applied, errors, scan });
}
