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
// Serve the persisted briefing if it's < STALE_AFTER_MS old. Otherwise
// regenerate once and serve the fresh result. Keeps AI spend bounded
// to roughly one call every 2h while you're logged in, plus the 6am
// cron, plus any manual Regenerate clicks.
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export async function GET() {
  const supabase = createSupabaseAdmin();
  const latest = await readLatestBriefing(supabase);
  if (latest) {
    const age = Date.now() - new Date(latest.updatedAt).getTime();
    if (age < STALE_AFTER_MS) {
      return NextResponse.json({
        markdown: latest.markdown,
        mock: latest.mock,
        payload: latest.payload,
        date: latest.date,
        source: latest.source,
        cached: true,
        ageMinutes: Math.round(age / 60000),
      });
    }
  }
  // Either no briefing yet, or the latest is stale. Regenerate.
  const fresh = await generateAndPersistBriefing(supabase, { source: 'manual' });
  return NextResponse.json({
    markdown: fresh.markdown,
    mock: fresh.mock,
    payload: fresh.payload,
    date: fresh.date,
    source: fresh.source,
    cached: false,
    ageMinutes: 0,
  });
}
