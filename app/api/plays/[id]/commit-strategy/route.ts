import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay } from '@/lib/dashboard/repository';
import { autoScanForPlay } from '@/lib/brand/autoScan';
import type { Play, PlayStrategy } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// after() keeps the lambda alive so autoScan (AI plan + DataForSEO
// fetch) can finish. Need headroom: AI ~5s + DataForSEO ~5s + DB writes.
export const maxDuration = 60;

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * POST /api/plays/[id]/commit-strategy
 *
 * Reads the Play's brief + recent Spitball chat and asks Claude to emit a
 * structured PlayStrategy. Merges the result into play.strategy.
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

  const body = (await req.json().catch(() => ({}))) as { history?: ChatEntry[] };
  const chat: ChatEntry[] =
    body.history && Array.isArray(body.history) && body.history.length > 0
      ? body.history
      : play.chat.map((m) => ({ role: m.role, content: m.content }));

  if (!hasAIGatewayCredentials()) {
    return NextResponse.json(
      { ok: false, error: 'AI gateway not configured' },
      { status: 500 },
    );
  }

  const prompt = [
    'You are turning a Spitball chat transcript into a committed PlayStrategy.',
    '',
    'Play title: ' + play.title,
    'Brief: ' + play.brief,
    '',
    'Existing strategy (may be empty):',
    JSON.stringify(play.strategy ?? {}, null, 2),
    '',
    'Chat transcript (most recent last):',
    chat.map((m) => '[' + m.role + ']: ' + m.content).join('\n\n'),
    '',
    'Emit a single JSON object with exactly these keys:',
    '{',
    '  "hypothesis": string,          // one-sentence why now',
    '  "sector": string,              // market or sector label',
    '  "targetPersona": string,       // the job title we actually email',
    '  "messagingAngles": string[],   // 1-3 angles to test',
    '  "weeklyTarget": number,        // new prospects per week',
    '  "successMetrics": string[],    // 1-3 measurable outcomes',
    '  "disqualifiers": string[],     // reasons not to contact an otherwise-matching lead',
    '  "strategyShort": string        // 30-40 words max; plain sentence describing who we target and why, used verbatim as a Discover search prompt',
    '}',
    '',
    'Return raw JSON only — no prose, no markdown fences.',
  ].join('\n');

  let markdown = '';
  try {
    markdown = await generateBriefing({
      task: 'play-commit-strategy',
      voice: 'analyst',
      prompt,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'AI call failed: ' + (err as Error).message },
      { status: 502 },
    );
  }

  const parsed = parseStrategy(markdown);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: 'Could not parse strategy JSON from AI response' },
      { status: 502 },
    );
  }

  const now = new Date().toISOString();
  const next: Play = {
    ...play,
    strategy: { ...(play.strategy ?? {}), ...parsed.strategy },
    strategyShort: parsed.strategyShort ?? play.strategyShort,
    updatedAt: now,
    activity: [
      ...play.activity,
      {
        id: 'act-' + Date.now(),
        at: now,
        type: 'note',
        summary: 'Strategy committed from Spitball',
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

  // Kick off the discovery auto-scan in the background. The user is
  // about to be routed to /discover and will see candidates trickle in
  // as DataForSEO returns. Non-blocking — any error is logged, not
  // surfaced, because the strategy commit itself already succeeded.
  after(async () => {
    console.log('[commit-strategy] autoScan kickoff start id=' + id);
    try {
      const adminAfter = createSupabaseAdmin();
      if (!adminAfter) {
        console.warn('[commit-strategy] autoScan: no admin client');
        return;
      }
      const result = await autoScanForPlay(adminAfter, next);
      console.log(
        '[commit-strategy] autoScan done id=' + id +
        ' inserted=' + result.inserted +
        ' found=' + result.found +
        ' agent=' + result.agent +
        (result.skipReason ? ' skip=' + result.skipReason : ''),
      );
    } catch (err) {
      console.warn('[commit-strategy] autoScan kickoff failed id=' + id, err);
    }
  });

  return NextResponse.json({ ok: true, play: next });
}

function parseStrategy(raw: string): { strategy: PlayStrategy; strategyShort?: string } | undefined {
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (!parsed || typeof parsed !== 'object') return undefined;
    const p = parsed as Record<string, unknown>;
    const asStrArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
    const out: PlayStrategy = {
      hypothesis: typeof p.hypothesis === 'string' ? p.hypothesis : '',
      sector: typeof p.sector === 'string' ? p.sector : '',
      targetPersona: typeof p.targetPersona === 'string' ? p.targetPersona : '',
      messagingAngles: asStrArray(p.messagingAngles),
      weeklyTarget: typeof p.weeklyTarget === 'number' ? p.weeklyTarget : undefined,
      successMetrics: asStrArray(p.successMetrics),
      disqualifiers: asStrArray(p.disqualifiers),
    };
    const strategyShort =
      typeof p.strategyShort === 'string' ? p.strategyShort.trim() : '';
    return { strategy: out, strategyShort: strategyShort || undefined };
  } catch {
    return undefined;
  }
}
