/**
 * Contacts repository — wraps dashboard_mkt_contacts and the join
 * tables (contact_groups, contact_tags). Service-role only.
 *
 * UI list endpoints return Contact[] (no joins). The detail endpoint
 * uses getContactWithMeta() which adds the groups + tags arrays.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { Contact, ContactStatus, ContactWithMeta, Group, Tag } from './types';

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  company: string | null;
  status: ContactStatus;
  source: string | null;
  created_at: string;
  updated_at: string;
}

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface TagRow {
  id: string;
  name: string;
  created_at: string;
}

function rowToContact(row: ContactRow): Contact {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    status: row.status,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
  };
}

function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

// ─── Read ─────────────────────────────────────────────────────────

export async function listContacts(opts: {
  limit?: number;
  status?: ContactStatus;
  search?: string;
} = {}): Promise<Contact[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  let q = sb
    .from('dashboard_mkt_contacts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 500);
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.search) {
    // ilike on email + names. Tiny scale, no FTS needed.
    const s = `%${opts.search}%`;
    q = q.or(`email.ilike.${s},first_name.ilike.${s},last_name.ilike.${s},company.ilike.${s}`);
  }
  const { data, error } = await q;
  if (error) {
    console.error('[marketing.listContacts]', error);
    return [];
  }
  return (data ?? []).map(rowToContact);
}

export async function getContactByEmail(email: string): Promise<Contact | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_contacts')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  if (error) {
    console.error('[marketing.getContactByEmail]', error);
    return null;
  }
  return data ? rowToContact(data as ContactRow) : null;
}

export async function getContact(id: string): Promise<Contact | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_contacts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[marketing.getContact]', error);
    return null;
  }
  return data ? rowToContact(data) : null;
}

export async function getContactWithMeta(id: string): Promise<ContactWithMeta | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const contact = await getContact(id);
  if (!contact) return null;
  // Two parallel join lookups — avoids the N+1 a per-contact-meta
  // call in the list page would have.
  const [groupsRes, tagsRes] = await Promise.all([
    sb
      .from('dashboard_mkt_contact_groups')
      .select('group_id, dashboard_mkt_groups!inner(*)')
      .eq('contact_id', id),
    sb
      .from('dashboard_mkt_contact_tags')
      .select('tag_id, dashboard_mkt_tags!inner(*)')
      .eq('contact_id', id),
  ]);
  if (groupsRes.error) console.error('[marketing.getContactWithMeta groups]', groupsRes.error);
  if (tagsRes.error) console.error('[marketing.getContactWithMeta tags]', tagsRes.error);
  const groups = (groupsRes.data ?? [])
    .map((r) => (r as unknown as { dashboard_mkt_groups: GroupRow }).dashboard_mkt_groups)
    .filter(Boolean)
    .map(rowToGroup);
  const tags = (tagsRes.data ?? [])
    .map((r) => (r as unknown as { dashboard_mkt_tags: TagRow }).dashboard_mkt_tags)
    .filter(Boolean)
    .map(rowToTag);
  return { ...contact, groups, tags };
}

// ─── Write ────────────────────────────────────────────────────────

export async function createContact(input: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: string | null;
  status?: ContactStatus;
}): Promise<Contact | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const row = {
    email: input.email.trim().toLowerCase(),
    first_name: input.firstName ?? null,
    last_name: input.lastName ?? null,
    phone: input.phone ?? null,
    company: input.company ?? null,
    source: input.source ?? null,
    status: input.status ?? 'active',
  };
  const { data, error } = await sb
    .from('dashboard_mkt_contacts')
    .insert(row)
    .select('*')
    .single();
  if (error) {
    console.error('[marketing.createContact]', error);
    return null;
  }
  return rowToContact(data);
}

export async function updateContact(
  id: string,
  patch: Partial<{
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    company: string | null;
    source: string | null;
    status: ContactStatus;
  }>,
): Promise<Contact | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const dbPatch: Record<string, unknown> = {};
  if ('firstName' in patch) dbPatch.first_name = patch.firstName;
  if ('lastName' in patch) dbPatch.last_name = patch.lastName;
  if ('email' in patch && patch.email) dbPatch.email = patch.email.trim().toLowerCase();
  if ('phone' in patch) dbPatch.phone = patch.phone;
  if ('company' in patch) dbPatch.company = patch.company;
  if ('source' in patch) dbPatch.source = patch.source;
  if ('status' in patch) dbPatch.status = patch.status;
  if (Object.keys(dbPatch).length === 0) {
    return getContact(id);
  }
  const { data, error } = await sb
    .from('dashboard_mkt_contacts')
    .update(dbPatch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[marketing.updateContact]', error);
    return null;
  }
  return rowToContact(data);
}

// ─── Group / tag assignment ──────────────────────────────────────
// 'Replace' semantics: callers pass the desired set of ids and the
// repo diffs against current. Simpler API than incremental add/remove
// for the UI's checkbox-style assignment widget.

async function replaceJoin(
  table: 'dashboard_mkt_contact_groups' | 'dashboard_mkt_contact_tags',
  contactId: string,
  fkField: 'group_id' | 'tag_id',
  ids: string[],
): Promise<boolean> {
  const sb = createSupabaseAdmin();
  if (!sb) return false;
  const desired = new Set(ids);
  const { data: existing, error: readErr } = await sb
    .from(table)
    .select(fkField)
    .eq('contact_id', contactId);
  if (readErr) {
    console.error(`[marketing.replaceJoin ${table} read]`, readErr);
    return false;
  }
  const have = new Set(
    ((existing ?? []) as Array<Record<string, string>>).map((r) => r[fkField]),
  );
  const toAdd = [...desired].filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !desired.has(id));
  if (toAdd.length > 0) {
    const rows = toAdd.map((id) => ({ contact_id: contactId, [fkField]: id }));
    const { error } = await sb.from(table).insert(rows);
    if (error) {
      console.error(`[marketing.replaceJoin ${table} insert]`, error);
      return false;
    }
  }
  if (toRemove.length > 0) {
    const { error } = await sb
      .from(table)
      .delete()
      .eq('contact_id', contactId)
      .in(fkField, toRemove);
    if (error) {
      console.error(`[marketing.replaceJoin ${table} delete]`, error);
      return false;
    }
  }
  return true;
}

export async function assignGroups(contactId: string, groupIds: string[]): Promise<boolean> {
  return replaceJoin('dashboard_mkt_contact_groups', contactId, 'group_id', groupIds);
}

export async function assignTags(contactId: string, tagIds: string[]): Promise<boolean> {
  return replaceJoin('dashboard_mkt_contact_tags', contactId, 'tag_id', tagIds);
}
