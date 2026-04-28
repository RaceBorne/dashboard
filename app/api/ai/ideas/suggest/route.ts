import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/ai/ideas/suggest
 *
 * Asks Claude to propose 3-5 concrete new prospecting ideas for Evari.
 * Each idea comes back with a working title and a one-sentence pitch
 * (the same two fields the New Idea modal captures), so the client can
 * one-click any suggestion into a real Play row.
 *
 * Optional body:
 *   { kind?: 'generate' | 'refine' | 'analyse', context?: string }
 *
 * `kind` shapes the system prompt; `context` is freeform extra steering
 * (e.g. "focus on UK private healthcare").
 */
interface SuggestRequest {
  kind?: 'generate' | 'refine' | 'analyse';
  context?: string;
}

interface IdeaSuggestion {
  title: string;
  pitch: string;
  why: string;
}

const TASK_BY_KIND: Record<NonNullable<SuggestRequest['kind']>, string> = {
  generate:
    'Propose 5 fresh, untried prospecting ideas for Evari Speed Bikes. Each idea is a niche audience the 856 e-bike could land with. Avoid obvious lifestyle bike segments; lean into adjacent premium markets.',
  refine:
    'Take the kinds of ideas Craig has already explored and propose 5 sharper variations: tighter audience, clearer wedge, easier to reach.',
  analyse:
    'Pick 5 specific market segments and assess each: who buys, where they live online, what would make them care about the 856. The pitch line should be the angle, not the segment.',
};

export async function POST(req: Request) {
  if (!hasAIGatewayCredentials()) {
    return NextResponse.json(
      { ok: false, error: 'AI gateway not configured' },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as SuggestRequest;
  const kind = body.kind ?? 'generate';
  const context = (body.context ?? '').trim();

  const prompt = [
    TASK_BY_KIND[kind],
    context ? `Extra steering from Craig: ${context}` : '',
    '',
    'Output format: a single JSON array of exactly 5 objects, no prose, no markdown fences. Each object:',
    '{',
    '  "title": string,   // 4-8 words, working title used as the folder/name',
    '  "pitch": string,   // ONE sentence, who/what/why now',
    '  "why":   string    // ONE sentence, the wedge angle',
    '}',
    '',
    'Pitch and why MUST be plain English with no em-dashes (use commas or periods).',
  ]
    .filter(Boolean)
    .join('\n');

  let raw = '';
  try {
    raw = await generateBriefing({
      task: 'ideas-suggest',
      voice: 'analyst',
      prompt,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'AI call failed: ' + (err as Error).message },
      { status: 502 },
    );
  }

  const ideas = parseIdeas(raw);
  if (!ideas || ideas.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Could not parse idea suggestions from AI response', raw },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, ideas });
}

function parseIdeas(raw: string): IdeaSuggestion[] | undefined {
  // Strip optional code fences.
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  // Locate the first [ and last ] in case the model surrounded the JSON
  // with stray prose despite instructions.
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return undefined;
  const slice = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed
      .map((p) => {
        if (!p || typeof p !== 'object') return null;
        const o = p as Record<string, unknown>;
        const title = typeof o.title === 'string' ? o.title.trim() : '';
        const pitch = typeof o.pitch === 'string' ? o.pitch.trim() : '';
        const why = typeof o.why === 'string' ? o.why.trim() : '';
        if (!title || !pitch) return null;
        return { title, pitch, why };
      })
      .filter((x): x is IdeaSuggestion => x !== null);
  } catch {
    return undefined;
  }
}
