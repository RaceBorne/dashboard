import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay } from '@/lib/dashboard/repository';
import type { Play, PlayScope, PlayStage, PlayStrategy } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/plays/[id]
 *
 * Partial-update a play from either the list view or the detail page.
 *
 * Supported fields:
 *   title     — string, non-empty
 *   brief     — string (one-paragraph "why")
 *   stage     — PlayStage
 *   pinned    — boolean
 *   strategy  — Partial<PlayStrategy>, merged shallowly into existing strategy
 *
 * Richer sub-docs (research, targets, messaging, chat) still go through their
 * own routes so this one stays tight.
 */
const STAGES: PlayStage[] = [
  'idea',
  'researching',
  'building',
  'ready',
  'live',
  'retired',
];

type StrategyPatch = Partial<PlayStrategy>;

interface PatchBody {
  title?: string;
  brief?: string;
  stage?: PlayStage;
  pinned?: boolean;
  strategy?: StrategyPatch;
  category?: string;
  scope?: Partial<PlayScope>;
}

/**
 * GET /api/plays/[id]
 *
 * Fetch the full Play. Used by the client to poll for auto-scan completion
 * so the "Scanning…" pill can self-resolve without a page refresh.
 */
export async function GET(
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
    return NextResponse.json(
      { ok: false, error: 'Play not found' },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, play });
}

export async function PATCH(
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

  const existing = await getPlay(supabase, id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: 'Play not found' },
      { status: 404 },
    );
  }

  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const patch: Partial<Play> = {};
  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t) {
      return NextResponse.json(
        { ok: false, error: 'Title cannot be empty' },
        { status: 400 },
      );
    }
    patch.title = t;
  }
  if (typeof body.brief === 'string') {
    patch.brief = body.brief.trim();
  }
  if (typeof body.stage === 'string') {
    if (!STAGES.includes(body.stage)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid stage' },
        { status: 400 },
      );
    }
    patch.stage = body.stage;
  }
  if (typeof body.pinned === 'boolean') {
    patch.pinned = body.pinned;
  }
  if (typeof body.category === 'string') {
    patch.category = body.category.trim();
  }
  if (body.scope && typeof body.scope === 'object') {
    const incoming = body.scope;
    const base: PlayScope = existing.scope ?? {
      summary: '',
      bullets: [],
      updatedAt: new Date().toISOString(),
    };
    patch.scope = {
      ...base,
      ...(typeof incoming.summary === 'string'
        ? { summary: incoming.summary }
        : {}),
      ...(Array.isArray(incoming.bullets)
        ? { bullets: incoming.bullets.map((b) => String(b)).filter(Boolean) }
        : {}),
      ...(typeof incoming.targetSummary === 'string'
        ? { targetSummary: incoming.targetSummary }
        : {}),
      ...(typeof incoming.sourcedAt === 'string'
        ? { sourcedAt: incoming.sourcedAt }
        : {}),
      ...(typeof incoming.sourcedCount === 'number'
        ? { sourcedCount: incoming.sourcedCount }
        : {}),
      updatedAt: new Date().toISOString(),
    };
  }
  if (body.strategy && typeof body.strategy === 'object') {
    const validated = validateStrategyPatch(body.strategy);
    if ('error' in validated) {
      return NextResponse.json(
        { ok: false, error: validated.error },
        { status: 400 },
      );
    }
    patch.strategy = mergeStrategy(existing.strategy, validated.value);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No editable fields provided' },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const next: Play = {
    ...existing,
    ...patch,
    updatedAt: now,
    activity: [
      ...existing.activity,
      {
        id: `act-${Date.now()}`,
        at: now,
        type:
          patch.stage && patch.stage !== existing.stage
            ? 'stage_change'
            : 'note',
        summary:
          patch.stage && patch.stage !== existing.stage
            ? `Moved to ${patch.stage}`
            : summariseEdit(patch, existing),
      },
    ],
  };

  const { error } = await supabase
    .from('dashboard_plays')
    .update({ payload: next })
    .eq('id', id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, play: next });
}

