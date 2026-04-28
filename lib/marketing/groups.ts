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

import { createContact, getContactByEmail } from './contacts';

export interface ListMember {
  contactId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** dashboard_leads.id for prospecting-mirrored contacts. Null when
   *  the contact was created manually / via CSV (no upstream lead). */
  leadId: string | null;
  /** Company name pulled through from the underlying contact row. */
  company: string | null;
  status: 'pending' | 'approved';
  addedAt: string;
  addedBySource: string | null;
}

interface MemberJoinRow {
  contact_id: string;
  status: 'pending' | 'approved';
  added_at: string;
  added_by_source: string | null;
  contact: { id: string; email: string; first_name: string | null; last_name: string | null; lead_id: string | null; company: string | null } | null;
}

export async function getGroup(id: string): Promise<Group | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_groups')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToGroup(data as GroupRow);
}

export async function updateGroup(id: string, patch: { name?: string; description?: string | null }): Promise<Group | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name.trim();
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (Object.keys(dbPatch).length === 0) return getGroup(id);
  const { data, error } = await sb
    .from('dashboard_mkt_groups')
    .update(dbPatch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[marketing.updateGroup]', error);
    return null;
  }
  return rowToGroup(data as GroupRow);
}

export async function deleteGroup(id: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  if (!sb) return false;
  // Wipe membership rows first; campaigns referencing this group fall
  // back to suppressed-list-style empty audience at send time.
  await sb.from('dashboard_mkt_contact_groups').delete().eq('group_id', id);
  const { error } = await sb.from('dashboard_mkt_groups').delete().eq('id', id);
  if (error) {
    console.error('[marketing.deleteGroup]', error);
    return false;
  }
  return true;
}

/**
 * List every member of a group, joining through to the underlying
 * contact for display (email, first name, last name). Used by the
 * /email/audience/<id> detail page to render the members table.
 */
export async function listMembers(id: string): Promise<ListMember[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_mkt_contact_groups')
    .select('contact_id, status, added_at, added_by_source, contact:dashboard_mkt_contacts(id, email, first_name, last_name, lead_id, company)')
    .eq('group_id', id)
    .order('added_at', { ascending: false });
  if (error) {
    console.error('[marketing.listMembers]', error);
    return [];
  }
  return (data as unknown as MemberJoinRow[]).map((r) => ({
    contactId: r.contact_id,
    email: r.contact?.email ?? '',
    firstName: r.contact?.first_name ?? null,
    lastName: r.contact?.last_name ?? null,
    leadId: r.contact?.lead_id ?? null,
    company: r.contact?.company ?? null,
    status: r.status,
    addedAt: r.added_at,
    addedBySource: r.added_by_source,
  }));
}

interface AddMemberInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
}

interface AddMembersResult {
  added: number;
  alreadyMember: number;
  invalid: number;
}

/**
 * Add a batch of email addresses to a group as APPROVED members
 * (status='approved'). Used by the manual-paste + CSV-upload flows
 * where the operator vouches for the input directly.
 *
 * Creates contact rows for any addresses that don't yet exist in
 * dashboard_mkt_contacts, then upserts the join rows. Idempotent —
 * an address that's already in the list is reported as alreadyMember
 * and not duplicated.
 */
export async function addApprovedMembers(
  groupId: string,
  inputs: AddMemberInput[],
  source: 'manual' | 'csv',
): Promise<AddMembersResult> {
  const sb = createSupabaseAdmin();
  if (!sb) return { added: 0, alreadyMember: 0, invalid: 0 };
  const validRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let invalid = 0;
  const seen = new Set<string>();
  const uniq: AddMemberInput[] = [];
  for (const input of inputs) {
    const email = input.email.trim().toLowerCase();
    if (!validRe.test(email) || seen.has(email)) {
      if (!validRe.test(email)) invalid += 1;
      continue;
    }
    seen.add(email);
    uniq.push({ ...input, email });
  }
  if (uniq.length === 0) return { added: 0, alreadyMember: 0, invalid };

  // Resolve contact IDs — create any missing.
  const contactIds: string[] = [];
  for (const input of uniq) {
    const existing = await getContactByEmail(input.email);
    if (existing) {
      contactIds.push(existing.id);
    } else {
      const created = await createContact({
        email: input.email,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        company: input.company ?? null,
        source,
        status: 'active',
      });
      if (created) contactIds.push(created.id);
    }
  }

  // Find which contacts are already on this list — leave them alone.
  const { data: existingMembers } = await sb
    .from('dashboard_mkt_contact_groups')
    .select('contact_id')
    .eq('group_id', groupId)
    .in('contact_id', contactIds);
  const have = new Set((existingMembers ?? []).map((r) => (r as { contact_id: string }).contact_id));
  const toInsert = contactIds.filter((id) => !have.has(id)).map((cid) => ({
    group_id: groupId,
    contact_id: cid,
    status: 'approved',
    added_by_source: source,
  }));
  let added = 0;
  if (toInsert.length > 0) {
    const { error } = await sb.from('dashboard_mkt_contact_groups').insert(toInsert);
    if (error) {
      console.error('[marketing.addApprovedMembers insert]', error);
    } else {
      added = toInsert.length;
    }
  }
  return { added, alreadyMember: have.size, invalid };
}

