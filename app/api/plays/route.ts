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
