/**
 * Evari.cc scraper used by the weekly brand-refresh cron.
 *
 * We don't try to fully regenerate the brief from raw HTML — the
 * editorial framing (positioning pillars, voice rules, outreach rules)
 * lives in content/brand/evari_brand_brief.json and is stable. What the
 * cron needs is the *volatile* bits: product pages, any new models,
 * pricing changes, recent blog/about copy. This helper pulls those,
 * and the cron merges them into the stored brief.
 */
import type { BrandBrief } from './types';

const EVARI_ROOT = 'https://evari.cc';

// Pages we consider canonical for brand + product facts.
const PAGES = [
  '/',
  '/pages/about',
  '/pages/story',
  '/pages/adventure',
  '/explore/classified-powershift-technology',
  '/collections/all-e-bikes',
  '/collections/frontpage',
];

interface FetchedPage {
  url: string;
  status: number;
  text: string;
}

async function fetchText(url: string): Promise<FetchedPage> {
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (EvariDashboardBrandRefresh; +https://evari.cc) AppleWebKit/537.36',
      accept: 'text/html,application/xhtml+xml',
    },
  });
  const text = res.ok ? await res.text() : '';
  return { url, status: res.status, text };
}

/**
 * Strip tags + scripts + styles. We don't need a full DOM parse — the
 * downstream consumer is an LLM re-reading natural text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ScrapeSummary {
  fetchedAt: string;
  ok: string[];
  failed: Array<{ url: string; status: number }>;
  /** Short plain-text corpus we can hand to the AI for re-summarisation. */
  corpus: string;
}

export async function scrapeEvari(): Promise<ScrapeSummary> {
  const ok: string[] = [];
  const failed: Array<{ url: string; status: number }> = [];
  const chunks: string[] = [];

  for (const p of PAGES) {
    const url = EVARI_ROOT + p;
    try {
      const page = await fetchText(url);
      if (page.status >= 200 && page.status < 300 && page.text) {
        ok.push(url);
        const clean = stripHtml(page.text).slice(0, 6000);
        chunks.push(`## ${url}\n${clean}`);
      } else {
        failed.push({ url, status: page.status });
      }
    } catch {
      failed.push({ url, status: 0 });
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    ok,
    failed,
    corpus: chunks.join('\n\n'),
  };
}

/**
 * Merge a fresh scrape into an existing brief. We intentionally keep the
 * editorial bits (voice, outreachRules, positioning.pillars, etc.) stable
 * — those are founder decisions, not scrape output. We only refresh
 * `updatedAt` + bump `version` so every AI call knows the grounding is
 * live. The LLM-summarised-from-corpus step is left to the cron itself.
 */
export function bumpBrief(current: BrandBrief, scrape: ScrapeSummary): BrandBrief {
  return {
    ...current,
    updatedAt: scrape.fetchedAt,
    version: (current.version ?? 1) + 1,
    sourceUrl: EVARI_ROOT,
  };
}
