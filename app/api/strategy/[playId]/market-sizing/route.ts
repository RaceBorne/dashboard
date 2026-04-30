import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { appendResearchLog } from '@/lib/marketing/researchLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/strategy/[playId]/market-sizing
 *
 * Asks Claude to research the market for the given Sector + Geography
 * picks. Returns four short, scannable strings:
 *   - marketSize: an order-of-magnitude estimate, with a one-line
 *     justification.
 *   - competitors: 3 names of who else is selling here.
 *   - buyerTerminology: 4-6 phrases buyers actually use, lifted from
 *     listings, decks, and review sites — gives the operator the
 *     vocabulary to mirror.
 *   - intentSignals: 3 things to watch for (LinkedIn job posts,
 *     funding rounds, leadership change) that suggest now is the time.
 *
 * Plain prose, never markdown.
 */
interface Body {
  playTitle?: string;
  pitch?: string;
  industries?: string[];
  geographies?: string[];
}

export async function POST(req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  if (!hasAIGatewayCredentials()) {
    return NextResponse.json({ ok: false, error: 'AI gateway not configured' }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  const industries = (body.industries ?? []).filter(Boolean);
  const geographies = (body.geographies ?? []).filter(Boolean);

  // Cache check: if the research log already has a market_sizing
  // entry for this exact (industries, geographies) signature within
  // the last 60 seconds, return that and skip the AI call. Saves us
  // from rate-limit errors when chip-pickers fire rapid changes.
  const cacheKey = JSON.stringify({ i: industries.slice().sort(), g: geographies.slice().sort() });
  try {
    const sb = createSupabaseAdmin();
    if (sb) {
      const { readResearchLog } = await import('@/lib/marketing/researchLog');
      const log = await readResearchLog(sb, playId);
      // Look at the last 5 market_sizing entries; reuse the most
      // recent that matches our cache key and is fresh.
      const cutoff = Date.now() - 60_000;
      for (let i = log.length - 1; i >= Math.max(0, log.length - 5); i--) {
        const entry = log[i];
        if (entry.kind !== 'market_sizing') continue;
        const t = new Date(entry.at).getTime();
        if (t < cutoff) continue;
        const cached = entry.payload as { _key?: string; marketSize?: string; competitors?: string[]; buyerTerminology?: string[]; intentSignals?: string[] };
        if (cached._key === cacheKey) {
          return NextResponse.json({
            ok: true,
            cached: true,
            marketSize: cached.marketSize ?? '',
            competitors: Array.isArray(cached.competitors) ? cached.competitors : [],
            buyerTerminology: Array.isArray(cached.buyerTerminology) ? cached.buyerTerminology : [],
            intentSignals: Array.isArray(cached.intentSignals) ? cached.intentSignals : [],
          });
        }
      }
    }
  } catch {}

  const prompt = [
    'Research the market for this play. Be concrete, no hedging.',
    '',
    'Idea title: ' + (body.playTitle ?? 'untitled'),
    'Pitch: ' + (body.pitch ?? '(no pitch on file)'),
    'Sectors: ' + (industries.length > 0 ? industries.join(', ') : 'not chosen yet'),
    'Geographies: ' + (geographies.length > 0 ? geographies.join(', ') : 'not chosen yet'),
    '',
    'Reply with VALID JSON in exactly this shape, no commentary, no markdown fences:',
    '{',
    '  "marketSize": "string — order-of-magnitude estimate plus one short justification, max 2 sentences",',
    '  "competitors": ["string", "string", "string"],',
    '  "buyerTerminology": ["string", "string", "string", "string"],',
    '  "intentSignals": ["string", "string", "string"]',
    '}',
    '',
    'Strict rules: plain prose only inside each string, no em-dashes (use commas or full stops), no markdown, no headings, no bold. Each array item is a single short phrase, not a paragraph.',
  ].join('\n');

  try {
    const text = await generateBriefing({
      task: 'strategy-market-sizing',
      voice: 'analyst',
      prompt,
    });
    // Strip code fences if the model adds them despite instructions.
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned) as {
      marketSize?: string;
      competitors?: string[];
      buyerTerminology?: string[];
      intentSignals?: string[];
    };
    const result = {
      marketSize: typeof parsed.marketSize === 'string' ? parsed.marketSize : '',
      competitors: Array.isArray(parsed.competitors) ? parsed.competitors.slice(0, 3) : [],
      buyerTerminology: Array.isArray(parsed.buyerTerminology) ? parsed.buyerTerminology.slice(0, 8) : [],
      intentSignals: Array.isArray(parsed.intentSignals) ? parsed.intentSignals.slice(0, 5) : [],
    };
    // Persist to the play's research log so the Discover Agent (and
    // any later stage's AI) inherit this finding instead of redoing
    // the work.
    const sb = createSupabaseAdmin();
    if (sb) {
      try {
        await appendResearchLog(sb, playId, { kind: 'market_sizing', payload: { ...result, _key: cacheKey } });
      } catch {}
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