/**
 * Import a batch of dashboard_leads rows into a group as PENDING
 * members. Prospect-side data is mirrored into mkt_contacts (so the
 * sender pipeline finds them), then joined with status='pending'.
 * The operator must approve the pending memberships before sends
 * include them.
 */
export async function importLeadsAsPending(
  groupId: string,
  leadIds: string[],
): Promise<AddMembersResult> {
  const sb = createSupabaseAdmin();
  if (!sb || leadIds.length === 0) return { added: 0, alreadyMember: 0, invalid: 0 };
  const { data: leads, error: leadErr } = await sb
    .from('dashboard_leads')
    .select('id, payload')
    .in('id', leadIds);
  if (leadErr || !leads) return { added: 0, alreadyMember: 0, invalid: 0 };
  type LeadRow = { id: string; payload: { email?: string; fullName?: string; companyName?: string } };
  const inputs: AddMemberInput[] = [];
  for (const r of (leads as LeadRow[])) {
    const email = (r.payload?.email ?? '').trim().toLowerCase();
    if (!email) continue;
    const parts = (r.payload?.fullName ?? '').trim().split(/\s+/);
    inputs.push({
      email,
      firstName: parts[0] ?? null,
      lastName: parts.slice(1).join(' ') || null,
      company: r.payload?.companyName ?? null,
    });
  }
  // Same upsert as approved, but with status='pending' on the join row.
  const validRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const contactIds: string[] = [];
  let invalid = 0;
  for (const input of inputs) {
    if (!validRe.test(input.email)) { invalid += 1; continue; }
    const existing = await getContactByEmail(input.email);
    if (existing) {
      contactIds.push(existing.id);
    } else {
      const created = await createContact({
        email: input.email,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        company: input.company ?? null,
        source: 'prospect_import',
        status: 'active',
      });
      if (created) contactIds.push(created.id);
    }
  }
  const { data: existingMembers } = await sb
    .from('dashboard_mkt_contact_groups')
    .select('contact_id')
    .eq('group_id', groupId)
    .in('contact_id', contactIds);
  const have = new Set((existingMembers ?? []).map((r) => (r as { contact_id: string }).contact_id));
  const toInsert = contactIds.filter((id) => !have.has(id)).map((cid) => ({
    group_id: groupId,
    contact_id: cid,
    status: 'pending',
    added_by_source: 'prospect_import',
  }));
  let added = 0;
  if (toInsert.length > 0) {
    const { error } = await sb.from('dashboard_mkt_contact_groups').insert(toInsert);
    if (error) console.error('[marketing.importLeadsAsPending insert]', error);
    else added = toInsert.length;
  }
  return { added, alreadyMember: have.size, invalid };
}

/** Promote pending memberships to approved on a list. */
export async function promoteMembers(groupId: string, contactIds: string[]): Promise<number> {
  const sb = createSupabaseAdmin();
  if (!sb || contactIds.length === 0) return 0;
  const { error, count } = await sb
    .from('dashboard_mkt_contact_groups')
    .update({ status: 'approved' }, { count: 'exact' })
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .in('contact_id', contactIds);
  if (error) {
    console.error('[marketing.promoteMembers]', error);
    return 0;
  }
  return count ?? 0;
}

/** Remove memberships from a list. The contacts themselves stay. */
export async function removeMembers(groupId: string, contactIds: string[]): Promise<number> {
  const sb = createSupabaseAdmin();
  if (!sb || contactIds.length === 0) return 0;
  const { error, count } = await sb
    .from('dashboard_mkt_contact_groups')
    .delete({ count: 'exact' })
    .eq('group_id', groupId)
    .in('contact_id', contactIds);
  if (error) {
    console.error('[marketing.removeMembers]', error);
    return 0;
  }
  return count ?? 0;
}

/** listGroups + a member count per group, run in parallel. Used by
 *  the campaign create flow so audience cards show how many people
 *  are in each list before the operator picks one (avoids 'send
 *  blind' anxiety — they always know what they're committing to). */
export async function listGroupsWithCounts(): Promise<Array<Group & { memberCount: number; approvedCount: number; pendingCount: number }>> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const groups = await listGroups();
  if (groups.length === 0) return [];
  // One query — get counts grouped by (group_id, status) for every group at once.
  const { data, error } = await sb
    .from('dashboard_mkt_contact_groups')
    .select('group_id, status');
  if (error) {
    console.error('[marketing.listGroupsWithCounts]', error);
    return groups.map((g) => ({ ...g, memberCount: 0, approvedCount: 0, pendingCount: 0 }));
  }
  type Row = { group_id: string; status: string };
  const counts = new Map<string, { approved: number; pending: number }>();
  for (const r of (data as Row[])) {
    const c = counts.get(r.group_id) ?? { approved: 0, pending: 0 };
    if (r.status === 'pending') c.pending += 1;
    else c.approved += 1;
    counts.set(r.group_id, c);
  }
  return groups.map((g) => {
    const c = counts.get(g.id) ?? { approved: 0, pending: 0 };
    return { ...g, memberCount: c.approved + c.pending, approvedCount: c.approved, pendingCount: c.pending };
  });
}
