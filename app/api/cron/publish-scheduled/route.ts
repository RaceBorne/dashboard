import { NextResponse } from 'next/server';

import { publishDraft } from '@/lib/journals/publish';
import { listDueScheduledDrafts } from '@/lib/journals/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Departure Lounge cron — fires on the vercel.json schedule.
 *
 * Finds journal drafts where `scheduled_for <= now()` and
 * `shopify_article_id IS NULL`, then runs the same publishDraft()
 * flow as the manual Publish button. On success the draft picks up
 * `shopify_article_id` and `published_at`, so it leaves the
 * Departure Lounge lane and lands in Published the next time the
 * Journals page refreshes.
 *
 * Auth: Vercel cron requests carry `Authorization: Bearer
 * $CRON_SECRET`. When CRON_SECRET is unset (local dev) we let the
 * request through so a curl can fire it for testing.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  // Cap each run so a backlog can't blow past Vercel's serverless
  // budget. The cron runs every five minutes, so 25 per run gives
  // 300 publishes/hour of headroom.
  const due = await listDueScheduledDrafts({ limit: 25 });

  const results: Array<{
    id: string;
    title: string;
    scheduledFor: string | null;
    ok: boolean;
    articleId?: string;
    error?: string;
    dryRun?: boolean;
  }> = [];

  for (const draft of due) {
    try {
      const res = await publishDraft(draft, { isPublished: true });
      if (res.ok) {
        results.push({
          id: draft.id,
          title: draft.title,
          scheduledFor: draft.scheduledFor,
          ok: true,
          articleId: res.article?.id,
          dryRun: res.dryRun,
        });
      } else {
        results.push({
          id: draft.id,
          title: draft.title,
          scheduledFor: draft.scheduledFor,
          ok: false,
          error: res.error,
        });
      }
    } catch (err) {
      results.push({
        id: draft.id,
        title: draft.title,
        scheduledFor: draft.scheduledFor,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    considered: due.length,
    published: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
