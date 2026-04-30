import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/discover/[playId]/block
 *
 * Marks a domain as a no-go and removes it from this play's list. The
 * domain is added to the global dashboard_blocked_domains table so it
 * is excluded from every future Discovery search path: find-similar,
 * the discover-agent, auto-scan, and peer-brain lookups. Idempotent.
 *
 * Body: { domain: string, reason?: string, rowId?: string }
 *
 * If rowId is supplied we delete that exact shortlist row. Otherwise
 * we delete by (play_id, domain) match.
 */

interface Body {
  domain?: string;
  reason?: string;
  rowId?: string;
}

function normalizeDomain(d: string): string {
  return d
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ playId: string }> },
) {
  const { playId } = await params;
  const body = (await req.json().catch(() => ({}))) as Body;
  const domain = normalizeDomain(body.domain ?? '');
  if (!domain) {
    return NextResponse.json({ ok: false, error: 'domain required' }, { status: 400 });
  }

  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  // 1. Add to the global block list. Idempotent on (domain).
  await sb
    .from('dashboard_blocked_domains')
    .upsert(
      {
        domain,
        reason: body.reason ?? null,
        blocked_by_play: playId,
      },
      { onConflict: 'domain', ignoreDuplicates: true },
    );

  // 2. Remove the row from this play's shortlist so it disappears
  //    from the Discovery table immediately. We use status='removed'
  //    rather than DELETE so we have an audit trail; the dashboard
  //    route already filters status='removed' out of the visible list.
  if (body.rowId) {
    await sb
      .from('dashboard_play_shortlist')
      .update({ status: 'removed' })
      .eq('id', body.rowId)
      .eq('play_id', playId);
  } else {
    await sb
      .from('dashboard_play_shortlist')
      .update({ status: 'removed' })
      .eq('play_id', playId)
      .eq('domain', domain);
  }

  return NextResponse.json({ ok: true, domain });
}
