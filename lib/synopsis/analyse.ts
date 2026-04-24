/**
 * lib/synopsis/analyse.ts
 *
 * Rules-based analysis of the pages overview + GSC rollup that produces
 * two artefacts the /synopsis page renders:
 *
 *   1. summary: string[]   — the top 5-8 bullet reasons the site is
 *                             underperforming right now. Generated from
 *                             counts (e.g. "21 product pages have no
 *                             <title> tag — Google is falling back to
 *                             the URL in SERPs").
 *
 *   2. issues: SynopsisIssue[] — one row per individual fix, sorted by
 *                                 severity. Each row either carries an
 *                                 auto-fix kind (meta-title / meta-desc)
 *                                 or a manual guide string.
 *
 * Purely deterministic — no LLM calls here. Keeps the page fast to
 * render and gives us something shippable without a second AI dependency.
 * The AI lives downstream in the /api/synopsis/fix endpoint, which
 * generates meta titles + descriptions on demand when the operator hits
 * the Fix button.
 */

import type { PageOverviewRow } from '@/lib/pages/overview';

export type SynopsisSeverity = 'critical' | 'warning' | 'info';

export type SynopsisFixKind = 'meta-title' | 'meta-desc' | 'manual';

export interface SynopsisIssue {
  /** Stable key per row — used as React key + as the id the Fix endpoint acts on. */
  id: string;
  title: string;
  /** One sentence explaining why this matters. */
  description: string;
  severity: SynopsisSeverity;
  /** meta-title / meta-desc = auto-fixable; manual = show advice only. */
  kind: SynopsisFixKind;
  /** When present, the Fix button POSTs with { pageId }. */
  pageId?: string;
  /** Used to render the row's page chip. */
  pagePath?: string;
  pageTitle?: string;
  pageType?: 'product' | 'page' | 'article';
  /** Used for manual issues — shown as the how-to-fix guidance. */
  manualGuide?: string;
}

export interface Synopsis {
  generatedAt: string;
  /** Top bullet summary. */
  summary: string[];
  issues: SynopsisIssue[];
  /** One-line headline counts for the page header. */
  totals: {
    pages: number;
    missingMetaTitle: number;
    missingMetaDesc: number;
    pagesWithIssues: number;
    criticalFindings: number;
  };
}

