import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/discover/[playId]/add-peer
 *
 * Inserts a single peer suggestion (from the Similar tab in the
 * Discovery drawer) into the play's list. Body shape:
 *   { domain, name, why?, status: 'candidate' | 'shortlisted' }
 *
 * - status: 'candidate'    -> "Add to list"
 * - status: 'shortlisted'  -> "Send to shortlist" (also lands in the
 *                             list if it wasn't already there)
 *
 * Idempotent on (play_id, domain): if the row already exists, we
 * promote/update its status if the new status is "stronger" than the
 * current one. Returns the row id either way.
 */

interface Body {
  domain?: string;
  name?: string;
  why?: string;
  status?: 'candidate' | 'shortlisted';
  industry?: string | null;
  location?: string | null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ playId: string }> },
) {
  const { playId } = await params;
  const body = (await req.json().catch(() => ({}))) as Body;
  const domain = (body.domain ?? '').trim().toLowerCase();
  const status = body.status === 'shortlisted' ? 'shortlisted' : 'candidate';
  if (!domain) {
    return NextResponse.json({ ok: false, error: 'domain required' }, { status: 400 });
  }

  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  // Look up existing row first so we can decide insert vs promote.
  const { data: existing } = await sb
    .from('dashboard_play_shortlist')
    .select('id, status')
    .eq('play_id', playId)
    .eq('domain', domain)
    .maybeSingle();

  if (existing) {
    // Only PATCH the status when promoting (candidate -> shortlisted).
    // Don't downgrade or churn.
    if (status === 'shortlisted' && existing.status !== 'shortlisted') {
      const { error } = await sb
        .from('dashboard_play_shortlist')
        .update({ status: 'shortlisted' })
        .eq('id', existing.id);
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, id: existing.id, status: 'shortlisted', existed: true });
    }
    return NextResponse.json({ ok: true, id: existing.id, status: existing.status ?? 'candidate', existed: true });
  }

  // No existing row, insert fresh.
  const { data: inserted, error } = await sb
    .from('dashboard_play_shortlist')
    .insert({
      play_id: playId,
      domain,
      name: body.name ?? domain,
      industry: body.industry ?? null,
      location: body.location ?? null,
      description: body.why ? body.why : null,
      fit_score: 60,
      fit_band: 'good',
      logo_url: 'https://logo.clearbit.com/' + domain,
      status,
    })
    .select('id')
    .single();
  if (error || !inserted) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'insert failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: inserted.id, status, existed: false });
}
