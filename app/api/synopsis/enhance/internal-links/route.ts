import { NextResponse } from 'next/server';
import { getPagesOverview } from '@/lib/pages/overview';
import { generateTextWithFallback, buildSystemPrompt } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

/**
 * POST /api/synopsis/enhance/internal-links
 *
 * Finds pages that are getting GSC impressions but zero clicks (i.e.
 * ranked but not clicked), then for each proposes 1-3 internal links
 * from higher-authority pages that would lift their perceived depth +
 * topical relevance.
 *
 * Returns a structured list of proposals. Nothing is written to Shopify —
 * applying them safely requires editing page body HTML, which we keep as
 * a human review step for now.
 */

interface LinkProposal {
  target: { pageId: string; pagePath: string; pageTitle: string };
  proposals: Array<{
    fromPath: string;
    anchor: string;
    reason: string;
  }>;
}

export async function POST() {
  try {
    const overview = await getPagesOverview();

    // Stuck pages: have impressions, no clicks, ranking reasonable.
    const stuck = overview.rows
      .filter(
        (r) =>
          r.gsc?.impressions28d != null &&
          r.gsc.impressions28d >= 50 &&
          (r.gsc.clicks28d ?? 0) === 0 &&
          (r.gsc.avgPosition28d ?? 99) < 30,
      )
      .sort((a, b) => (b.gsc?.impressions28d ?? 0) - (a.gsc?.impressions28d ?? 0))
      .slice(0, 8);

    if (stuck.length === 0) {
      return NextResponse.json({
        ok: true,
        proposals: [],
        note: 'No stuck pages detected. All pages with impressions are getting clicks.',
      });
    }

    // Candidate source pages: have clicks (Google likes them) and are on the same site.
    const sources = overview.rows
      .filter((r) => (r.gsc?.clicks28d ?? 0) >= 5)
      .sort((a, b) => (b.gsc?.clicks28d ?? 0) - (a.gsc?.clicks28d ?? 0))
      .slice(0, 40)
      .map((r) => ({ path: r.path, title: r.title, clicks: r.gsc?.clicks28d ?? 0 }));

    const system = await buildSystemPrompt({
      voice: 'analyst',
      task: 'Propose internal link opportunities for a Shopify site. Return valid JSON only. Never use em-dashes or en-dashes.',
    });

    const prompt = [
      'Evari is a UK premium e-bike site. The following pages are ranking but earn zero clicks. Propose 1-3 internal links per stuck page, from the listed source pages that already get traffic, that would boost topical depth + perceived relevance.',
      '',
      'STUCK PAGES:',
      ...stuck.map((r, i) =>
        String(i + 1) + '. ' + r.title + '  (' + r.path + ', ' + (r.gsc?.impressions28d ?? 0) + ' imps, pos ' + (r.gsc?.avgPosition28d?.toFixed(1) ?? 'n/a') + ')',
      ),
      '',
      'SOURCE PAGES (candidates to link FROM):',
      ...sources.map((s) => s.path + '  (' + s.clicks + ' clicks)  "' + s.title + '"'),
      '',
      'Return JSON shaped like:',
      '{',
      '  "proposals": [',
      '    {',
      '      "targetPath": "string from stuck list",',
      '      "links": [',
      '        { "fromPath": "string from sources list", "anchor": "natural anchor text <=8 words", "reason": "1 sentence" }',
      '      ]',
      '    }',
      '  ]',
      '}',
      '',
      'Rules:',
      '  - fromPath and targetPath must be exact paths from the lists above.',
      '  - Do not propose self-links (fromPath must differ from targetPath).',
      '  - Anchor text should read naturally in prose, not keyword-stuffed.',
      '  - Output JSON ONLY. No commentary, no markdown fences.',
    ].join('\n');

    const { text } = await generateTextWithFallback({
      model: MODEL,
      system,
      prompt,
      temperature: 0.3,
    });

    const parsed = parseProposals(text, stuck, sources.map((s) => s.path));

    return NextResponse.json({
      ok: true,
      proposals: parsed,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal links research failed' },
      { status: 500 },
    );
  }
}

function parseProposals(
  raw: string,
  stuck: Array<{ id: string; path: string; title: string }>,
  validSourcePaths: string[],
): LinkProposal[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const arr = (parsed as { proposals?: unknown }).proposals;
  if (!Array.isArray(arr)) return [];
  const stuckByPath = new Map(stuck.map((s) => [s.path, s]));
  const validSources = new Set(validSourcePaths);
  const out: LinkProposal[] = [];
  for (const p of arr) {
    if (!p || typeof p !== 'object') continue;
    const pr = p as { targetPath?: unknown; links?: unknown };
    if (typeof pr.targetPath !== 'string') continue;
    const target = stuckByPath.get(pr.targetPath);
    if (!target) continue;
    if (!Array.isArray(pr.links)) continue;
    const proposals: LinkProposal['proposals'] = [];
    for (const l of pr.links) {
      if (!l || typeof l !== 'object') continue;
      const link = l as { fromPath?: unknown; anchor?: unknown; reason?: unknown };
      if (typeof link.fromPath !== 'string' || !validSources.has(link.fromPath)) continue;
      if (typeof link.anchor !== 'string' || !link.anchor.trim()) continue;
      if (link.fromPath === target.path) continue;
      proposals.push({
        fromPath: link.fromPath,
        anchor: link.anchor.trim(),
        reason: typeof link.reason === 'string' ? link.reason.trim() : '',
      });
    }
    if (proposals.length > 0) {
      out.push({
        target: { pageId: target.id, pagePath: target.path, pageTitle: target.title },
        proposals: proposals.slice(0, 3),
      });
    }
  }
  return out;
}
