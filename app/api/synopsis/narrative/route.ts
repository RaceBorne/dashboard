import { NextResponse } from 'next/server';
import { getPagesOverview } from '@/lib/pages/overview';
import { getKeywordWorkspace } from '@/lib/keywords/workspace';
import { getBacklinksOverview } from '@/lib/backlinks/repository';
import { getTrafficSnapshot } from '@/lib/traffic/repository';
import { getPerformanceOverview } from '@/lib/performance/repository';
import { analyseSynopsis, type SynopsisContext } from '@/lib/synopsis/analyse';
import { generateTextWithFallback, buildSystemPrompt } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

/**
 * POST /api/synopsis/narrative
 *
 * Re-reads every signal (pages, keywords, backlinks, traffic, performance),
 * hands the deterministic context to Claude, gets back a 3-5 sentence
 * narrative assessment of the site's state. Includes direct spend guidance
 * where gaps are material.
 *
 * Kept as a separate endpoint so the /synopsis page can render fast on the
 * server without paying the AI tax on every navigation. The client calls
 * this on first mount + on every Refresh click.
 */
export async function POST() {
  try {
    const [overview, keywords, backlinks, traffic, performance] = await Promise.all([
      getPagesOverview(),
      safe(() => getKeywordWorkspace()),
      safe(() => getBacklinksOverview()),
      safe(() => getTrafficSnapshot()),
      safe(() => getPerformanceOverview()),
    ]);

    const synopsis = analyseSynopsis({
      rows: overview.rows,
      keywords,
      backlinks,
      traffic,
      performance,
    });

    const prompt = buildNarrativePrompt(synopsis.context);
    const system = await buildSystemPrompt({
      voice: 'analyst',
      task: 'Write a candid assessment of a Shopify e-bike site that is being fixed entirely in-house. Return JSON only, no prose wrapper. The prose is in the "narrative" field. Rules: never suggest hiring, agencies, contractors, consultants, or any outside help. Every recommendation must be something a small in-house team can do with code, content, design or configuration. The only external spend permitted to mention is paid advertising, and only when paid search is the clearest lever for a specific keyword opportunity. Never use em-dashes or en-dashes.',
    });

    const { text } = await generateTextWithFallback({
      model: MODEL,
      system,
      prompt,
      temperature: 0.4,
    });

    const { narrative, actions } = parseNarrative(text);
    if (!narrative) {
      return NextResponse.json(
        { ok: false, error: 'Narrative parsing failed. Raw text: ' + text.slice(0, 200) },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      narrative,
      actions,
      context: synopsis.context,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Narrative generation failed',
      },
      { status: 500 },
    );
  }
}

