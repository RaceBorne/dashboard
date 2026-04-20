/**
 * PageSpeed Insights adapter.
 *
 * The PSI API works without an API key for low-volume use. Set PAGESPEED_API_KEY
 * for higher rate limits.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export interface PSIResult {
  url: string;
  strategy: 'mobile' | 'desktop';
  /** 0-1 (matches PSI's own scale; multiply by 100 for display). */
  performanceScore: number;
  lcpSec: number;
  clsScore: number;
  inpMs: number;
  fcpSec: number;
  ttfbSec: number;
  siSec: number;
  tbtMs: number;
  fetchedAt: string;
}

export interface PSITarget {
  url: string;
  label: string | null;
  priority: number;
}

export function isPSIConnected(): boolean {
  return Boolean(process.env.PAGESPEED_API_KEY);
}

export async function runPSI(
  url: string,
  strategy: 'mobile' | 'desktop' = 'mobile',
): Promise<PSIResult> {
  const params = new URLSearchParams({ url, strategy, category: 'performance' });
  if (process.env.PAGESPEED_API_KEY) params.set('key', process.env.PAGESPEED_API_KEY);

  const res = await fetch(`${PSI_ENDPOINT}?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>');
    throw new Error(`PSI failed for ${url} (${strategy}): ${res.status} ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    lighthouseResult?: {
      categories?: { performance?: { score?: number } };
      audits?: Record<string, { numericValue?: number }>;
    };
  };

  const score = json.lighthouseResult?.categories?.performance?.score ?? 0;
  const audits = json.lighthouseResult?.audits ?? {};
  return {
    url,
    strategy,
    performanceScore: score,
    lcpSec: (audits['largest-contentful-paint']?.numericValue ?? 0) / 1000,
    clsScore: audits['cumulative-layout-shift']?.numericValue ?? 0,
    inpMs: audits['interaction-to-next-paint']?.numericValue ?? 0,
    fcpSec: (audits['first-contentful-paint']?.numericValue ?? 0) / 1000,
    ttfbSec: (audits['server-response-time']?.numericValue ?? 0) / 1000,
    siSec: (audits['speed-index']?.numericValue ?? 0) / 1000,
    tbtMs: audits['total-blocking-time']?.numericValue ?? 0,
    fetchedAt: new Date().toISOString(),
  };
}

/** Load the list of URLs the cron should audit. */
export async function listPSITargets(): Promise<PSITarget[]> {
  const supa = createSupabaseAdmin();
  if (!supa) return [];
  const { data, error } = await supa
    .from('dashboard_psi_targets')
    .select('url, label, priority')
    .order('priority', { ascending: true });
  if (error || !data?.length) return [];
  return data as PSITarget[];
}

export interface PSIIngestResult {
  ranAt: string;
  windowDay: string;
  strategies: Array<'mobile' | 'desktop'>;
  targets: Array<{ url: string; label: string | null }>;
  results: Array<{
    url: string;
    strategy: 'mobile' | 'desktop';
    ok: boolean;
    score?: number;
    error?: string;
  }>;
  fetched: number;
  written: number;
  failed: number;
}

/**
 * Run PSI against every target URL × every strategy and upsert today's row
 * into `dashboard_psi_snapshots`. Idempotent — running twice in a day simply
 * overwrites today's row with the fresher numbers.
 *
 * Failures on individual URLs are collected but don't abort the batch.
 */
export async function ingestPSISnapshots(
  opts: {
    strategies?: Array<'mobile' | 'desktop'>;
    targets?: string[];
  } = {},
): Promise<PSIIngestResult> {
  const strategies = opts.strategies ?? ['mobile', 'desktop'];
  const allTargets = await listPSITargets();
  const filtered = opts.targets?.length
    ? allTargets.filter((t) => opts.targets!.includes(t.url))
    : allTargets;

  const supa = createSupabaseAdmin();
  if (!supa) {
    throw new Error(
      'Supabase admin client unavailable — set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL',
    );
  }

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const results: PSIIngestResult['results'] = [];
  let written = 0;
  let failed = 0;

  // Sequential to avoid triggering PSI rate limits.
  for (const target of filtered) {
    for (const strategy of strategies) {
      try {
        const r = await runPSI(target.url, strategy);
        const row = {
          url: r.url,
          strategy: r.strategy,
          snapshot_date: snapshotDate,
          performance_score: r.performanceScore,
          lcp_sec: r.lcpSec,
          cls_score: r.clsScore,
          inp_ms: r.inpMs,
          fcp_sec: r.fcpSec,
          ttfb_sec: r.ttfbSec,
          si_sec: r.siSec,
          tbt_ms: r.tbtMs,
          fetched_at: r.fetchedAt,
        };
        const up = await supa
          .from('dashboard_psi_snapshots')
          .upsert(row, { onConflict: 'url,strategy,snapshot_date' });
        if (up.error) throw new Error(`Upsert failed: ${up.error.message}`);
        written += 1;
        results.push({
          url: target.url,
          strategy,
          ok: true,
          score: Math.round(r.performanceScore * 100),
        });
      } catch (err) {
        failed += 1;
        results.push({
          url: target.url,
          strategy,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    ranAt: new Date().toISOString(),
    windowDay: snapshotDate,
    strategies,
    targets: filtered.map((t) => ({ url: t.url, label: t.label })),
    results,
    fetched: filtered.length * strategies.length,
    written,
    failed,
  };
}
