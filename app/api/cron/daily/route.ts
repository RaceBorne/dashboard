import { NextResponse } from 'next/server';
import {
  ingestGA4Rollup,
  ingestGSCRollup,
  isGA4Connected,
  isGSCConnected,
} from '@/lib/integrations/google';
import { ingestPSISnapshots, isPSIConnected } from '@/lib/integrations/pagespeed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily cron — fires at 06:00 UTC (see vercel.json).
 *
 * Each step runs inside its own try/catch so one bad integration doesn't
 * break the others. Output shape is intentionally uniform — the Connections
 * page reads this so it can show the "last ran" + "last result" for each
 * data source.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const steps: Record<string, unknown> = {};

  // 1. GSC 28-day rollup (queries + pages).
  if (isGSCConnected()) {
    try {
      steps.gsc = await ingestGSCRollup({
        days: 28,
        maxQueries: 1000,
        maxPages: 500,
      });
    } catch (err) {
      steps.gsc = { ok: false, error: errMessage(err) };
    }
  } else {
    steps.gsc = { skipped: 'GSC not connected' };
  }

  // 2. GA4 30-day rollup (days + sources + pages + geo).
  if (isGA4Connected()) {
    try {
      steps.ga4 = await ingestGA4Rollup({ days: 30 });
    } catch (err) {
      steps.ga4 = { ok: false, error: errMessage(err) };
    }
  } else {
    steps.ga4 = { skipped: 'GA4 not connected' };
  }

  // 3. PSI snapshots for every target URL (mobile + desktop).
  if (isPSIConnected()) {
    try {
      steps.psi = await ingestPSISnapshots();
    } catch (err) {
      steps.psi = { ok: false, error: errMessage(err) };
    }
  } else {
    steps.psi = { skipped: 'PSI not connected' };
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    steps,
  });
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
