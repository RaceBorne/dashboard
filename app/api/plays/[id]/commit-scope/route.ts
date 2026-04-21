import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay } from '@/lib/dashboard/repository';
import type { Play, PlayScope } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/plays/[id]/commit-scope
 *
 * Given the Play's brief + committed strategy, asks Claude to emit a
 * PlayScope: a summary paragraph + bulleted operational plan describing how
 * we go to market and who we contact. Saves scope onto the Play.
 */
export async function POST(
  _req: Request,
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
  if (!play.strategy) {
    return NextResponse.json(
      { ok: false, error: 'Commit a strategy before converting to scope' },
      { status: 400 },
    );
  }
  if (!hasAIGatewayCredentials()) {
    return NextResponse.json(
      { ok: false, error: 'AI gateway not configured' },
      { status: 500 },
    );
  }

  const prompt = [
    'You are writing a PlayScope: the operational plan for an outreach Play.',
    'Be concrete, short, and written for the operator running the Play.',
    '',
    'Play title: ' + play.title,
    'Category: ' + (play.category ?? play.title),
    'Brief: ' + play.brief,
    '',
    'Committed strategy:',
    JSON.stringify(play.strategy, null, 2),
    '',
    'Emit a single JSON object with exactly these keys:',
    '{',
    '  "summary": string,            // one short paragraph: how we go to market',
    '  "bullets": string[],          // 4-8 ordered bullets: who we contact, in what sequence, with what message',
    '  "targetSummary": string       // one line: who we contact (sector, role, rough volume)',
    '}',
    '',
    'Return raw JSON only — no prose, no markdown fences.',
  ].join('\n');

  let markdown = '';
  try {
    markdown = await generateBriefing({
      task: 'play-commit-scope',
      voice: 'analyst',
      prompt,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'AI call failed: ' + (err as Error).message },
      { status: 502 },
    );
  }

  const scope = parseScope(markdown);
  if (!scope) {
    return NextResponse.json(
      { ok: false, error: 'Could not parse scope JSON from AI response' },
      { status: 502 },
    );
  }

  const now = new Date().toISOString();
  const nextScope: PlayScope = {
    ...(play.scope ?? {}),
    summary: scope.summary ?? play.scope?.summary ?? '',
    bullets: scope.bullets ?? play.scope?.bullets ?? [],
    targetSummary: scope.targetSummary ?? play.scope?.targetSummary,
    updatedAt: now,
  };

  const next: Play = {
    ...play,
    scope: nextScope,
    updatedAt: now,
    activity: [
      ...play.activity,
      {
        id: 'act-' + Date.now(),
        at: now,
        type: 'note',
        summary: 'Scope generated from Strategy',
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
  return NextResponse.json({ ok: true, play: next });
}

function parseScope(raw: string): Partial<PlayScope> | undefined {
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (!parsed || typeof parsed !== 'object') return undefined;
    const p = parsed as Record<string, unknown>;
    const bullets = Array.isArray(p.bullets)
      ? p.bullets.map((x) => String(x)).filter(Boolean)
      : undefined;
    return {
      summary: typeof p.summary === 'string' ? p.summary : undefined,
      bullets,
      targetSummary:
        typeof p.targetSummary === 'string' ? p.targetSummary : undefined,
    };
  } catch {
    return undefined;
  }
}
