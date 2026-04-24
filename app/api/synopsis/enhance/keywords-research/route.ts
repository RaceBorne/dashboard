import { NextResponse } from 'next/server';
import { generateTextWithFallback, buildSystemPrompt } from '@/lib/ai/gateway';
import { getKeywordWorkspace } from '@/lib/keywords/workspace';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

/**
 * POST /api/synopsis/enhance/keywords-research
 *
 * Returns a proposed shortlist of UK e-bike competitors plus, for each,
 * 5-8 of their best-performing keywords and why they matter to Evari.
 * The client shows this in a confirmation modal — Craig picks which
 * competitors to actually track, then /api/synopsis/enhance/keywords-apply
 * does the add.
 *
 * Nothing is written to the DB by this endpoint. Research only.
 */

interface CompetitorProposal {
  name: string;
  domain: string;
  // One sentence on where they sit relative to Evari.
  positioning: string;
  // Why they are worth tracking.
  whyTrack: string;
  // Proposed keywords to pull onto Evari's own list, assuming they
  // rank well for them.
  seedKeywords: string[];
}

export async function POST() {
  try {
    // Prime the prompt with what the workspace already tracks, so the
    // research doesn't propose duplicates.
    const ws = await safe(() => getKeywordWorkspace());
    const alreadyTracked = new Set(
      (ws?.lists ?? [])
        .filter((l) => l.kind === 'competitor' && l.targetDomain)
        .map((l) => (l.targetDomain ?? '').toLowerCase()),
    );

    const system = await buildSystemPrompt({
      voice: 'analyst',
      task: 'Research the top UK premium e-bike brands that compete with Evari (evari.cc). Return valid JSON only, no prose around it. Never use em-dashes or en-dashes.',
    });

    const prompt = [
      'Evari is a UK premium e-bike brand positioned between the mass market (Pure Electric, Halfords) and the super-premium road/gravel set (Cowboy, VanMoof, Brompton Electric, Ribble). Their bikes are trail-leaning speed e-bikes.',
      '',
      alreadyTracked.size > 0
        ? 'Already tracked (exclude): ' + Array.from(alreadyTracked).join(', ')
        : 'Nothing is tracked yet.',
      '',
      'Return JSON shaped like:',
      '{',
      '  "competitors": [',
      '    {',
      '      "name": "string",',
      '      "domain": "string (bare, no protocol)",',
      '      "positioning": "1 sentence on where they sit relative to Evari",',
      '      "whyTrack": "1 sentence on why this competitor matters for Evari",',
      '      "seedKeywords": ["5-8 keywords Evari should also track, real search terms UK buyers use"]',
      '    }',
      '  ]',
      '}',
      '',
      'Constraints:',
      '  - Between 6 and 10 competitors total.',
      '  - Mix of direct (same price / audience), aspirational (one rung up), and disruptive (cheaper competitor eating share).',
      '  - Only UK-relevant brands (sold in UK, UK domain or UK-shipping).',
      '  - seedKeywords must be realistic UK consumer searches, lowercase, no branded terms, 2-5 words each.',
      '  - Do not propose Evari itself. Do not propose any already-tracked domains.',
      '  - Output JSON ONLY. No commentary, no markdown fences.',
    ].join('\n');

    const { text } = await generateTextWithFallback({
      model: MODEL,
      system,
      prompt,
      temperature: 0.3,
    });

    const proposals = parseProposals(text, alreadyTracked);
    if (proposals.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Research returned no usable competitors. Try again.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      proposals,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Research failed' },
      { status: 500 },
    );
  }
}

function parseProposals(
  raw: string,
  alreadyTracked: Set<string>,
): CompetitorProposal[] {
  // Strip any markdown fences the model sometimes sneaks in.
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
  const competitors = (parsed as { competitors?: unknown }).competitors;
  if (!Array.isArray(competitors)) return [];
  const seen = new Set<string>();
  const out: CompetitorProposal[] = [];
  for (const raw of competitors) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Partial<CompetitorProposal>;
    const domain = typeof c.domain === 'string'
      ? c.domain
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/$/, '')
          .trim()
      : '';
    const name = typeof c.name === 'string' ? c.name.trim() : '';
    if (!domain || !name) continue;
    if (alreadyTracked.has(domain)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    const seedKeywords = Array.isArray(c.seedKeywords)
      ? c.seedKeywords
          .filter((k): k is string => typeof k === 'string')
          .map((k) => k.toLowerCase().trim())
          .filter((k) => k.length > 0 && k.length <= 80)
          .slice(0, 10)
      : [];
    out.push({
      name,
      domain,
      positioning: typeof c.positioning === 'string' ? c.positioning.trim() : '',
      whyTrack: typeof c.whyTrack === 'string' ? c.whyTrack.trim() : '',
      seedKeywords,
    });
  }
  return out.slice(0, 12);
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
