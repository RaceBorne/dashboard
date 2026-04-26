/**
 * Tags repository — wraps dashboard_mkt_tags. Service-role only.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { Tag } from './types';

interface TagRow {
  id: string;
  name: string;
  created_at: string;
}

function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

export async function listTags(): Promise<Tag[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_mkt_tags')
    .select('*')
    .order('name', { ascending: true });
  if (error) {
    console.error('[marketing.listTags]', error);
    return [];
  }
  return (data ?? []).map(rowToTag);
}

export async function createTag(name: string): Promise<Tag | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_tags')
    .insert({ name: name.trim() })
    .select('*')
    .single();
  if (error) {
    console.error('[marketing.createTag]', error);
    return null;
  }
  return rowToTag(data);
}
