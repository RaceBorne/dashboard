import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay, upsertLead } from '@/lib/dashboard/repository';
import type { Lead, Play } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/plays/[id]/source-prospects
 *
 * Stub for the Source Prospects agent. Today: accepts an optional
 * `{ candidates: Partial<Lead>[] }` body and writes each as a Lead row with
 * tier='prospect' + category=play.category. This lets the Scope panel's
 * button work end-to-end with a paste-list or a test harness while the
 * DataForSEO+enrichment pipeline lands in a follow-up (task #55).
 *
 * Wire the real agent here when ready — same endpoint, same response shape.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }
  const play = await getPlay(supabase, id);
  if (!play) {
    return NextResponse.json({ ok: false, error: 'Play not found' }, { status: 404 });
  }
  if (!play.scope) {
    return NextResponse.json(
      { ok: false, error: 'Convert the strategy to a scope before sourcing prospects' },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    candidates?: Array<Partial<Lead>>;
  };
  const rawCandidates = Array.isArray(body.candidates) ? body.candidates : [];
  const cap = 500;
  const candidates = rawCandidates.slice(0, cap);

  const nowIso = new Date().toISOString();
  const category = play.category ?? play.title;

  let inserted = 0;
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    const lead: Lead = {
      id: c.id ?? 'prospect-' + Math.random().toString(36).slice(2, 12),
      fullName: (c.fullName ?? '').toString().trim() || 'Unknown contact',
      email: (c.email ?? '').toString().trim(),
      phone: c.phone,
      companyName: c.companyName,
      companyUrl: c.companyUrl,
      jobTitle: c.jobTitle,
      linkedinUrl: c.linkedinUrl,
      address: c.address,
      emailInferred: c.emailInferred === true,
      relatedContacts: c.relatedContacts,
      source: 'outreach_agent',
      sourceCategory: 'outreach',
      sourceDetail: 'Play: ' + play.title,
      stage: 'new',
      intent: 'unknown',
      firstSeenAt: nowIso,
      lastTouchAt: nowIso,
      tags: [],
      activity: [],
      tier: 'prospect',
      category,
      playId: play.id,
      prospectStatus: 'pending',
    };
    const out = await upsertLead(supabase, lead);
    if (out) inserted += 1;
  }

  const nextScope = {
    ...(play.scope ?? { summary: '', bullets: [], updatedAt: nowIso }),
    sourcedAt: nowIso,
    sourcedCount: (play.scope?.sourcedCount ?? 0) + inserted,
    updatedAt: nowIso,
  };
  const next: Play = {
    ...play,
    scope: nextScope,
    updatedAt: nowIso,
    activity: [
      ...play.activity,
      {
        id: 'act-' + Date.now(),
        at: nowIso,
        type: 'note',
        summary:
          inserted > 0
            ? 'Source Prospects: ' + inserted + ' row(s) added to funnel "' + category + '"'
            : 'Source Prospects triggered (no candidates supplied — agent stub)',
      },
    ],
  };
  const { error } = await supabase
    .from('dashboard_plays')
    .update({ payload: next })
    .eq('id', id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    play: next,
    inserted,
    agent: 'stub',
    note:
      inserted === 0
        ? 'Source Prospects is currently a stub. POST { candidates: Partial<Lead>[] } to seed rows manually until the DataForSEO+enrichment agent ships.'
        : undefined,
  });
}
