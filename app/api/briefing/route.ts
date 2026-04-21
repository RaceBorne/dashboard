import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  generateAndPersistBriefing,
  readLatestBriefing,
} from '@/lib/dashboard/briefing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/briefing
 *
 * On-demand regenerate. Rebuilds the briefing payload from live data,
 * calls Claude via the AI Gateway, and upserts into `dashboard_briefings`
 * under today's date (Europe/London). A same-day regen replaces the
 * cron-generated morning briefing — intentional; the latest snapshot is
 * the most informed.
 */
export async function POST() {
  const supabase = createSupabaseAdmin();
  const brief = await generateAndPersistBriefing(supabase, { source: 'manual' });
  return NextResponse.json({
    markdown: brief.markdown,
    mock: brief.mock,
    payload: brief.payload,
    date: brief.date,
    source: brief.source,
  });
}

/**
 * GET /api/briefing
 *
 * Returns the most recent persisted briefing without re-running Claude.
 * The UI hits this on page load and only triggers POST when Craig asks
 * for a refresh. If the table is empty (first run on a fresh env), we
 * fall through to a regenerate so the user never sees an empty state.
 */
export async function GET() {
  const supabase = createSupabaseAdmin();
  const latest = await readLatestBriefing(supabase);
  if (latest) {
    return NextResponse.json({
      markdown: latest.markdown,
      mock: latest.mock,
      payload: latest.payload,
      date: latest.date,
      source: latest.source,
      cached: true,
    });
  }
  // First-run fallback — no briefings have been persisted yet, so generate
  // one on the fly. This only costs an AI Gateway call once.
  const fresh = await generateAndPersistBriefing(supabase, { source: 'manual' });
  return NextResponse.json({
    markdown: fresh.markdown,
    mock: fresh.mock,
    payload: fresh.payload,
    date: fresh.date,
    source: fresh.source,
    cached: false,
  });
}
