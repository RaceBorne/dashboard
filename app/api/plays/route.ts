import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
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
 *   { title?: string, brief?: string }
 * — both default to placeholder strings that the user can edit on the detail page.
 */
export async function POST(req: Request) {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  let body: { title?: string; brief?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Empty body is fine — we'll use defaults below.
  }

  const now = new Date().toISOString();
  const id = generatePlayId();
  const play: Play = {
    id,
    title: (body.title ?? '').trim() || 'Untitled strategy',
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
    activity: [
      {
        id: `act-${Date.now()}`,
        at: now,
        type: 'created',
        summary: 'Strategy created.',
      },
    ],
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
