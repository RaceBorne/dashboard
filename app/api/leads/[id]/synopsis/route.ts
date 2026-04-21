import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getLead, upsertLead, getPlay } from '@/lib/dashboard/repository';
import type { Lead, OrgProfile, RelatedContact } from '@/lib/types';

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
  if (lead.synopsis && lead.orgProfile && !regenerate) {
    return NextResponse.json({
      ok: true,
      synopsis: lead.synopsis,
      orgProfile: lead.orgProfile,
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
    '',
    'AFTER the synopsis, on a new line, emit EXACTLY this delimiter and',
    'then a single JSON object on the next line:',
    '<<<ORG_PROFILE>>>',
    '{',
    '  "orgType": "corporation" | "club" | "nonprofit" | "practice" | "other",',
    '  "employeeCount": number | null,',
    '  "employeeRange": string | null,   // e.g. "11-50" when exact is unknown',
    '  "leaders": [                       // C-suite if corporation, management team if club',
    '    { "name": string, "jobTitle": string, "linkedinUrl": string | null }',
    '  ],',
    '  "sourceNote": string               // 1 short line on how you chose these',
    '}',
    '',
    'Rules for the JSON:',
    '- Return ONLY what you can infer with high confidence from the data above,',
    '  standard web presence for the company, or widely-known public facts.',
    '- Never fabricate names. If leadership is unknown, return leaders: [].',
    '- If org type is unclear, use "other".',
    '- employeeCount OR employeeRange (or both) when known — never both null if',
    '  the company has any public scale signal (LinkedIn band, team page, etc).',
    '- Max 6 leaders. Prefer the most senior (CEO / Founder / President / Head Coach).',
    '- Keep leader jobTitles natural ("CEO", "Co-Founder & CTO", "Head Coach").',
    '- Do NOT wrap the JSON in markdown code fences.',
  ].join('\n');

  let raw = '';
  try {
    raw = (
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

  // Split the model's output into prose synopsis + JSON org profile. The
  // prompt asks for a '<<<ORG_PROFILE>>>' delimiter on its own line; be
  // forgiving about whitespace and markdown fences in case the model drifts.
  const delimIdx = raw.indexOf('<<<ORG_PROFILE>>>');
  const synopsis = (delimIdx >= 0 ? raw.slice(0, delimIdx) : raw).trim();
  let orgProfile: OrgProfile | undefined;
  if (delimIdx >= 0) {
    const jsonRaw = raw.slice(delimIdx + '<<<ORG_PROFILE>>>'.length).trim();
    // Strip a leading/trailing ``` fence if the model emitted one.
    const cleaned = jsonRaw
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    try {
      const parsed = JSON.parse(cleaned) as {
        orgType?: OrgProfile['orgType'];
        employeeCount?: number | null;
        employeeRange?: string | null;
        leaders?: Array<{
          name?: string;
          jobTitle?: string;
          linkedinUrl?: string | null;
        }>;
        sourceNote?: string;
      };
      const leaders: RelatedContact[] = Array.isArray(parsed.leaders)
        ? parsed.leaders
            .filter((l): l is { name: string; jobTitle?: string; linkedinUrl?: string | null } =>
              Boolean(l && typeof l.name === 'string' && l.name.trim()))
            .slice(0, 6)
            .map((l) => ({
              name: l.name.trim(),
              jobTitle: l.jobTitle?.trim() || undefined,
              linkedinUrl: l.linkedinUrl?.trim() || undefined,
            }))
        : [];
      orgProfile = {
        orgType: parsed.orgType,
        employeeCount:
          typeof parsed.employeeCount === 'number' ? parsed.employeeCount : undefined,
        employeeRange:
          typeof parsed.employeeRange === 'string' && parsed.employeeRange.trim()
            ? parsed.employeeRange.trim()
            : undefined,
        leaders: leaders.length > 0 ? leaders : undefined,
        sourceNote: parsed.sourceNote?.trim() || undefined,
        generatedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.warn('[synopsis] failed to parse org JSON', err);
    }
  }

  const nowIso = new Date().toISOString();
  const next: Lead = {
    ...lead,
    synopsis,
    synopsisGeneratedAt: nowIso,
    orgProfile: orgProfile ?? lead.orgProfile,
  };
  const saved = await upsertLead(supabase, next);
  if (!saved) {
    return NextResponse.json(
      { ok: false, error: 'Save failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    synopsis,
    orgProfile: orgProfile ?? lead.orgProfile,
    cached: false,
    lead: saved,
  });
}
