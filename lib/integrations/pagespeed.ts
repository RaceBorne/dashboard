/**
 * PageSpeed Insights adapter.
 *
 * The PSI API works without an API key for low-volume use. Set PAGESPEED_API_KEY
 * for higher rate limits.
 */

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export interface PSIResult {
  url: string;
  strategy: 'mobile' | 'desktop';
  performanceScore: number; // 0-1
  lcpSec: number;
  clsScore: number;
  inpMs: number;
  fcpSec: number;
  fetchedAt: string;
}

export async function runPSI(url: string, strategy: 'mobile' | 'desktop' = 'mobile'): Promise<PSIResult> {
  const params = new URLSearchParams({ url, strategy, category: 'performance' });
  if (process.env.PAGESPEED_API_KEY) params.set('key', process.env.PAGESPEED_API_KEY);

  const res = await fetch(`${PSI_ENDPOINT}?${params.toString()}`);
  if (!res.ok) throw new Error(`PSI failed: ${res.status}`);
  const json = (await res.json()) as {
    lighthouseResult?: {
      categories?: { performance?: { score?: number } };
      audits?: Record<string, { numericValue?: number }>;
    };
  };

  const scores = json.lighthouseResult?.categories?.performance?.score ?? 0;
  const audits = json.lighthouseResult?.audits ?? {};
  return {
    url,
    strategy,
    performanceScore: scores,
    lcpSec: (audits['largest-contentful-paint']?.numericValue ?? 0) / 1000,
    clsScore: audits['cumulative-layout-shift']?.numericValue ?? 0,
    inpMs: audits['interaction-to-next-paint']?.numericValue ?? 0,
    fcpSec: (audits['first-contentful-paint']?.numericValue ?? 0) / 1000,
    fetchedAt: new Date().toISOString(),
  };
}
