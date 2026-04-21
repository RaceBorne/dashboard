import { NextResponse } from 'next/server';
import { ingestGmailThreads, isGmailConnected } from '@/lib/integrations/gmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST (or GET) /api/integrations/google/gmail/ingest
 *
 * Pulls the last N days of Gmail threads into `dashboard_gmail_threads`.
 * Shares the Google OAuth refresh-token flow with GSC + GA4 — the token
 * must have been issued with `gmail.readonly` scope (see
 * scripts/google-oauth-refresh.ts).
 *
 * Optional query params:
 *   - days        (default 30, max 90)
 *   - maxThreads  (default 200, max 1000)
 *
 * Returns counts by category so the /connections page can show
 * "17 support · 4 outbound · 8 klaviyo-reply · 3 other" at a glance.
 */
async function run(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = clampInt(searchParams.get('days'), 30, 1, 90);
  const maxThreads = clampInt(searchParams.get('maxThreads'), 200, 10, 1000);

  if (!isGmailConnected()) {
    return NextResponse.json(
      {
        ok: false,
        connected: false,
        error:
          'Gmail not connected — set GMAIL_USER_EMAIL and regenerate GOOGLE_REFRESH_TOKEN with gmail.readonly scope (npx tsx scripts/google-oauth-refresh.ts).',
      },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  try {
    const result = await ingestGmailThreads({ days, maxThreads });
    return NextResponse.json({
      ok: true,
      connected: true,
      ...result,
      wallDurationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        connected: true,
        durationMs: Date.now() - startedAt,
        error: msg,
      },
      { status: 500 },
    );
  }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export const GET = run;
export const POST = run;
