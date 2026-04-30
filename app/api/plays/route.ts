import { NextResponse, after } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getCountsPerPlay, listPlays } from '@/lib/dashboard/repository';
import type { Play } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/plays
 *
 * Creates a new strategy ("play") row in `dashboard_plays`. The row is
 * seeded with empty research/targets/messaging/chat arrays so the detail
 * page loads without any conditional undefined-guards. Returns `{ id }`
 * which the client uses to navigate to `/plays/{id}`.
 *
 * Accepts optional body:
 *   { title?: string, brief?: string, category?: string }
 *
 * After responding, schedules an auto-scan via `after()` so the funnel
 * is pre-populated with candidate companies by the time Craig opens
 * the detail page. The scan is non-blocking — the client gets the id
 * immediately and the funnel fills in asynchronously.
 */
/**
 * GET /api/plays
 *
 * Lightweight project list for the sidebar. Returns id + title +
 * updatedAt, sorted most-recently-updated first.
 */
export async function GET() {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: true, plays: [] });
  }
  const [plays, counts] = await Promise.all([
    listPlays(supabase),
    getCountsPerPlay(supabase),
  ]);
  const trimmed = plays.map((p) => {
    const c = counts.get(p.id);
    return {
      id: p.id,
      title: p.title,
      updatedAt: p.updatedAt,
      prospectCount: c?.prospects ?? 0,
      leadCount: c?.leads ?? 0,
      conversationCount: c?.conversations ?? 0,
    };
  });
  return NextResponse.json({ ok: true, plays: trimmed });
}

export async function POST(req: Request) {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  let body: { title?: string; brief?: string; category?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Empty body is fine — we'll use defaults below.
  }

  const now = new Date().toISOString();
  const id = generatePlayId();
  const title = (body.title ?? '').trim() || 'Untitled strategy';
  const category = (body.category ?? '').trim() || undefined;
  const play: Play = {
    id,
    title,
    brief:
      (body.brief ?? '').trim() ||
      'A one-paragraph "why" for this strategy. Edit me.',
    stage: 'idea',
    createdAt: now,
    updatedAt: now,
    tags: [],
    research: [],
    targets: [],
    messaging: [],
    chat: [],
    category,
    activity: [
      {
        id: `act-${Date.now()}`,
        at: now,
        type: 'created',
        summary: 'Strategy created.',
      },
    ],
    autoScan: {
      status: 'pending',
    },
  };

  const { error } = await supabase
    .from('dashboard_plays')
    .insert({ id, payload: play });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  // Auto-scan the landscape for this Play in the background. We don't
  // block the response on it — Craig gets the id immediately and the
  // funnel fills in over the next few seconds. Anything that goes wrong


  // Bootstrap research: fire a market-sizing call in the background
  // the moment an idea is created so the research log is already seeded
  // with insight by the time the user reaches Market analysis. The
  // Discover Agent at the end inherits everything via the shared log.
  after(async () => {
    try {
      const { appendResearchLog } = await import('@/lib/marketing/researchLog');
      const { generateBriefing, hasAIGatewayCredentials } = await import('@/lib/ai/gateway');
      if (!hasAIGatewayCredentials() || !supabase) return;
      await appendResearchLog(supabase, id, {
        kind: 'bootstrap',
        payload: { note: 'Idea created. Title: ' + title + '. Pitch: ' + (body.brief ?? '').slice(0, 200) },
      });
      const prompt = [
        'Quick market scan, no chip picks yet, just the idea title and pitch.',
        '',
        'Idea: ' + title,
        'Pitch: ' + (body.brief ?? ''),
        '',
        'Reply with VALID JSON, no commentary, no markdown fences:',
        '{ "marketSize": "string, one short sentence", "competitors": ["string", "string", "string"], "intentSignals": ["string", "string"] }',
        '',
        'Plain prose only. No em-dashes (use commas or full stops).',
      ].join('\n');
      const text = await generateBriefing({
        task: 'bootstrap-market-sizing',
        voice: 'analyst',
        prompt,
      });
      try {
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(cleaned) as { marketSize?: string; competitors?: string[]; intentSignals?: string[] };
        await appendResearchLog(supabase, id, {
          kind: 'market_sizing',
          payload: {
            marketSize: parsed.marketSize ?? '',
            competitors: Array.isArray(parsed.competitors) ? parsed.competitors.slice(0, 3) : [],
            intentSignals: Array.isArray(parsed.intentSignals) ? parsed.intentSignals.slice(0, 3) : [],
          },
        });
      } catch {
        // Bootstrap is best-effort.
      }
    } catch {
      // Best-effort.
    }
  });

  return NextResponse.json({ ok: true, id });
}

/**
 * Short, URL-friendly id. Format: `play-<timestamp36>-<rand36>`.
 * Not cryptographically unique — but collision-proof for the
 * one-user-at-a-time dashboard, and readable in URLs.
 */
function generatePlayId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `play-${t}-${r}`;
}
