/**
 * POST /api/marketing/groups/combine
 *
 *   body { sourceIds: string[], operation: 'union'|'intersection'|'subtract', name: string,
 *          subtractFromId?: string  // required when operation === 'subtract' }
 *
 * Materialises a set operation across multiple existing groups into a
 * fresh group. Approved-only memberships are read from each source
 * (suppressed/pending are excluded), the result set is computed, and a
 * new dashboard_mkt_groups row is created with all members at
 * status='approved' / source='combine_<operation>'.
 *
 *   union          → contacts in ANY of the source groups
 *   intersection   → contacts in ALL of the source groups
 *   subtract       → contacts in subtractFromId minus those in the others
 */

import { NextResponse } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { createGroup } from '@/lib/marketing/groups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Op = 'union' | 'intersection' | 'subtract';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { sourceIds?: unknown; operation?: unknown; name?: unknown; subtractFromId?: unknown } | null;
  const sourceIds = Array.isArray(body?.sourceIds)
    ? (body!.sourceIds as unknown[]).filter((x) => typeof x === 'string') as string[]
    : [];
  const operation = (typeof body?.operation === 'string' ? body.operation : '') as Op;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const subtractFromId = typeof body?.subtractFromId === 'string' ? body.subtractFromId : null;
  if (sourceIds.length < 2) return NextResponse.json({ ok: false, error: 'Need at least 2 source lists' }, { status: 400 });
  if (!['union', 'intersection', 'subtract'].includes(operation)) {
    return NextResponse.json({ ok: false, error: 'Invalid operation' }, { status: 400 });
  }
  if (!name) return NextResponse.json({ ok: false, error: 'Name required' }, { status: 400 });
  if (operation === 'subtract' && !subtractFromId) {
    return NextResponse.json({ ok: false, error: 'subtractFromId required for subtract' }, { status: 400 });
  }

  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  // Fetch every (group_id, contact_id) row for the selected groups
  // in one query. Approved memberships only.
  const { data: rows, error: readErr } = await sb
    .from('dashboard_mkt_contact_groups')
    .select('group_id, contact_id')
    .in('group_id', sourceIds)
    .eq('status', 'approved');
  if (readErr) {
    console.error('[mkt.groups.combine read]', readErr);
    return NextResponse.json({ ok: false, error: 'Read failed' }, { status: 500 });
  }
  type Row = { group_id: string; contact_id: string };
  // Bucket by group so set-ops are easy.
  const byGroup = new Map<string, Set<string>>();
  for (const r of (rows as Row[])) {
    const set = byGroup.get(r.group_id) ?? new Set<string>();
    set.add(r.contact_id);
    byGroup.set(r.group_id, set);
  }

  // Compute the result set per operation.
  let resultIds: string[] = [];
  if (operation === 'union') {
    const u = new Set<string>();
    for (const id of sourceIds) {
      for (const c of (byGroup.get(id) ?? [])) u.add(c);
    }
    resultIds = [...u];
  } else if (operation === 'intersection') {
    // Start with the smallest set, intersect with the rest.
    const sets = sourceIds.map((id) => byGroup.get(id) ?? new Set<string>());
    sets.sort((a, b) => a.size - b.size);
    const seed = sets[0];
    if (!seed) {
      resultIds = [];
    } else {
      const acc = new Set<string>(seed);
      for (let i = 1; i < sets.length; i++) {
        for (const x of acc) if (!sets[i]!.has(x)) acc.delete(x);
      }
      resultIds = [...acc];
    }
  } else if (operation === 'subtract') {
    const base = byGroup.get(subtractFromId!) ?? new Set<string>();
    const others = sourceIds.filter((id) => id !== subtractFromId);
    const blocked = new Set<string>();
    for (const id of others) for (const c of (byGroup.get(id) ?? [])) blocked.add(c);
    resultIds = [...base].filter((c) => !blocked.has(c));
  }

  // Create the destination group + insert membership rows.
  const newGroup = await createGroup({ name, description: `Created via ${operation} from ${sourceIds.length} list${sourceIds.length === 1 ? '' : 's'}` });
  if (!newGroup) return NextResponse.json({ ok: false, error: 'Could not create group' }, { status: 500 });
  if (resultIds.length > 0) {
    const insert = resultIds.map((cid) => ({
      group_id: newGroup.id,
      contact_id: cid,
      status: 'approved',
      added_by_source: `combine_${operation}`,
    }));
    const { error: insErr } = await sb.from('dashboard_mkt_contact_groups').insert(insert);
    if (insErr) {
      console.error('[mkt.groups.combine insert]', insErr);
      // Don't roll back the empty group — the operator can retry from the UI.
    }
  }
  return NextResponse.json({ ok: true, group: newGroup, memberCount: resultIds.length });
}
