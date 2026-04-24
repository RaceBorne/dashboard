import { NextResponse } from 'next/server';
import { getKeywordWorkspace } from '@/lib/keywords/workspace';
import { generateTextWithFallback, buildSystemPrompt } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

/**
 * POST /api/synopsis/enhance/blog-topics
 *
 * Finds keyword gaps — terms where competitors rank and Evari does not,
 * or where Evari's position is worse than the competitor median — and
 * proposes 5 blog post briefs that would close the gap.
 *
 * Returns structured briefs. We do NOT auto-publish to Shopify because
 * articles need creative review; the client offers copy-to-clipboard
 * so Craig can paste into a draft Shopify article.
 */

interface BlogBrief {
  title: string;
  primaryKeyword: string;
  competitorGap: string; // which competitor(s) are winning this, at what position
  angle: string; // how this brief is differentiated, in Evari voice
  outline: string[]; // 3-5 bullet outline
  estimatedWordCount: number;
}

export async function POST() {
  try {
    const ws = await getKeywordWorkspace();

    const ownList = ws.lists.find((l) => l.kind === 'own');
    const own = ownList ? ws.membersByList[ownList.id] ?? [] : [];

    // Find gap candidates: keywords appearing on competitor lists with
    // decent volume where Evari's own position is null or worse than 20.
    const gaps = new Map<string, {
      keyword: string;
      volume: number;
      evariPosition: number | null;
      competitors: Array<{ domain: string; position: number | null }>;
    }>();

    for (const list of ws.lists) {
      if (list.kind !== 'competitor') continue;
      const members = ws.membersByList[list.id] ?? [];
      for (const m of members) {
        const ev = own.find((o) => o.keyword === m.keyword);
        const evPos = ev?.ourPosition ?? null;
        if (evPos != null && evPos <= 10) continue; // not a gap — we already rank well
        if ((m.searchVolume ?? 0) < 50) continue; // too niche to bother
        const slot = gaps.get(m.keyword) ?? {
          keyword: m.keyword,
          volume: m.searchVolume ?? 0,
          evariPosition: evPos,
          competitors: [],
        };
        slot.competitors.push({
          domain: list.targetDomain ?? list.label,
          position: m.theirPosition ?? null,
        });
        gaps.set(m.keyword, slot);
      }
    }

    // Rank by volume × competitor coverage, take top 20 to prompt with.
    const ranked = Array.from(gaps.values())
      .filter((g) => g.competitors.some((c) => c.position != null && c.position <= 20))
      .sort(
        (a, b) =>
          b.volume * b.competitors.length - a.volume * a.competitors.length,
      )
      .slice(0, 20);

    if (ranked.length === 0) {
      return NextResponse.json({
        ok: true,
        briefs: [],
        note:
          own.length === 0 || ws.lists.filter((l) => l.kind === 'competitor').length === 0
            ? 'Add competitor lists first so blog topic research has a baseline to compare against.'
            : 'No meaningful keyword gaps detected. Either your coverage is strong or DataForSEO has not ingested competitor rankings yet.',
      });
    }

    const system = await buildSystemPrompt({
      voice: 'evari',
      task: 'Propose 5 blog post briefs for evari.cc, a UK premium e-bike brand. Return valid JSON only. Never use em-dashes or en-dashes.',
    });

    const prompt = [
      'Evari is a UK premium e-bike brand. We want blog posts that will close keyword gaps against competitors while reading in Evari voice (British, direct, no fluff).',
      '',
      'TOP GAP KEYWORDS (sorted by volume * coverage):',
      ...ranked.slice(0, 20).map((g, i) => {
        const compStr = g.competitors
          .filter((c) => c.position != null)
          .slice(0, 3)
          .map((c) => c.domain + ' #' + c.position)
          .join(', ');
        return (
          String(i + 1) +
          '. "' +
          g.keyword +
          '"  vol=' +
          g.volume +
          ', evari=' +
          (g.evariPosition ?? 'not ranking') +
          ', winners: ' +
          compStr
        );
      }),
      '',
      'Return JSON shaped exactly like:',
      '{',
      '  "briefs": [',
      '    {',
      '      "title": "working blog post title",',
      '      "primaryKeyword": "one of the gap keywords above",',
      '      "competitorGap": "which competitors are winning this and at what position",',
      '      "angle": "how Evari should differentiate, 1-2 sentences",',
      '      "outline": ["3-5 short bullets"],',
      '      "estimatedWordCount": 900',
      '    }',
      '  ]',
      '}',
      '',
      'Rules:',
      '  - Exactly 5 briefs.',
      '  - Each primaryKeyword must come from the list above.',
      '  - Titles must read as real blog post titles a UK buyer would click.',
      '  - Plain sentence case where appropriate, no em-dashes, no en-dashes.',
      '  - Output JSON ONLY.',
    ].join('\n');

    const { text } = await generateTextWithFallback({
      model: MODEL,
      system,
      prompt,
      temperature: 0.4,
    });

    const briefs = parseBriefs(text, new Set(ranked.map((r) => r.keyword)));
    return NextResponse.json({
      ok: true,
      briefs,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Blog topic research failed' },
      { status: 500 },
    );
  }
}

function parseBriefs(raw: string, validKeywords: Set<string>): BlogBrief[] {
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
  const arr = (parsed as { briefs?: unknown }).briefs;
  if (!Array.isArray(arr)) return [];
  const out: BlogBrief[] = [];
  for (const b of arr) {
    if (!b || typeof b !== 'object') continue;
    const brief = b as Partial<BlogBrief>;
    if (typeof brief.title !== 'string') continue;
    if (typeof brief.primaryKeyword !== 'string') continue;
    if (!validKeywords.has(brief.primaryKeyword.toLowerCase().trim())) continue;
    out.push({
      title: brief.title.trim().replace(/[—–]/g, ','),
      primaryKeyword: brief.primaryKeyword.toLowerCase().trim(),
      competitorGap: typeof brief.competitorGap === 'string' ? brief.competitorGap.trim().replace(/[—–]/g, ',') : '',
      angle: typeof brief.angle === 'string' ? brief.angle.trim().replace(/[—–]/g, ',') : '',
      outline: Array.isArray(brief.outline)
        ? brief.outline.filter((s): s is string => typeof s === 'string').map((s) => s.trim().replace(/[—–]/g, ',')).slice(0, 6)
        : [],
      estimatedWordCount:
        typeof brief.estimatedWordCount === 'number' && brief.estimatedWordCount > 0
          ? brief.estimatedWordCount
          : 900,
    });
  }
  return out.slice(0, 5);
}
