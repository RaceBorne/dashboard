import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { anthropic } from '@ai-sdk/anthropic';
import { buildSystemPrompt } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay } from '@/lib/dashboard/repository';
import type { DiscoverFilters } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

/**
 * POST /api/discover/expand-queries
 *
 * Body: {
 *   filters: DiscoverFilters,    // the current search filters
 *   seenDomains: string[],       // domains already in the result list
 *   playId?: string,             // optional venture for extra context
 *   limit?: number,              // how many new keywords to generate (default 5)
 * }
 *
 * Returns: { ok: true, keywords: string[], reasoning: string }
 *
 * Uses Claude to generate N NEW search keywords that would find companies
 * the current filters + results are missing. Example: if the existing
 * filters say "UK cycling clubs" and the results are mostly generic road
 * clubs, Claude might suggest "London cycling collective", "UK sportive
 * organiser", "British triathlon club", "premium road cycling team UK"
 * — query variations aimed at widening the net without drifting off-topic.
 *
 * The client then runs each new keyword through the existing search
 * endpoint and merges the results into the current list.
 */
interface Body {
  filters?: DiscoverFilters;
  seenDomains?: string[];
  playId?: string;
  limit?: number;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const filters = body.filters ?? {};
  const seenDomains = Array.isArray(body.seenDomains) ? body.seenDomains : [];
  const limit = Math.min(Math.max(body.limit ?? 5, 3), 10);

  // Resolve venture context when a playId is provided. Strategy persona +
  // short form give the model a steer on what counts as 'on-topic'.
  let ventureBlock = '';
  if (body.playId) {
    try {
      const supabase = createSupabaseAdmin();
      const play = supabase ? await getPlay(supabase, body.playId) : null;
      if (play) {
        ventureBlock = [
          'VENTURE CONTEXT:',
          '  Title: ' + play.title,
          play.strategyShort ? '  Strategy: ' + play.strategyShort : '',
          play.strategy?.targetPersona
            ? '  Target persona: ' + play.strategy.targetPersona
            : '',
          play.strategy?.sector ? '  Sector: ' + play.strategy.sector : '',
        ]
          .filter(Boolean)
          .join('\n');
      }
    } catch {
      // Non-fatal: context is a bonus, not a requirement.
    }
  }

  const currentKeywords = (filters.keywords?.include ?? []).join(', ') || '(none)';
  const currentIndustries = (filters.industry?.include ?? []).join(', ') || '(none)';
  const currentLocations = (filters.location?.include ?? []).join(', ') || '(none)';

  const task =
    'Generate ' +
    limit +
    ' NEW search keyword phrases that would find B2B companies we have NOT yet found. ' +
    'The purpose is to widen the net without drifting off-topic. Each keyword should be ' +
    '2-5 words, suitable as a business-listings search query (not a natural-language sentence).' +
    '\n\nNever use em-dashes or en-dashes in any output. Use commas instead.' +
    '\n\nReturn ONLY JSON in this shape (no prose, no markdown fences):' +
    '\n{' +
    '\n  "keywords": ["query 1", "query 2", ...],' +
    '\n  "reasoning": "one short sentence"' +
    '\n}';

  const prompt = [
    ventureBlock,
    '',
    'CURRENT FILTERS:',
    '  Keywords: ' + currentKeywords,
    '  Industries: ' + currentIndustries,
    '  Locations: ' + currentLocations,
    '',
    'DOMAINS ALREADY IN THE RESULT LIST (' + seenDomains.length + ' total):',
    seenDomains.slice(0, 40).map((d) => '  ' + d).join('\n') ||
      '  (none yet)',
    seenDomains.length > 40
      ? '  ... and ' + (seenDomains.length - 40) + ' more'
      : '',
    '',
    'Your job: propose ' +
      limit +
      ' keyword phrases that would find DIFFERENT companies than what we have. Try:',
    '  - Regional variations (e.g. London, Manchester, Bristol sub-scenes)',
    '  - Adjacent niches (sportive organisers, clubs attached to events, coaching outfits)',
    '  - Bigger players we may have missed (major brands in the same space)',
    '  - Smaller / more specialised versions of the core target',
    '  - Related professional roles / venues that cluster with the audience',
  ]
    .filter((s) => s !== '')
    .join('\n');

  const system = await buildSystemPrompt({ voice: 'analyst', task });

  let text: string;
  // Try gateway first; fall back to direct Anthropic if it fails and we
  // have an API key. When neither path works, bubble the real error up
  // so the client surfaces a useful message.
  try {
    const res = await generateText({
      model: gateway(MODEL),
      system,
      prompt,
    });
    text = res.text;
  } catch (gatewayErr) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'No model available. Set AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY in Vercel env.',
          detail: gatewayErr instanceof Error ? gatewayErr.message : String(gatewayErr),
        },
        { status: 502 },
      );
    }
    try {
      const bareModel = MODEL.replace(/^anthropic\//, '');
      const res = await generateText({
        model: anthropic(bareModel),
        system,
        prompt,
      });
      text = res.text;
    } catch (anthropicErr) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Both gateway and direct Anthropic failed.',
          detail:
            anthropicErr instanceof Error
              ? anthropicErr.message
              : String(anthropicErr),
        },
        { status: 502 },
      );
    }
  }

  const parsed = parseJsonEnvelope(text);
  if (!parsed || !Array.isArray(parsed.keywords)) {
    return NextResponse.json({
      ok: false,
      error: 'Model returned no usable keywords',
      raw: text,
    }, { status: 502 });
  }

  const keywords = (parsed.keywords as unknown[])
    .map((k) => (typeof k === 'string' ? k.trim() : ''))
    .filter((k) => k.length >= 2 && k.length <= 80)
    .slice(0, limit);

  return NextResponse.json({
    ok: true,
    keywords,
    reasoning:
      typeof parsed.reasoning === 'string'
        ? parsed.reasoning
        : '',
  });
}

function parseJsonEnvelope(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced
    ? fenced[1].trim()
    : (() => {
        const first = raw.indexOf('{');
        const last = raw.lastIndexOf('}');
        if (first >= 0 && last > first) return raw.slice(first, last + 1);
        return raw;
      })();
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
}