function buildNarrativePrompt(ctx: SynopsisContext): string {
  const lines: string[] = [
    'You are writing a one-paragraph situation report for the operator of evari.cc, a UK premium e-bike brand. Use the exact numbers below. Do not invent figures. Where a signal is disconnected (marked n/a), say nothing about it.',
    '',
    'PAGES (' + ctx.pages.total + ' total indexed on Shopify):',
    '  - ' + ctx.pages.missingTitle + ' missing meta titles',
    '  - ' + ctx.pages.missingDesc + ' missing meta descriptions',
    '  - ' + ctx.pages.weakTitle + ' weak titles (outside 30-65 chars)',
    '  - ' + ctx.pages.weakDesc + ' weak descriptions (outside 80-165 chars)',
    '  - ' + ctx.pages.criticalFindings + ' critical scan findings',
    '  - ' + ctx.pages.highImpLowClick + ' pages have GSC impressions but zero clicks',
    '  - ' + ctx.pages.rankingButNoDesc + ' pages rank top 20 with no meta description',
    '',
    'KEYWORDS:',
    ctx.keywords.connected
      ? '  - tracking ' + ctx.keywords.ownCount + ' own keywords across ' + ctx.keywords.competitorListCount + ' competitor lists'
      : '  - DataForSEO not connected, no keyword visibility',
    ctx.keywords.connected && ctx.keywords.ownCount > 0
      ? '  - ' + ctx.keywords.inTop3 + ' in top 3, ' + ctx.keywords.inTop10 + ' in top 10, ' + ctx.keywords.ranking11to20 + ' in 11-20, ' + ctx.keywords.notRanking + ' not ranking'
      : '',
    ctx.keywords.avgPosition != null
      ? '  - average position: ' + ctx.keywords.avgPosition.toFixed(1)
      : '',
    '',
    'BACKLINKS:',
    ctx.backlinks.connected
      ? '  - Evari has ' + ctx.backlinks.ownReferringDomains + ' referring domains'
      : '  - backlink data not ingested',
    ctx.backlinks.peerMedianReferringDomains != null
      ? '  - peer median: ' + ctx.backlinks.peerMedianReferringDomains + ', gap: ' + (ctx.backlinks.gap! > 0 ? '+' : '') + ctx.backlinks.gap
      : '',
    '',
    'TRAFFIC (28 day):',
    ctx.traffic.connected
      ? '  - sessions: ' + ctx.traffic.sessions28d +
        (ctx.traffic.sessionsDelta != null
          ? ' (' + (ctx.traffic.sessionsDelta >= 0 ? '+' : '') + Math.round(ctx.traffic.sessionsDelta * 100) + '% vs previous)'
          : '')
      : '  - GA4 not connected, no traffic data',
    ctx.traffic.topChannel ? '  - top channel: ' + ctx.traffic.topChannel : '',
    ctx.traffic.bounceRate != null ? '  - bounce rate: ' + (ctx.traffic.bounceRate * 100).toFixed(1) + '%' : '',
    '',
    'PERFORMANCE (PageSpeed):',
    ctx.performance.connected
      ? '  - mobile performance score: ' + (ctx.performance.avgPerformanceScore?.toFixed(0) ?? 'n/a') + '/100'
      : '  - PSI not connected',
    ctx.performance.mobileLcpSec != null ? '  - mobile LCP: ' + ctx.performance.mobileLcpSec.toFixed(1) + 's' : '',
    ctx.performance.mobileInpMs != null ? '  - mobile INP: ' + Math.round(ctx.performance.mobileInpMs) + 'ms' : '',
    '',
    'Return JSON shaped exactly like:',
    '{',
    '  "narrative": "3-5 sentence assessment in plain prose. Start with the single biggest issue, then walk through the 2-3 next leverage points, close with the one highest-leverage in-house move for this month. Direct, not corporate.",',
    '  "actions": [',
    '    { "title": "imperative short task title (<80 chars)", "detail": "1 sentence on what done looks like", "category": "seo | shopify | content", "priority": "low | medium | high" }',
    '  ]',
    '}',
    '',
    'Between 4 and 8 actions. Each action must be executable in-house using code, content, design or configuration. Do not propose hiring anyone. Do not propose outside agencies or consultants. Paid advertising spend is the only external spend allowed, and only if it is genuinely the cheapest fastest lever for a specific keyword. Output valid JSON only, no markdown fences, no commentary.',
  ];
  return lines.filter(Boolean).join('\n');
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}


interface NarrativeAction {
  title: string;
  detail: string;
  category: 'seo' | 'shopify' | 'content';
  priority: 'low' | 'medium' | 'high';
}

function parseNarrative(raw: string): { narrative: string | null; actions: NarrativeAction[] } {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Defensive fallback: treat the whole text as the narrative so
    // we don't 500 the page on a malformed model response.
    return {
      narrative: cleaned.replace(/[—–]/g, ',').trim() || null,
      actions: [],
    };
  }
  if (!parsed || typeof parsed !== 'object') return { narrative: null, actions: [] };
  const root = parsed as { narrative?: unknown; actions?: unknown };
  const narrative =
    typeof root.narrative === 'string'
      ? root.narrative.replace(/[—–]/g, ',').trim()
      : null;
  const actions: NarrativeAction[] = [];
  if (Array.isArray(root.actions)) {
    for (const a of root.actions) {
      if (!a || typeof a !== 'object') continue;
      const act = a as Partial<NarrativeAction>;
      if (typeof act.title !== 'string') continue;
      const category: NarrativeAction['category'] =
        act.category === 'seo' || act.category === 'shopify' || act.category === 'content'
          ? act.category
          : 'seo';
      const priority: NarrativeAction['priority'] =
        act.priority === 'low' || act.priority === 'medium' || act.priority === 'high'
          ? act.priority
          : 'medium';
      actions.push({
        title: act.title.replace(/[—–]/g, ',').trim().slice(0, 120),
        detail:
          typeof act.detail === 'string'
            ? act.detail.replace(/[—–]/g, ',').trim().slice(0, 260)
            : '',
        category,
        priority,
      });
    }
  }
  return { narrative, actions: actions.slice(0, 10) };
}
