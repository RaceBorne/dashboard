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
  // 'play' (default) blocks the domain only inside this venture.
  // 'global' blocks it across every venture and every search path.
  scope?: 'play' | 'global';
  // The friendly name of the rejected company; combined with reason
  // when stored so the find-similar prompt can surface a useful
  // negative-example string.
  rejectedName?: string;
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

  // 1. Add to the block list. Default scope is per-play (only this
  //    venture hides the domain) so the same brand can stay relevant
  //    in another venture's brief. Pass scope='global' to opt into a
  //    site-wide block.
  const scope = body.scope === 'global' ? 'global' : 'play';
  const playScope = scope === 'global' ? null : playId;

  // Idempotent: do nothing if the same (domain, scope) row already
  // exists. We can't rely on a single onConflict here because of the
  // partial unique indices, so do an explicit existence check.
  const { data: existing } = await sb
    .from('dashboard_blocked_domains')
    .select('id')
    .eq('domain', domain)
    .is('play_id', playScope === null ? null : null) // workaround for typed client
    .limit(1);
  // Manual existence check across scopes since postgrest .is('play_id', uuid) is awkward.
  let alreadyBlocked = false;
  if (playScope === null && existing && existing.length > 0) {
    alreadyBlocked = true;
  } else {
    const { data: scoped } = await sb
      .from('dashboard_blocked_domains')
      .select('id')
      .eq('domain', domain)
      .eq('play_id', playScope ?? '')
      .limit(1);
    if (scoped && scoped.length > 0) alreadyBlocked = true;
  }
  if (!alreadyBlocked) {
    // Store name + reason together so the find-similar prompt can
    // render a clean negative-example line. Name first because it
    // anchors the example, reason second to give the why.
    const composedReason = [body.rejectedName, body.reason]
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .join(' — ');
    await sb
      .from('dashboard_blocked_domains')
      .insert({
        domain,
        reason: composedReason || null,
        play_id: playScope,
      });
  }

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
