/**
 * lib/synopsis/analyse.ts
 *
 * Deterministic analyser that aggregates every signal we already
 * collect (pages, keywords, backlinks, traffic, performance) into:
 *
 *   1. summary          — 5-8 bullet reasons the site is underperforming
 *   2. issues           — auto-fixable or manual one-off fixes
 *   3. enhancements     — broader improvements (keyword tracking,
 *                          meta rewrites, internal links, blog topics)
 *   4. totals           — headline counts the narrative prompt can
 *                          reason over
 *   5. context          — the raw slice the narrative prompt needs so
 *                          it can be specific ("backlinks 14 vs. peer
 *                          median 340", not "backlinks low")
 *
 * The AI narrative that sits above this in the UI is generated
 * separately via /api/synopsis/narrative so we don't pay the model tax
 * on every page render.
 */

import type { PageOverviewRow } from '@/lib/pages/overview';
import type { KeywordWorkspace } from '@/lib/keywords/workspace';
import type { BacklinksOverview } from '@/lib/backlinks/repository';
import type { TrafficSnapshot } from '@/lib/traffic/repository';
import type { PerformanceOverview } from '@/lib/performance/repository';

export type SynopsisSeverity = 'critical' | 'warning' | 'info';

export type SynopsisFixKind = 'meta-title' | 'meta-desc' | 'manual';

export interface SynopsisIssue {
  id: string;
  title: string;
  description: string;
  severity: SynopsisSeverity;
  kind: SynopsisFixKind;
  pageId?: string;
  pagePath?: string;
  pageTitle?: string;
  pageType?: 'product' | 'page' | 'article';
  manualGuide?: string;
}

export type SynopsisEnhanceKind =
  | 'keywords-research'
  | 'meta-rewrite'
  | 'internal-links'
  | 'blog-topics'
  | 'seo-cleanup-item'
  | 'mobile-rebuild-item'
  | 'performance-audit-item';

export type SynopsisTaskCategory = 'seo' | 'shopify' | 'content' | 'other';
export type SynopsisTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface SynopsisTaskDefaults {
  title: string;
  description: string;
  category: SynopsisTaskCategory;
  priority: SynopsisTaskPriority;
}

export interface SynopsisEnhancement {
  /** Stable key per row. */
  id: string;
  /** The kind drives which modal opens when the row's CTA is clicked. */
  kind: SynopsisEnhanceKind | 'group';
  title: string;
  /** One paragraph explaining what this enhancement does + why it matters. */
  description: string;
  /** Short action label for the button. */
  cta: string;
  /** Rough lift estimate, shown as a chip. Keep to one word. */
  impact: 'high' | 'medium' | 'low';
  /** Numeric hint the row can display (e.g. "14 pages"). */
  subject?: string;
  /**
   * True = clicking the CTA opens a modal / executes work.  False = the
   * row is reference-only; only the Add-to-todo button is useful.
   */
  executable: boolean;
  /**
   * Sensible defaults when the operator hits 'Add to todo' on this row.
   * Always present so the UI can hand a clean payload to /api/tasks.
   */
  taskDefaults: SynopsisTaskDefaults;
  /**
   * When populated, this row is a group header. Children render as
   * indented sub-rows when expanded. A group row can still be added
   * to the todo list as a single parent task.
   */
  children?: SynopsisEnhancement[];
}

export interface SynopsisContext {
  /** Counts fed straight into the narrative prompt. */
  pages: {
    total: number;
    missingTitle: number;
    missingDesc: number;
    weakTitle: number; // < 30 chars or > 65 chars
    weakDesc: number; // < 80 chars or > 165 chars
    criticalFindings: number;
    highImpLowClick: number;
    rankingButNoDesc: number;
  };
  keywords: {
    connected: boolean;
    ownCount: number;
    competitorListCount: number;
    totalTrackedKeywords: number;
    inTop3: number;
    inTop10: number;
    ranking11to20: number;
    notRanking: number;
    avgPosition: number | null;
  };
  backlinks: {
    connected: boolean;
    ownReferringDomains: number | null;
    peerMedianReferringDomains: number | null;
    gap: number | null; // ownReferringDomains - peerMedianReferringDomains
  };
  traffic: {
    connected: boolean;
    sessions28d: number | null;
    sessionsDelta: number | null; // 0-1 vs previous
    bounceRate: number | null;
    topChannel: string | null;
  };
  performance: {
    connected: boolean;
    avgPerformanceScore: number | null; // 0-100
    mobileLcpSec: number | null;
    mobileInpMs: number | null;
  };
}