/**
 * DELETE /api/plays/[id]
 *
 * Hard-delete the venture AND every prospect / lead row that was sourced
 * into it. Rationale (#170): folders in the Discover "Save to folder"
 * picker are derived from the distinct payload.category values across
 * dashboard_leads (tier='prospect'). If we leave those rows alone when
 * a venture is deleted, the user sees ghost folders carrying the deleted
 * venture's prospect counts forever. Cascade keeps the Discover folder
 * list honest.
 *
 * We delete dashboard_leads first so a partial failure leaves the venture
 * intact (and re-running the delete cleans the rest up). The reverse
 * order would orphan rows under a non-existent play if the second step
 * failed. We don't keep a "retired" soft state because the `retired`
 * stage already exists for that — if Craig only wanted to park it, he'd
 * change the stage instead of clicking delete.
 */
export async function DELETE(
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

  // Step 1 — cascade-delete every lead/prospect tied to this venture.
  // Match on payload->>'playId' (jsonb text accessor). Failure here is
  // non-fatal to the venture delete itself; we log but continue, because
  // a stuck cascade should not leave the venture undeletable.
  const { error: cascadeErr, count: cascadeCount } = await supabase
    .from('dashboard_leads')
    .delete({ count: 'exact' })
    .eq('payload->>playId', id);
  if (cascadeErr) {
    console.warn(
      '[plays/delete] cascade delete on dashboard_leads failed for play ' + id,
      cascadeErr,
    );
  }

  // Step 2 — delete the venture itself.
  const { error } = await supabase.from('dashboard_plays').delete().eq('id', id);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    cascadedRows: cascadeCount ?? 0,
  });
}

// --------------------------------------------------------------------------
// Strategy validation + merge — only accept fields that are part of the
// PlayStrategy shape. Arrays get replaced wholesale (not appended) so the UI
// can send the edited list back verbatim.
// --------------------------------------------------------------------------
function validateStrategyPatch(
  input: StrategyPatch,
): { value: StrategyPatch } | { error: string } {
  const out: StrategyPatch = {};
  const strKeys: Array<keyof PlayStrategy> = ['hypothesis', 'sector', 'targetPersona'];
  for (const k of strKeys) {
    if (input[k] !== undefined) {
      if (typeof input[k] !== 'string') {
        return { error: `strategy.${k} must be a string` };
      }
      (out[k] as string) = (input[k] as string).trim();
    }
  }
  const arrStrKeys: Array<keyof PlayStrategy> = [
    'messagingAngles',
    'successMetrics',
    'disqualifiers',
  ];
  for (const k of arrStrKeys) {
    if (input[k] !== undefined) {
      if (!Array.isArray(input[k])) {
        return { error: `strategy.${k} must be an array of strings` };
      }
      const items = (input[k] as unknown[]).map((x) => String(x).trim()).filter(Boolean);
      (out[k] as string[]) = items;
    }
  }
  if (input.weeklyTarget !== undefined) {
    if (input.weeklyTarget === null || input.weeklyTarget === ('' as unknown as number)) {
      out.weeklyTarget = undefined;
    } else {
      const n = Number(input.weeklyTarget);
      if (!Number.isFinite(n) || n < 0) {
        return { error: 'strategy.weeklyTarget must be a non-negative number' };
      }
      out.weeklyTarget = Math.floor(n);
    }
  }
  return { value: out };
}

function mergeStrategy(
  existing: PlayStrategy | undefined,
  patch: StrategyPatch,
): PlayStrategy {
  const base: PlayStrategy = existing ?? {
    hypothesis: '',
    sector: '',
    targetPersona: '',
    messagingAngles: [],
    successMetrics: [],
  };
  return {
    ...base,
    ...patch,
  };
}

function summariseEdit(patch: Partial<Play>, existing: Play): string {
  const bits: string[] = [];
  if (patch.title && patch.title !== existing.title) bits.push('renamed');
  if (patch.brief !== undefined && patch.brief !== existing.brief)
    bits.push('brief edited');
  if (patch.strategy !== undefined) bits.push('strategy edited');
  if (patch.pinned !== undefined && patch.pinned !== existing.pinned)
    bits.push(patch.pinned ? 'pinned' : 'unpinned');
  return bits.length > 0 ? bits.join(' · ') : 'Edited';
}
