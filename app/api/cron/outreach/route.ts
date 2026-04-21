import { NextResponse } from 'next/server';
import { POST as replyScanPOST } from '@/app/api/agent/reply-scan/route';
import { POST as followUpsPOST } from '@/app/api/agent/follow-ups/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Outreach cron — fires on the vercel.json schedule.
 *
 * Two sequential passes:
 *   1. reply-scan — pulls Gmail threads for every sent draft, classifies
 *      new inbound replies, updates prospects + suppressions.
 *   2. follow-ups — for drafts that didn't get a reply, queues the next
 *      cadence touch as a new draft (status='draft', still awaits Craig).
 *
 * We call the POST handlers with synthetic Requests instead of refactoring
 * them into shared helpers — the handlers already read only `req.json()` and
 * return `NextResponse`, so this is a thin delegation layer that keeps the
 * cron endpoint honest while avoiding a larger refactor.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const steps: Record<string, unknown> = {};

  // 1. Scan for replies first — classifying a positive reply today should
  //    take that draft out of the follow-up pool on the same run.
  try {
    const res = await replyScanPOST(syntheticPost({ limit: 200 }));
    steps.replyScan = await safeJson(res);
  } catch (err) {
    steps.replyScan = { ok: false, error: errMessage(err) };
  }

  // 2. Queue any follow-ups that are now due.
  try {
    const res = await followUpsPOST(syntheticPost({ limit: 50 }));
    steps.followUps = await safeJson(res);
  } catch (err) {
    steps.followUps = { ok: false, error: errMessage(err) };
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    steps,
  });
}

function syntheticPost(body: Record<string, unknown>): Request {
  return new Request('http://internal/cron', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.clone().json();
  } catch {
    return { status: res.status };
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