export interface Synopsis {
  generatedAt: string;
  summary: string[];
  issues: SynopsisIssue[];
  enhancements: SynopsisEnhancement[];
  totals: {
    pages: number;
    missingMetaTitle: number;
    missingMetaDesc: number;
    pagesWithIssues: number;
    criticalFindings: number;
  };
  context: SynopsisContext;
}

export interface AnalyseInputs {
  rows: PageOverviewRow[];
  keywords: KeywordWorkspace | null;
  backlinks: BacklinksOverview | null;
  traffic: TrafficSnapshot | null;
  performance: PerformanceOverview | null;
}

// Thresholds for "weak" meta copy. If something falls outside these it
// gets picked up by the meta-rewrite enhancement.
const TITLE_MIN = 30;
const TITLE_MAX = 65;
const DESC_MIN = 80;
const DESC_MAX = 165;

export function analyseSynopsis({
  rows,
  keywords,
  backlinks,
  traffic,
  performance,
}: AnalyseInputs): Synopsis {
  // -------- Pages --------
  const missingTitle = rows.filter((r) => !r.metaTitle || r.metaTitleLen === 0);
  const missingDesc = rows.filter(
    (r) => !r.metaDescription || r.metaDescriptionLen === 0,
  );
  const weakTitle = rows.filter((r) => {
    if (!r.metaTitle) return false; // missingTitle already covers nulls
    return r.metaTitleLen < TITLE_MIN || r.metaTitleLen > TITLE_MAX;
  });
  const weakDesc = rows.filter((r) => {
    if (!r.metaDescription) return false;
    return r.metaDescriptionLen < DESC_MIN || r.metaDescriptionLen > DESC_MAX;
  });
  const withIssues = rows.filter((r) => r.totalIssues > 0);
  const criticalFindings = rows.reduce(
    (n, r) => n + r.findings.filter((f) => f.check.severity === 'A').length,
    0,
  );
  const highImpLowClick = rows.filter(
    (r) =>
      r.gsc?.impressions28d != null &&
      r.gsc.impressions28d >= 50 &&
      (r.gsc.clicks28d ?? 0) === 0,
  );
  const rankingButNoDesc = rows.filter(
    (r) =>
      (!r.metaDescription || r.metaDescriptionLen === 0) &&
      r.gsc?.avgPosition28d != null &&
      r.gsc.avgPosition28d < 20 &&
      (r.gsc.impressions28d ?? 0) > 0,
  );

  // -------- Keywords --------
  const ownList = keywords?.lists.find((l) => l.kind === 'own') ?? null;
  const competitorLists = keywords?.lists.filter((l) => l.kind === 'competitor') ?? [];
  const ownMembers = ownList ? keywords?.membersByList[ownList.id] ?? [] : [];
  const kwConnected = keywords?.connected ?? false;
  const kwRanks = ownMembers.map((m) => m.ourPosition).filter((n): n is number => typeof n === 'number');
  const kwTop3 = kwRanks.filter((p) => p <= 3).length;
  const kwTop10 = kwRanks.filter((p) => p <= 10).length;
  const kw1120 = kwRanks.filter((p) => p > 10 && p <= 20).length;
  const kwNotRank = ownMembers.length - kwRanks.length;
  const kwAvgPos = kwRanks.length > 0 ? kwRanks.reduce((n, p) => n + p, 0) / kwRanks.length : null;

  // -------- Backlinks --------
  const blConnected = Boolean(backlinks && backlinks.summaries.length > 0);
  const ownBl =
    backlinks?.summaries.find((s) => s.target.includes('evari')) ?? null;
  const peerRd = (backlinks?.summaries ?? [])
    .filter((s) => !s.target.includes('evari'))
    .map((s) => s.referringMainDomains)
    .sort((a, b) => a - b);
  const peerMedian =
    peerRd.length > 0 ? peerRd[Math.floor(peerRd.length / 2)] : null;
  const ownRd = ownBl?.referringMainDomains ?? null;
  const blGap =
    ownRd != null && peerMedian != null ? ownRd - peerMedian : null;

  // -------- Traffic --------
  const trafficConnected = Boolean(traffic && traffic.connected && traffic.hasData);
  // GA4 doesn't give us a bounce-rate tile in the current snapshot shape — we
  // derive a rough one from the daily trend if available.
  const sessionsTile = traffic?.kpi?.sessions ?? null;
  const bounceFromTrend =
    traffic && traffic.trend365.length > 0
      ? avgOrNull(traffic.trend365.slice(-28).map((d) => d.bounceRate))
      : null;
  const topChannel =
    (traffic?.channels ?? []).slice().sort((a, b) => b.sessions - a.sessions)[0]?.channel ?? null;

  // -------- Performance --------
  const perfConnected = Boolean(performance && performance.latest?.length);
  const mobileLatest = (performance?.latest ?? []).filter((s) => s.strategy === 'mobile');
  const avgPerfScore =
    mobileLatest.length > 0
      ? mobileLatest.reduce((n, s) => n + s.performanceScore, 0) / mobileLatest.length
      : null;
  const medianLcp =
    mobileLatest.length > 0
      ? median(mobileLatest.map((s) => s.lcpSec))
      : null;
  const medianInp =
    mobileLatest.length > 0
      ? median(mobileLatest.map((s) => s.inpMs))
      : null;

  // -------- Summary bullets --------
  const summary: string[] = [];
  if (missingTitle.length > 0) {
    summary.push(
      pluralize(missingTitle.length, 'page has', 'pages have') +
        ' no meta title set. Google falls back to the URL in search results, so clicks suffer.',
    );
  }
  if (missingDesc.length > 0) {
    summary.push(
      pluralize(missingDesc.length, 'page has', 'pages have') +
        ' no meta description. Google synthesises a snippet from page text, which is usually weaker than a handwritten one.',
    );
  }
  if (highImpLowClick.length > 0) {
    summary.push(
      pluralize(highImpLowClick.length, 'page is', 'pages are') +
        ' getting impressions but zero clicks. The SERP snippet is not compelling enough to earn the click.',
    );
  }
  if (rankingButNoDesc.length > 0) {
    summary.push(
      pluralize(rankingButNoDesc.length, 'page is', 'pages are') +
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
  if (kwConnected && kwNotRank > 0 && ownMembers.length > 0) {
    summary.push(
      String(kwNotRank) +
        ' of ' +
        String(ownMembers.length) +
        ' tracked keywords are not ranking in the top 100 at all. Either the pages do not exist or Google has not indexed them for these terms.',
    );
  }
  if (blGap != null && blGap < -20) {
    summary.push(
      'Referring domain gap: Evari has ' +
        String(ownRd) +
        ', peer median is ' +
        String(peerMedian) +
        '. Backlinks are a compounding signal, the gap widens every month it is ignored.',
    );
  }
  if (perfConnected && avgPerfScore != null && avgPerfScore < 0.8) {
    summary.push(
      'Mobile performance score averages ' +
        String(Math.round(avgPerfScore * 100)) +
        '. Under 80 means Google is discounting the site in mobile search.',
    );
  }
  if (summary.length === 0) {
    summary.push('Everything looks clean on this scan. No blocking issues detected.');
  }

  // -------- Issues (existing fix list) --------
  const issues: SynopsisIssue[] = [];
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
  const seenFindingKeys = new Set<string>();
  for (const r of rows) {
    for (const f of r.findings) {
      if (issues.length > 200) break;
      const key = f.id;
      if (seenFindingKeys.has(key)) continue;
      seenFindingKeys.add(key);
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
  issues.sort((a, b) => {
    const sev: Record<SynopsisSeverity, number> = { critical: 0, warning: 1, info: 2 };
    const kindRank = (k: SynopsisFixKind): number => (k === 'manual' ? 1 : 0);
    return (
      kindRank(a.kind) - kindRank(b.kind) ||
      sev[a.severity] - sev[b.severity] ||
      a.title.localeCompare(b.title)
    );
  });

  // -------- Enhancements --------
  const enhancements: SynopsisEnhancement[] = [];

  // Helper to stamp a clean task-default payload on every row. Every
  // enhancement must carry one so the Add-to-todo button can fire the
  // task without any client-side guessing.
  const kwSubject =
    competitorLists.length === 0
      ? 'no competitors tracked yet'
      : competitorLists.length + ' competitor lists · ' + String(ownMembers.length) + ' own keywords';
  const rewriteCount = weakTitle.length + weakDesc.length;

  // 1. Keyword research + competitors.
  enhancements.push({
    id: 'enhance:keywords-research',
    kind: 'keywords-research',
    title: 'Research e-bike keywords and competitors',
    description:
      'I research the top UK e-bike sites, propose which to track as competitors, and queue their best-performing keywords for your own list. You confirm the competitor shortlist before anything is added.',
    cta: 'Research',
    impact: competitorLists.length < 3 ? 'high' : 'medium',
    subject: kwSubject,
    executable: true,
    taskDefaults: {
      title: 'Run keyword research and add UK e-bike competitors',
      description:
        'Use the Synopsis enhance flow to research UK e-bike competitors, pick the shortlist, and seed Evari own list + per-competitor lists with their best keywords. ' + kwSubject,
      category: 'seo',
      priority: competitorLists.length < 3 ? 'high' : 'medium',
    },
  });

  // 2. Meta rewrites. Only surface if there are weak metas in play.
  if (rewriteCount > 0) {
    enhancements.push({
      id: 'enhance:meta-rewrite',
      kind: 'meta-rewrite',
      title: 'Rewrite weak meta titles and descriptions',
      description:
        'I find every meta title or description that is too short, too long, generic or duplicated across pages, and rewrite it in Evari voice. Runs in a single pass with a progress bar per page.',
      cta: 'Rewrite all',
      impact: rewriteCount >= 10 ? 'high' : 'medium',
      subject: rewriteCount + ' pages need a rewrite',
      executable: true,
      taskDefaults: {
        title: 'Rewrite ' + rewriteCount + ' weak meta titles or descriptions',
        description:
          'Every meta outside the 30-65 / 80-165 character band or duplicated across pages gets rewritten via the Synopsis enhance flow. ' + rewriteCount + ' entries queued.',
        category: 'seo',
        priority: rewriteCount >= 10 ? 'high' : 'medium',
      },
    });
  }

  // 3. Internal link proposals.
  if (highImpLowClick.length > 0) {
    enhancements.push({
      id: 'enhance:internal-links',
      kind: 'internal-links',
      title: 'Propose internal links to lift stuck pages',
      description:
        'I find pages getting impressions but no clicks and suggest specific links from higher-authority pages that would push them up. You review the proposals and apply them in-line on each page.',
      cta: 'Propose',
      impact: 'medium',
      subject: highImpLowClick.length + ' pages are stuck',
      executable: false,
      taskDefaults: {
        title: 'Add internal links to ' + highImpLowClick.length + ' stuck pages',
        description:
          'Review the Synopsis Propose internal links modal and add the suggested anchors on each source page. Target: lift CTR on pages getting impressions with zero clicks.',
        category: 'seo',
        priority: 'medium',
      },
    });
  }

  // 4. Blog topic proposals.
  enhancements.push({
    id: 'enhance:blog-topics',
    kind: 'blog-topics',
    title: 'Propose blog topics from keyword gaps',
    description:
      'I compare your keyword coverage against competitors and propose five blog post briefs where the gap is biggest. Copy any brief to clipboard and paste into a Shopify blog draft.',
    cta: 'Propose',
    impact: competitorLists.length > 0 ? 'medium' : 'low',
    subject:
      competitorLists.length > 0
        ? 'using ' + competitorLists.length + ' competitor lists as the benchmark'
        : 'add competitors first for sharper proposals',
    executable: true,
    taskDefaults: {
      title: 'Write 5 blog posts from the Synopsis keyword-gap briefs',
      description:
        'Open the Synopsis Propose blog topics modal, copy each brief, and draft the posts in Shopify. One post per sprint.',
      category: 'content',
      priority: 'medium',
    },
  });

  // Sort parents by impact; children keep the author-specified order.
  const impactRank: Record<SynopsisEnhancement['impact'], number> = { high: 0, medium: 1, low: 2 };
  enhancements.sort((a, b) => impactRank[a.impact] - impactRank[b.impact]);

  const context: SynopsisContext = {
    pages: {
      total: rows.length,
      missingTitle: missingTitle.length,
      missingDesc: missingDesc.length,
      weakTitle: weakTitle.length,
      weakDesc: weakDesc.length,
      criticalFindings,
      highImpLowClick: highImpLowClick.length,
      rankingButNoDesc: rankingButNoDesc.length,
    },
    keywords: {
      connected: kwConnected,
      ownCount: ownMembers.length,
      competitorListCount: competitorLists.length,
      totalTrackedKeywords: ownMembers.length,
      inTop3: kwTop3,
      inTop10: kwTop10,
      ranking11to20: kw1120,
      notRanking: kwNotRank,
      avgPosition: kwAvgPos,
    },
    backlinks: {
      connected: blConnected,
      ownReferringDomains: ownRd,
      peerMedianReferringDomains: peerMedian,
      gap: blGap,
    },
    traffic: {
      connected: trafficConnected,
      sessions28d: sessionsTile?.value ?? null,
      sessionsDelta: sessionsTile?.deltaPct ?? null,
      bounceRate: bounceFromTrend,
      topChannel,
    },
    performance: {
      connected: perfConnected,
      avgPerformanceScore: avgPerfScore != null ? avgPerfScore * 100 : null,
      mobileLcpSec: medianLcp,
      mobileInpMs: medianInp,
    },
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    issues,
    enhancements,
    totals: {
      pages: rows.length,
      missingMetaTitle: missingTitle.length,
      missingMetaDesc: missingDesc.length,
      pagesWithIssues: withIssues.length,
      criticalFindings,
    },
    context,
  };
}

function pluralize(n: number, singular: string, plural: string): string {
  return String(n) + ' ' + (n === 1 ? singular : plural);
}

function avgOrNull(nums: number[]): number | null {
  const valid = nums.filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}
