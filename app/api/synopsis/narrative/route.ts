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

    const { narrative, actions, groups } = parseNarrative(text);
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
      groups,
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
    '  ],',
    '  "groups": [',
    '    {',
    '      "id": "kebab-case-stable-id",',
    '      "title": "short group title (<60 chars)",',
    '      "description": "1-2 sentences on what this group covers and why it matters right now",',
    '      "impact": "high | medium | low",',
    '      "subject": "short hint like \"mobile perf score ~45/100\" or \"14 pages affected\"",',
    '      "children": [',
    '        {',
    '          "title": "short child title (<80 chars)",',
    '          "description": "1-2 sentences on what this discrete job is + what done looks like",',
    '          "category": "seo | shopify | content",',
    '          "priority": "low | medium | high"',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}',
    '',
    'Rules for actions:',
    '  - Between 4 and 8 actions.',
    '  - Each action must be executable in-house with code, content, design or configuration.',
    '  - Do not propose hiring anyone, outside agencies, or consultants. Paid advertising is the only external spend allowed, and only when paid search is the clearest lever for a specific keyword.',
    '',
    'Rules for groups:',
    '  - Between 2 and 5 groups.',
    '  - Pick the groups most relevant to the current state. Examples of groups you might pick (but do not limit yourself to): Technical SEO cleanup, Mobile rebuild, Performance audit, Conversion rate audit, Accessibility pass, Content refresh, Schema / structured data rollout, Shopify theme refactor, Checkout flow audit, Image optimisation, Internal linking overhaul, Site search quality, Email capture + onboarding.',
    '  - Each group has 4-8 children. Children are discrete in-house jobs each with a clear done state.',
    '  - Do not re-create these: keyword research, meta title/description rewrites, internal link proposals, blog topic proposals. Those already live elsewhere in the UI.',
    '  - Priority + impact should reflect the actual numbers above, not generic advice.',
    '',
    'Output valid JSON only, no markdown fences, no commentary, no em-dashes or en-dashes anywhere.',
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

interface NarrativeGroupChild {
  title: string;
  description: string;
  category: NarrativeAction['category'];
  priority: NarrativeAction['priority'];
}

interface NarrativeGroup {
  id: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  subject: string;
  children: NarrativeGroupChild[];
}

const TEXT_MAX = 400;

function scrub(s: string, max = TEXT_MAX): string {
  return s.replace(/[—–]/g, ',').trim().slice(0, max);
}

function parseCategory(v: unknown): NarrativeAction['category'] {
  return v === 'shopify' || v === 'content' ? v : 'seo';
}
function parsePriority(v: unknown): NarrativeAction['priority'] {
  return v === 'low' || v === 'high' ? v : 'medium';
}
function parseImpact(v: unknown): NarrativeGroup['impact'] {
  return v === 'high' || v === 'low' ? v : 'medium';
}
function slugish(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'group';
}

function parseNarrative(raw: string): {
  narrative: string | null;
  actions: NarrativeAction[];
  groups: NarrativeGroup[];
} {
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
      groups: [],
    };
  }
  if (!parsed || typeof parsed !== 'object') return { narrative: null, actions: [], groups: [] };
  const root = parsed as { narrative?: unknown; actions?: unknown; groups?: unknown };
  const narrative =
    typeof root.narrative === 'string' ? scrub(root.narrative, 1200) : null;
  const actions: NarrativeAction[] = [];
  if (Array.isArray(root.actions)) {
    for (const a of root.actions) {
      if (!a || typeof a !== 'object') continue;
      const act = a as Partial<NarrativeAction>;
      if (typeof act.title !== 'string') continue;
      actions.push({
        title: scrub(act.title, 120),
        detail: typeof act.detail === 'string' ? scrub(act.detail, 260) : '',
        category: parseCategory(act.category),
        priority: parsePriority(act.priority),
      });
    }
  }
  const groups: NarrativeGroup[] = [];
  const seenGroupIds = new Set<string>();
  if (Array.isArray(root.groups)) {
    for (const g of root.groups) {
      if (!g || typeof g !== 'object') continue;
      const grp = g as Partial<NarrativeGroup>;
      if (typeof grp.title !== 'string') continue;
      let id =
        typeof grp.id === 'string' && grp.id.trim()
          ? slugish(grp.id)
          : slugish(grp.title);
      // Disambiguate if Claude reuses an id.
      let suffix = 2;
      while (seenGroupIds.has(id)) {
        id = slugish(grp.title) + '-' + suffix;
        suffix++;
      }
      seenGroupIds.add(id);
      const children: NarrativeGroupChild[] = [];
      if (Array.isArray(grp.children)) {
        for (const c of grp.children) {
          if (!c || typeof c !== 'object') continue;
          const ch = c as Partial<NarrativeGroupChild>;
          if (typeof ch.title !== 'string') continue;
          children.push({
            title: scrub(ch.title, 120),
            description:
              typeof ch.description === 'string' ? scrub(ch.description, 320) : '',
            category: parseCategory(ch.category),
            priority: parsePriority(ch.priority),
          });
        }
      }
      if (children.length === 0) continue;
      groups.push({
        id,
        title: scrub(grp.title, 80),
        description: typeof grp.description === 'string' ? scrub(grp.description, 320) : '',
        impact: parseImpact(grp.impact),
        subject: typeof grp.subject === 'string' ? scrub(grp.subject, 120) : '',
        children: children.slice(0, 10),
      });
    }
  }
  return {
    narrative,
    actions: actions.slice(0, 10),
    groups: groups.slice(0, 6),
  };
}