export function analyseSynopsis(rows: PageOverviewRow[]): Synopsis {
  const missingTitle = rows.filter((r) => !r.metaTitle || r.metaTitleLen === 0);
  const missingDesc = rows.filter(
    (r) => !r.metaDescription || r.metaDescriptionLen === 0,
  );
  const withIssues = rows.filter((r) => r.totalIssues > 0);
  const criticalFindings = rows.reduce(
    (n, r) => n + r.findings.filter((f) => f.check.severity === 'A').length,
    0,
  );

  // Pages with GSC impressions but zero clicks = good exposure, poor
  // SERP snippet. High-signal candidates for meta description rewrites.
  const highImpLowClick = rows.filter(
    (r) =>
      r.gsc?.impressions28d != null &&
      r.gsc.impressions28d >= 50 &&
      (r.gsc.clicks28d ?? 0) === 0,
  );

  // Pages indexed + ranking somewhere (avg pos < 20) but with no meta
  // description. These are the fastest wins: Google already sees them,
  // we just haven't given it a snippet to show.
  const rankingButNoDesc = rows.filter(
    (r) =>
      (!r.metaDescription || r.metaDescriptionLen === 0) &&
      r.gsc?.avgPosition28d != null &&
      r.gsc.avgPosition28d < 20 &&
      (r.gsc.impressions28d ?? 0) > 0,
  );

  const summary: string[] = [];
  if (missingTitle.length > 0) {
    summary.push(
      String(missingTitle.length) +
        ' page' +
        (missingTitle.length === 1 ? ' has' : 's have') +
        ' no meta title set. Google falls back to the URL in search results, so clicks suffer.',
    );
  }
  if (missingDesc.length > 0) {
    summary.push(
      String(missingDesc.length) +
        ' page' +
        (missingDesc.length === 1 ? ' has' : 's have') +
        ' no meta description. Google synthesises a snippet from page text, which is usually weaker than a handwritten one.',
    );
  }
  if (highImpLowClick.length > 0) {
    summary.push(
      String(highImpLowClick.length) +
        ' page' +
        (highImpLowClick.length === 1 ? ' is' : 's are') +
        ' getting impressions but zero clicks. The SERP snippet is not compelling enough to earn the click.',
    );
  }
  if (rankingButNoDesc.length > 0) {
    summary.push(
      String(rankingButNoDesc.length) +
        ' page' +
        (rankingButNoDesc.length === 1 ? ' is' : 's are') +
        ' ranking in the top 20 with no meta description. Easy wins: add a snippet, click-through should lift.',
    );
  }
  if (criticalFindings > 0) {
    summary.push(
      String(criticalFindings) +
        ' critical SEO finding' +
        (criticalFindings === 1 ? '' : 's') +
        ' from the last scan. See the fix list below for the specifics.',
    );
  }
  if (summary.length === 0) {
    summary.push('Everything looks clean on this scan. No blocking issues detected.');
  }

  const issues: SynopsisIssue[] = [];

  // Auto-fix: missing meta titles.
  for (const r of missingTitle) {
    issues.push({
      id: 'title:' + r.id,
      title: 'Missing meta title',
      description:
        'No <title> tag is set on ' +
        (r.title || r.path) +
        '. Google will fall back to the URL, hurting CTR.',
      severity: 'critical',
      kind: 'meta-title',
      pageId: r.id,
      pagePath: r.path,
      pageTitle: r.title,
      pageType: r.type === 'product' ? 'product' : r.type === 'page' ? 'page' : 'article',
    });
  }

  // Auto-fix: missing meta descriptions.
  for (const r of missingDesc) {
    issues.push({
      id: 'desc:' + r.id,
      title: 'Missing meta description',
      description:
        'No description set for ' +
        (r.title || r.path) +
        '. Google synthesises a snippet from page text; a handwritten one almost always out-clicks it.',
      severity: 'warning',
      kind: 'meta-desc',
      pageId: r.id,
      pagePath: r.path,
      pageTitle: r.title,
      pageType: r.type === 'product' ? 'product' : r.type === 'page' ? 'page' : 'article',
    });
  }

  // Manual: scan findings. Cap at 20 so the page doesn't become a wall.
  const seenFindingKeys = new Set<string>();
  for (const r of rows) {
    for (const f of r.findings) {
      if (issues.length > 200) break;
      const key = f.id;
      if (seenFindingKeys.has(key)) continue;
      seenFindingKeys.add(key);
      // A = critical blocker, B = warning, C = info/cleanup.
      // Skip C — those are not underperformance issues.
      if (f.check.severity === 'C') continue;
      issues.push({
        id: 'finding:' + f.id,
        title: f.check.title,
        description: f.detail || f.check.description,
        severity: f.check.severity === 'A' ? 'critical' : 'warning',
        kind: 'manual',
        pageId: r.id,
        pagePath: r.path,
        pageTitle: r.title,
        pageType: r.type === 'product' ? 'product' : r.type === 'page' ? 'page' : 'article',
        manualGuide: f.check.description,
      });
    }
  }

  // Sort: auto-fix criticals first, then auto-fix warnings, then manual.
  issues.sort((a, b) => {
    const sev: Record<SynopsisSeverity, number> = { critical: 0, warning: 1, info: 2 };
    const kindRank = (k: SynopsisFixKind): number =>
      k === 'manual' ? 1 : 0;
    return (
      kindRank(a.kind) - kindRank(b.kind) ||
      sev[a.severity] - sev[b.severity] ||
      a.title.localeCompare(b.title)
    );
  });

  return {
    generatedAt: new Date().toISOString(),
    summary,
    issues,
    totals: {
      pages: rows.length,
      missingMetaTitle: missingTitle.length,
      missingMetaDesc: missingDesc.length,
      pagesWithIssues: withIssues.length,
      criticalFindings,
    },
  };
}
