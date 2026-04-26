/**
 * Segmentation engine — saved sets of rules that resolve to a list of
 * contact ids on demand. The `rules` jsonb column on
 * dashboard_mkt_segments holds a SegmentRuleSet (discriminated union
 * defined in types.ts).
 *
 * Evaluation strategy:
 *   - For each rule, compute the set of contact_ids that match.
 *   - Combine all per-rule sets via the chosen combinator (AND →
 *     intersect, OR → union).
 *   - Return the final contact id list.
 *
 * Per-rule queries hit the relevant table directly (no per-contact
 * loops). For now we run them serially-but-async; for large rule
 * counts this stays well under typical request budgets. If we ever
 * need to scale we can switch to Promise.all and merge.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  ContactStatus,
  Segment,
  SegmentEvaluation,
  SegmentRule,
  SegmentRuleSet,
} from './types';

interface SegmentRow {
  id: string;
  name: string;
  rules: SegmentRuleSet | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_RULESET: SegmentRuleSet = { combinator: 'and', rules: [] };

function rowToSegment(row: SegmentRow): Segment {
  return {
    id: row.id,
    name: row.name,
    rules: row.rules ?? DEFAULT_RULESET,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────

export async function listSegments(): Promise<Segment[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_mkt_segments')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('[marketing.listSegments]', error);
    return [];
  }
  return (data ?? []).map(rowToSegment);
}

export async function getSegment(id: string): Promise<Segment | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_segments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[marketing.getSegment]', error);
    return null;
  }
  return data ? rowToSegment(data) : null;
}

export async function createSegment(input: {
  name: string;
  rules: SegmentRuleSet;
}): Promise<Segment | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_segments')
    .insert({
      name: input.name.trim(),
      rules: input.rules ?? DEFAULT_RULESET,
    })
    .select('*')
    .single();
  if (error) {
    console.error('[marketing.createSegment]', error);
    return null;
  }
  return rowToSegment(data);
}

export async function updateSegment(
  id: string,
  patch: Partial<{ name: string; rules: SegmentRuleSet }>,
): Promise<Segment | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const dbPatch: Record<string, unknown> = {};
  if ('name' in patch && patch.name) dbPatch.name = patch.name.trim();
  if ('rules' in patch && patch.rules) dbPatch.rules = patch.rules;
  if (Object.keys(dbPatch).length === 0) return getSegment(id);
  const { data, error } = await sb
    .from('dashboard_mkt_segments')
    .update(dbPatch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[marketing.updateSegment]', error);
    return null;
  }
  return rowToSegment(data);
}

export async function deleteSegment(id: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  if (!sb) return false;
  const { error } = await sb
    .from('dashboard_mkt_segments')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('[marketing.deleteSegment]', error);
    return false;
  }
  return true;
}

// ─── Engine ───────────────────────────────────────────────────────

/**
 * Resolve a single rule to the set of contact_ids that match it.
 * Uses a Set so caller-side combinator logic stays cheap.
 */
async function evaluateRule(rule: SegmentRule): Promise<Set<string>> {
  const sb = createSupabaseAdmin();
  if (!sb) return new Set();

  switch (rule.type) {
    case 'group': {
      if (!rule.groupIds || rule.groupIds.length === 0) return new Set();
      const { data, error } = await sb
        .from('dashboard_mkt_contact_groups')
        .select('contact_id')
        .in('group_id', rule.groupIds);
      if (error) {
        console.error('[marketing.evaluateRule group]', error);
        return new Set();
      }
      return new Set((data ?? []).map((r) => (r as { contact_id: string }).contact_id));
    }
    case 'tag': {
      if (!rule.tagIds || rule.tagIds.length === 0) return new Set();
      const { data, error } = await sb
        .from('dashboard_mkt_contact_tags')
        .select('contact_id')
        .in('tag_id', rule.tagIds);
      if (error) {
        console.error('[marketing.evaluateRule tag]', error);
        return new Set();
      }
      return new Set((data ?? []).map((r) => (r as { contact_id: string }).contact_id));
    }
    case 'status': {
      const { data, error } = await sb
        .from('dashboard_mkt_contacts')
        .select('id')
        .eq('status', rule.status as ContactStatus);
      if (error) {
        console.error('[marketing.evaluateRule status]', error);
        return new Set();
      }
      return new Set((data ?? []).map((r) => (r as { id: string }).id));
    }
    case 'event': {
      if (!rule.eventType || !Number.isFinite(rule.days) || rule.days <= 0) {
        return new Set();
      }
      const cutoff = new Date(Date.now() - rule.days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await sb
        .from('dashboard_mkt_events')
        .select('contact_id')
        .eq('type', rule.eventType)
        .gte('created_at', cutoff);
      if (error) {
        console.error('[marketing.evaluateRule event]', error);
        return new Set();
      }
      // De-dupe — a single contact will usually have many matching events
      return new Set((data ?? []).map((r) => (r as { contact_id: string }).contact_id));
    }
    default: {
      // Future rule types land here. Returning empty set is the safe
      // default — never matches anyone, so AND-combined sets stay
      // empty, OR-combined sets are unaffected.
      return new Set();
    }
  }
}

/** Intersect a list of sets. Empty input → empty set. */
function intersectAll(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  const sorted = [...sets].sort((a, b) => a.size - b.size);
  const seed = new Set(sorted[0]);
  for (let i = 1; i < sorted.length; i++) {
    const other = sorted[i];
    for (const id of seed) {
      if (!other.has(id)) seed.delete(id);
    }
    if (seed.size === 0) break;
  }
  return seed;
}

/** Union a list of sets. */
function unionAll(sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const s of sets) for (const id of s) out.add(id);
  return out;
}

/**
 * Evaluate a rule set without persisting anything. Used both for the
 * 'preview' endpoint (test rules before saving) and by the saved
 * segment evaluator below.
 *
 * Empty rules array → returns ALL active contacts (sane default for
 * 'no filters set'). Caller can override with a status rule if they
 * want unsubscribed/suppressed too.
 */
export async function evaluateRuleSet(
  ruleSet: SegmentRuleSet,
): Promise<SegmentEvaluation> {
  if (!ruleSet.rules || ruleSet.rules.length === 0) {
    const sb = createSupabaseAdmin();
    if (!sb) return { contactIds: [], count: 0 };
    const { data, error } = await sb
      .from('dashboard_mkt_contacts')
      .select('id')
      .eq('status', 'active');
    if (error) {
      console.error('[marketing.evaluateRuleSet defaultAll]', error);
      return { contactIds: [], count: 0 };
    }
    const ids = (data ?? []).map((r) => (r as { id: string }).id);
    return { contactIds: ids, count: ids.length };
  }
  const sets: Set<string>[] = [];
  for (const rule of ruleSet.rules) {
    sets.push(await evaluateRule(rule));
  }
  const final = ruleSet.combinator === 'or' ? unionAll(sets) : intersectAll(sets);
  const ids = [...final];
  return { contactIds: ids, count: ids.length };
}

export async function evaluateSegment(id: string): Promise<SegmentEvaluation | null> {
  const segment = await getSegment(id);
  if (!segment) return null;
  return evaluateRuleSet(segment.rules);
}
