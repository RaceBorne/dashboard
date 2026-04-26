/**
 * Groups repository — wraps dashboard_mkt_groups. Service-role only.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { Group } from './types';

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

function rowToGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
  };
}

export async function listGroups(): Promise<Group[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_mkt_groups')
    .select('*')
    .order('name', { ascending: true });
  if (error) {
    console.error('[marketing.listGroups]', error);
    return [];
  }
  return (data ?? []).map(rowToGroup);
}

export async function createGroup(input: {
  name: string;
  description?: string | null;
}): Promise<Group | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_groups')
    .insert({
      name: input.name.trim(),
      description: input.description ?? null,
    })
    .select('*')
    .single();
  if (error) {
    console.error('[marketing.createGroup]', error);
    return null;
  }
  return rowToGroup(data);
}
