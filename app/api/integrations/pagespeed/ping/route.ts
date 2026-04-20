import { NextResponse } from 'next/server';
import { runPSI } from '@/lib/integrations/pagespeed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/integrations/pagespeed/ping?url=https://evari.cc&strategy=mobile
 *
 * Cheap health-check for the PSI integration. Runs one live PSI scan and
 * returns the score + Core Web Vitals so we can prove the key is wired
 * without building a whole UI around it yet.
 *
 * `url` defaults to https://evari.cc; `strategy` defaults to mobile.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('url') ?? 'https://evari.cc';
  const strategyRaw = searchParams.get('strategy') ?? 'mobile';
  const strategy: 'mobile' | 'desktop' =
    strategyRaw === 'desktop' ? 'desktop' : 'mobile';

  const keySet = Boolean(process.env.PAGESPEED_API_KEY);
  const startedAt = Date.now();

  try {
    const result = await runPSI(target, strategy);
    return NextResponse.json({
      ok: true,
      keySet,
      durationMs: Date.now() - startedAt,
      url: result.url,
      strategy: result.strategy,
      performanceScore: Math.round(result.performanceScore * 100),
      lcpSec: Number(result.lcpSec.toFixed(2)),
      clsScore: Number(result.clsScore.toFixed(3)),
      inpMs: result.inpMs,
      fcpSec: Number(result.fcpSec.toFixed(2)),
      grade:
        result.performanceScore >= 0.9
          ? 'good'
          : result.performanceScore >= 0.5
            ? 'needs-improvement'
            : 'poor',
      fetchedAt: result.fetchedAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        keySet,
        durationMs: Date.now() - startedAt,
        url: target,
        strategy,
        error: msg,
      },
      { status: 500 },
    );
  }
}
