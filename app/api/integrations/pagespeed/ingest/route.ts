import { NextResponse } from 'next/server';
import { ingestPSISnapshots } from '@/lib/integrations/pagespeed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST (or GET) /api/integrations/pagespeed/ingest
 *
 * Audits every URL in `dashboard_psi_targets` across both strategies
 * (mobile + desktop) and upserts today's snapshot row. Intended to be
 * called nightly by Vercel Cron; safe to invoke manually for ad-hoc runs.
 *
 * Query params (both optional):
 *   - strategy: 'mobile' | 'desktop' (omit for both)
 *   - url: a single URL to audit (must already exist in dashboard_psi_targets)
 */
async function run(req: Request) {
  const { searchParams } = new URL(req.url);
  const strategyRaw = searchParams.get('strategy');
  const strategies =
    strategyRaw === 'mobile'
      ? (['mobile'] as const)
      : strategyRaw === 'desktop'
        ? (['desktop'] as const)
        : (['mobile', 'desktop'] as const);
  const urlOne = searchParams.get('url');

  const startedAt = Date.now();
  try {
    const result = await ingestPSISnapshots({
      strategies: [...strategies],
      targets: urlOne ? [urlOne] : undefined,
    });
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, durationMs: Date.now() - startedAt, error: msg },
      { status: 500 },
    );
  }
}

export const GET = run;
export const POST = run;
