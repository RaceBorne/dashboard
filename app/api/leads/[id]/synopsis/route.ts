import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getLead, upsertLead, getPlay } from '@/lib/dashboard/repository';
import type { Lead } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/[id]/synopsis
 *
 * Generates a ~100-word synopsis of the company/person/opportunity using the
 * enrichment fields already on the Lead row. Idempotent-ish: if a synopsis
 * already exists, returns it unless `?regenerate=1`.
 *
 * Called lazily on first open of a Prospect/Lead detail from the CRM UI.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const regenerate = url.searchParams.get('regenerate') === '1';

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }
  const lead = await getLead(supabase, id);
  if (!lead) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });
  }
  if (lead.synopsis && !regenerate) {
    return NextResponse.json({
      ok: true,
      synopsis: lead.synopsis,
      cached: true,
      lead,
    });
  }
  if (!hasAIGatewayCredentials()) {
    return NextResponse.json(
      { ok: false, error: 'AI gateway not configured' },
      { status: 500 },
    );
  }

  // Pull the parent Play for category/strategy context when available.
  const play = lead.playId ? await getPlay(supabase, lead.playId) : undefined;

  const related =
    lead.relatedContacts && lead.relatedContacts.length > 0
      ? lead.relatedContacts
          .map(
            (c) =>
              '- ' +
              c.name +
              (c.jobTitle ? ' (' + c.jobTitle + ')' : '') +
              (c.email ? ' — ' + c.email : ''),
          )
          .join('\n')
      : '(none)';

  const prompt = [
    'You are writing a short, factual synopsis of a sales prospect for the',
    'Evari outreach operator. Be concrete and compressed. 90-120 words.',
    'No sales language, no flattery, no filler. Plain prose, no bullets.',
    '',
    'Prospect:',
    '- Name: ' + lead.fullName,
    '- Job title: ' + (lead.jobTitle ?? '(unknown)'),
    '- Company: ' + (lead.companyName ?? '(unknown)'),
    '- Company URL: ' + (lead.companyUrl ?? '(unknown)'),
    '- LinkedIn: ' + (lead.linkedinUrl ?? '(unknown)'),
    '- Address: ' + (lead.address ?? '(unknown)'),
    '- Email: ' + (lead.email || '(unknown)'),
    '',
    'Related contacts:',
    related,
    '',
    'Play context:',
    play
      ? '- Play: ' +
        play.title +
        ' (' +
        (play.category ?? play.title) +
        ')\n' +
        (play.scope?.summary ? '- Scope: ' + play.scope.summary : '') +
        (play.strategy?.hypothesis
          ? '\n- Hypothesis: ' + play.strategy.hypothesis
          : '')
      : '(no play linked)',
    '',
    'Write the synopsis now. Cover: what the company does, where they are,',
    'their likely buying trigger given the Play context, and whether the',
    'named person or a related contact is the right decision-maker to email.',
  ].join('\n');

  let synopsis = '';
  try {
    synopsis = (
      await generateBriefing({
        task: 'lead-synopsis',
        voice: 'analyst',
        prompt,
      })
    ).trim();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'AI call failed: ' + (err as Error).message },
      { status: 502 },
    );
  }

  const nowIso = new Date().toISOString();
  const next: Lead = {
    ...lead,
    synopsis,
    synopsisGeneratedAt: nowIso,
  };
  const saved = await upsertLead(supabase, next);
  if (!saved) {
    return NextResponse.json(
      { ok: false, error: 'Save failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, synopsis, cached: false, lead: saved });
}
