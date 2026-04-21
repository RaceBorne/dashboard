import { NextResponse } from 'next/server';
import {
  ingestGA4Rollup,
  ingestGSCRollup,
  isGA4Connected,
  isGSCConnected,
} from '@/lib/integrations/google';
import { ingestGmailThreads, isGmailConnected } from '@/lib/integrations/gmail';
import { ingestPSISnapshots, isPSIConnected } from '@/lib/integrations/pagespeed';
import { generateAndPersistBriefing } from '@/lib/dashboard/briefing';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

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

  // 4. Gmail thread summaries — last 30d of customer + outbound + klaviyo-reply
  // threads. Feeds the briefing + strategy chat context.
  if (isGmailConnected()) {
    try {
      steps.gmail = await ingestGmailThreads({ days: 30, maxThreads: 200 });
    } catch (err) {
      steps.gmail = { ok: false, error: errMessage(err) };
    }
  } else {
    steps.gmail = { skipped: 'Gmail not connected' };
  }

  // 5. Morning briefing — runs AFTER the ingests above so the briefing sees
  // today's fresh numbers. Failure is non-fatal — we still return success for
  // the ingest steps, just flag the briefing as failed.
  try {
    const brief = await generateAndPersistBriefing(createSupabaseAdmin(), {
      source: 'cron',
    });
    steps.briefing = {
      date: brief.date,
      mock: brief.mock,
      markdownBytes: brief.markdown.length,
    };
  } catch (err) {
    steps.briefing = { ok: false, error: errMessage(err) };
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
