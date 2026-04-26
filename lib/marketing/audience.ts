/**
 * Unified read for the Lists & Segments page. Returns groups and
 * segments together, with live member counts so the explorer table
 * can render Klaviyo-style with one round-trip's worth of data.
 *
 * Member counts:
 *   group   → count of dashboard_mkt_contact_groups rows for the id
 *   segment → evaluateSegment(id).contactIds.length (run server-side)
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listGroups } from './groups';
import { listSegments, evaluateSegment } from './segments';
import type { Group, Segment } from './types';

export type AudienceEntryKind = 'group' | 'segment';

export interface AudienceEntry {
  id: string;
  kind: AudienceEntryKind;
  name: string;
  description: string | null;
  members: number;
  createdAt: string;
  updatedAt: string;
}

export interface AudienceBundle {
  entries: AudienceEntry[];
  totals: { lists: number; segments: number };
}

async function countGroupMembers(id: string): Promise<number> {
  const sb = createSupabaseAdmin();
  if (!sb) return 0;
  const { count, error } = await sb
    .from('dashboard_mkt_contact_groups')
    .select('contact_id', { count: 'exact', head: true })
    .eq('group_id', id);
  if (error) {
    console.error('[mkt.audience.countGroup]', error);
    return 0;
  }
  return count ?? 0;
}

export async function loadAudienceBundle(): Promise<AudienceBundle> {
  const [groups, segments] = await Promise.all([listGroups(), listSegments()]);

  // Run member counts in parallel — N small queries beats one giant join here
  // and keeps the segment evaluator path identical to send-time (so what you
  // see in the table is what the campaign would target).
  const groupCounts = await Promise.all((groups as Group[]).map((g) => countGroupMembers(g.id)));
  const segmentCounts = await Promise.all((segments as Segment[]).map(async (s) => {
    const ev = await evaluateSegment(s.id);
    return ev?.contactIds.length ?? 0;
  }));

  const entries: AudienceEntry[] = [
    ...(groups as Group[]).map((g, i) => ({
      id: g.id,
      kind: 'group' as const,
      name: g.name,
      description: g.description ?? null,
      members: groupCounts[i] ?? 0,
      createdAt: g.createdAt,
      updatedAt: g.createdAt,
    })),
    ...(segments as Segment[]).map((s, i) => ({
      id: s.id,
      kind: 'segment' as const,
      name: s.name,
      description: null,
      members: segmentCounts[i] ?? 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  ].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));

  return {
    entries,
    totals: { lists: groups.length, segments: segments.length },
  };
}
