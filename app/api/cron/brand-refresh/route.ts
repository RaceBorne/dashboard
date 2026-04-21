/**
 * Weekly brand-brief refresh.
 *
 * Runs via Vercel Cron (see vercel.json). Pulls fresh copy from evari.cc,
 * hands it to Claude with the current stored brief, and asks Claude to
 * re-summarise the *volatile* sections (oneLiner, positioning.summary,
 * products.sharedSpecs, messagingAnchors) without touching the editorial
 * rules (voice, outreachRules, positioning.pillars, positioning.notFor,
 * audiences).
 *
 * If the gateway or the scrape fails we just bump updatedAt — the
 * existing brief stays intact rather than being replaced by a stub.
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  getBrandBrief,
  upsertBrandBrief,
  invalidateBrandBriefCache,
} from '@/lib/brand/brandBrief';
import { scrapeEvari, bumpBrief } from '@/lib/brand/scrapeEvari';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Scrape + LLM merge can run long. Give it plenty of headroom.
export const maxDuration = 300;

export async function GET(req: Request) {
  const authz = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authz !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const current = await getBrandBrief(supabase);

  const scrape = await scrapeEvari();
  let next = bumpBrief(current, scrape);

  if (hasAIGatewayCredentials() && scrape.corpus.length > 500) {
    try {
      const refreshed = await refreshVolatileSections(current, scrape.corpus);
      next = { ...next, ...refreshed };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[brand-refresh] AI merge failed:', (err as Error).message);
    }
  }

  const saved = await upsertBrandBrief(next, supabase);
  invalidateBrandBriefCache();
  return NextResponse.json({
    ok: true,
    updatedAt: saved.updatedAt,
    version: saved.version,
    fetched: scrape.ok.length,
    failed: scrape.failed,
  });
}

interface VolatileRefresh {
  oneLiner?: string;
  positioning?: { summary: string };
  messagingAnchors?: string[];
}

async function refreshVolatileSections(
  current: Awaited<ReturnType<typeof getBrandBrief>>,
  corpus: string,
): Promise<Partial<Awaited<ReturnType<typeof getBrandBrief>>>> {
  const prompt = [
    'Here is fresh HTML-stripped copy from evari.cc (multiple pages):',
    '---',
    corpus.slice(0, 12000),
    '---',
    '',
    'Here is the current brand brief (JSON):',
    '---',
    JSON.stringify(current, null, 2),
    '---',
    '',
    'Re-summarise ONLY the volatile fields based on the fresh copy:',
    '- `oneLiner` (one sentence)',
    '- `positioning.summary` (3–5 sentences)',
    '- `messagingAnchors` (4–6 short quotable lines)',
    '',
    'Do NOT change: voice, outreachRules, positioning.pillars, positioning.notFor, audiences, products.family shape, differentiators, partners.',
    '',
    'Return raw JSON only in this exact shape:',
    '{ "oneLiner": string, "positioning": { "summary": string }, "messagingAnchors": string[] }',
    'No prose, no markdown fences.',
  ].join('\n');

  const raw = await generateBriefing({
    task: 'brand-brief-refresh',
    voice: 'analyst',
    prompt,
  });
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as VolatileRefresh;

  const next: Partial<Awaited<ReturnType<typeof getBrandBrief>>> = {};
  if (typeof parsed.oneLiner === 'string' && parsed.oneLiner.length > 20) {
    next.oneLiner = parsed.oneLiner.trim();
  }
  if (
    parsed.positioning?.summary &&
    typeof parsed.positioning.summary === 'string' &&
    parsed.positioning.summary.length > 30
  ) {
    next.positioning = { ...current.positioning, summary: parsed.positioning.summary.trim() };
  }
  if (Array.isArray(parsed.messagingAnchors) && parsed.messagingAnchors.length > 0) {
    next.messagingAnchors = parsed.messagingAnchors
      .filter((m): m is string => typeof m === 'string' && m.length > 4)
      .slice(0, 8);
  }
  return next;
}
