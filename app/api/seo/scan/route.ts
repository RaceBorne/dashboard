import { NextResponse } from 'next/server';
import {
  ensureScanHydrated,
  getCachedScan,
  runScan,
  shopifyConnected,
  scanAgeMs,
} from '@/lib/seo/scan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Long-running scan: bump the function timeout. Vercel Pro defaults to
// 60s; the scan typically finishes in 5–20s on a small catalogue.
export const maxDuration = 90;

/**
 * GET /api/seo/scan
 *   Returns the cached scan if present, otherwise runs a fresh one.
 *   Add ?fresh=1 to force a re-run.
 *
 * POST /api/seo/scan
 *   Always runs a fresh scan and returns the results.
 */
export async function GET(req: Request) {
  await ensureScanHydrated();
  const url = new URL(req.url);
  const fresh = url.searchParams.get('fresh');
  if (!fresh) {
    const cached = getCachedScan();
    if (cached) {
      return NextResponse.json({
        ...cached,
        mock: !shopifyConnected(),
        ageMs: scanAgeMs(),
      });
    }
  }
  return runAndRespond();
}

export async function POST() {
  await ensureScanHydrated();
  return runAndRespond();
}

async function runAndRespond() {
  try {
    const result = await runScan();
    return NextResponse.json({
      ...result,
      mock: !shopifyConnected(),
      ageMs: 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
