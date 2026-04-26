/**
 * Email Contacts repository — backed by dashboard_leads, the same table
 * the prospecting tool writes to. Plays act as folders. We expose a
 * normalised "EmailContact" shape that flattens the relevant Lead
 * fields into a CRM-friendly record.
 *
 * Single source of truth: every prospect sourced by the Outreach
 * agent automatically appears here. Manual contacts are written as
 * Leads with no playId (folder = "Manual").
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { Lead, Play, ProspectStatus } from '@/lib/types';

export interface EmailContactActivity {
  id: string;
  at: string;
  type: string;
  summary: string;
}

export interface EmailContact {
  id: string;                       // lead id
  fullName: string;
  email: string;
  emailInferred: boolean;
  phone?: string;
  jobTitle?: string;
  companyName?: string;
  companyUrl?: string;
  linkedinUrl?: string;
  location?: string;
  address?: string;
  synopsis?: string;
  status: 'active' | 'unsubscribed' | 'suppressed';
  /** Pipeline indicator inherited from the Lead. */
  prospectStatus?: ProspectStatus;
  tags: string[];
  source: string;
  sourceDetail?: string;
  playId?: string;
  /** Resolved Play title, populated from the join on read. */
  playTitle?: string;
  firstSeenAt: string;
  lastTouchAt: string;
  /** Full activity feed (capped at 50, newest first). */
  activity: EmailContactActivity[];
  /** Convenience aggregate. */
  activityCount: number;
  lastActivityAt?: string;
}

export interface ContactFolder {
  /** Stable id: 'all' | 'manual' | 'unsorted' | playId | 'tag:<name>' */
  id: string;
  kind: 'all' | 'manual' | 'unsorted' | 'play' | 'tag';
  label: string;
  count: number;
  /** When kind === 'play', the underlying Play stage for badge colour. */
  playStage?: string;
}

export interface ContactsBundle {
  folders: ContactFolder[];
  contacts: EmailContact[];
}

function leadToContact(lead: Lead, playTitle?: string): EmailContact {
  const sorted = [...(lead.activity ?? [])].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  const activity: EmailContactActivity[] = sorted.slice(0, 50).map((a) => ({
    id: a.id, at: a.at, type: a.type, summary: a.summary,
  }));
  return {
    id: lead.id,
    fullName: lead.fullName,
    email: lead.email,
    emailInferred: Boolean(lead.emailInferred),
    phone: lead.phone,
    jobTitle: lead.jobTitle,
    companyName: lead.companyName,
    companyUrl: lead.companyUrl,
    linkedinUrl: lead.linkedinUrl,
    location: lead.location,
    address: lead.address,
    synopsis: lead.synopsis,
    // Marketing status defaults to active. Overrides come from the
    // suppression list join (Phase 9) — handled at send time, surfaced
    // here as a UI badge once we wire it.
    status: 'active',
    prospectStatus: lead.prospectStatus,
    tags: lead.tags ?? [],
    source: lead.source,
    sourceDetail: lead.sourceDetail,
    playId: lead.playId,
    playTitle,
    firstSeenAt: lead.firstSeenAt,
    lastTouchAt: lead.lastTouchAt,
    activity,
    activityCount: sorted.length,
    lastActivityAt: sorted[0]?.at,
  };
}

/**
 * Load every lead + every play, then build the unified bundle the
 * three-pane explorer renders. One round-trip vs. N folder fetches.
 */
export async function loadContactsBundle(): Promise<ContactsBundle> {
  const sb = createSupabaseAdmin();
  if (!sb) return { folders: [{ id: 'all', kind: 'all', label: 'All contacts', count: 0 }], contacts: [] };

  const [leadsRes, playsRes] = await Promise.all([
    sb.from('dashboard_leads').select('payload'),
    sb.from('dashboard_plays').select('payload'),
  ]);
  if (leadsRes.error) console.error('[mkt.contacts.load leads]', leadsRes.error);
  if (playsRes.error) console.error('[mkt.contacts.load plays]', playsRes.error);

  const leads = ((leadsRes.data as { payload: Lead }[] | null) ?? []).map((r) => r.payload).filter(Boolean);
  const plays = ((playsRes.data as { payload: Play }[] | null) ?? []).map((r) => r.payload).filter(Boolean);

  const playById = new Map<string, Play>();
  for (const p of plays) playById.set(p.id, p);

  const contacts = leads.map((l) => leadToContact(l, l.playId ? playById.get(l.playId)?.title : undefined));

  // Bucket counts — used to decorate the folder pills.
  const countAll = contacts.length;
  const countManual = contacts.filter((c) => !c.playId && c.source === 'manual').length;
  const countUnsorted = contacts.filter((c) => !c.playId && c.source !== 'manual').length;
  const countByPlay = new Map<string, number>();
  for (const c of contacts) {
    if (c.playId) countByPlay.set(c.playId, (countByPlay.get(c.playId) ?? 0) + 1);
  }

  // Sort plays: live → paused → done → idea, ties broken by lead count desc.
  const stageRank: Record<string, number> = { live: 0, paused: 1, done: 2, idea: 3, archived: 4 };
  const playFolders: ContactFolder[] = plays
    .map((p) => ({
      id: p.id,
      kind: 'play' as const,
      label: p.title || 'Untitled play',
      count: countByPlay.get(p.id) ?? 0,
      playStage: p.stage,
    }))
    .sort((a, b) => {
      const ra = stageRank[a.playStage ?? ''] ?? 9;
      const rb = stageRank[b.playStage ?? ''] ?? 9;
      if (ra !== rb) return ra - rb;
      return b.count - a.count;
    });

  // Tag-based marketing groups. Distinct tags across every contact, with counts.
  const tagCount = new Map<string, number>();
  for (const c of contacts) {
    for (const t of c.tags) {
      const k = t.trim();
      if (!k) continue;
      tagCount.set(k, (tagCount.get(k) ?? 0) + 1);
    }
  }
  const tagFolders: ContactFolder[] = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t, n]) => ({ id: `tag:${t}`, kind: 'tag' as const, label: t, count: n }));

  const folders: ContactFolder[] = [
    { id: 'all', kind: 'all', label: 'All contacts', count: countAll },
    { id: 'manual', kind: 'manual', label: 'Manual', count: countManual },
    { id: 'unsorted', kind: 'unsorted', label: 'Unsorted', count: countUnsorted },
    ...playFolders,
    ...tagFolders,
  ];

  return { folders, contacts };
}

/**
 * Manual create — drops a brand-new lead with source='manual', no
 * playId, into dashboard_leads. The three-pane explorer's Manual
 * folder picks it up on next refresh.
 */
export async function createManualContact(input: {
  fullName: string;
  email: string;
  phone?: string;
  companyName?: string;
  jobTitle?: string;
}): Promise<EmailContact | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const id = `lead_manual_${Math.random().toString(36).slice(2, 12)}`;
  const now = new Date().toISOString();
  const lead: Lead = {
    id,
    fullName: input.fullName.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || undefined,
    companyName: input.companyName?.trim() || undefined,
    jobTitle: input.jobTitle?.trim() || undefined,
    source: 'manual',
    sourceCategory: 'manual',
    stage: 'new',
    intent: 'unknown',
    firstSeenAt: now,
    lastTouchAt: now,
    tags: [],
    activity: [{
      id: `act_${Math.random().toString(36).slice(2, 10)}`,
      at: now,
      type: 'note',
      summary: 'Created manually from Email · Contacts',
    }],
    tier: 'lead',
  };
  const { error } = await sb.from('dashboard_leads').insert({ id, tier: 'lead', payload: lead });
  if (error) {
    console.error('[mkt.contacts.create]', error);
    return null;
  }
  await syncLeadToMktContact(lead);
  return leadToContact(lead);
}

/**
 * Patch a contact's editable fields. Mutates the underlying Lead
 * payload in place — the prospecting tool reads the same row and
 * picks up edits immediately.
 */
export async function updateContactFields(
  id: string,
  patch: Partial<Pick<EmailContact, 'fullName' | 'email' | 'phone' | 'jobTitle' | 'companyName' | 'companyUrl' | 'linkedinUrl' | 'location' | 'address' | 'synopsis'>>,
): Promise<EmailContact | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data: row, error: rErr } = await sb
    .from('dashboard_leads')
    .select('payload')
    .eq('id', id)
    .maybeSingle();
  if (rErr || !row) {
    console.error('[mkt.contacts.update read]', rErr);
    return null;
  }
  const lead = (row as { payload: Lead }).payload;
  const next: Lead = {
    ...lead,
    fullName:    patch.fullName    ?? lead.fullName,
    email:       patch.email       ?? lead.email,
    phone:       patch.phone       ?? lead.phone,
    jobTitle:    patch.jobTitle    ?? lead.jobTitle,
    companyName: patch.companyName ?? lead.companyName,
    companyUrl:  patch.companyUrl  ?? lead.companyUrl,
    linkedinUrl: patch.linkedinUrl ?? lead.linkedinUrl,
    location:    patch.location    ?? lead.location,
    address:     patch.address     ?? lead.address,
    synopsis:    patch.synopsis    ?? lead.synopsis,
    lastTouchAt: new Date().toISOString(),
  };
  const { error: uErr } = await sb.from('dashboard_leads').update({ payload: next }).eq('id', id);
  if (uErr) {
    console.error('[mkt.contacts.update write]', uErr);
    return null;
  }
  await syncLeadToMktContact(next);
  return leadToContact(next);
}

/**
 * Mirror a Lead into dashboard_mkt_contacts (the legacy table the
 * Phase 5 campaign sender + Phase 4 segment evaluator both target).
 *
 * Upsert by lower(email) so re-runs are idempotent. Splits fullName
 * naively into first/last to populate the legacy columns. Anything
 * lacking an email is skipped — campaigns can't reach them anyway.
 */
export async function syncLeadToMktContact(lead: Lead): Promise<void> {
  const sb = createSupabaseAdmin();
  if (!sb) return;
  const email = (lead.email ?? '').trim().toLowerCase();
  if (!email) return;
  const fullName = lead.fullName ?? '';
  const firstSpace = fullName.indexOf(' ');
  const firstName = firstSpace > 0 ? fullName.slice(0, firstSpace).trim() : fullName.trim();
  const lastName  = firstSpace > 0 ? fullName.slice(firstSpace + 1).trim() : null;

  // Existing row → update; otherwise insert.
  const { data: existing } = await sb
    .from('dashboard_mkt_contacts')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  const payload = {
    first_name: firstName || null,
    last_name: lastName || null,
    email,
    phone: lead.phone ?? null,
    company: lead.companyName ?? null,
    source: lead.source ?? 'manual',
    lead_id: lead.id, // permanent bridge column added Phase 5
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await sb
      .from('dashboard_mkt_contacts')
      .update(payload)
      .eq('id', (existing as { id: string }).id);
    if (error) console.error('[mkt.contacts.sync update]', error);
  } else {
    const { error } = await sb
      .from('dashboard_mkt_contacts')
      .insert({ ...payload, status: 'active' });
    if (error) console.error('[mkt.contacts.sync insert]', error);
  }
}

/**
 * Bulk add a tag to every lead in `ids`. The tag is appended to
 * payload.tags (de-duplicated case-sensitive). Used by the multi-
 * select 'Add to group' bulk action in the explorer.
 */
export async function bulkAddTag(ids: string[], tag: string): Promise<number> {
  const sb = createSupabaseAdmin();
  if (!sb || ids.length === 0 || !tag.trim()) return 0;
  const { data, error } = await sb
    .from('dashboard_leads')
    .select('id, payload')
    .in('id', ids);
  if (error || !data) {
    console.error('[mkt.contacts.bulkAddTag read]', error);
    return 0;
  }
  let n = 0;
  for (const row of data as { id: string; payload: Lead }[]) {
    const cur = row.payload.tags ?? [];
    if (cur.includes(tag)) continue;
    const next = { ...row.payload, tags: [...cur, tag], lastTouchAt: new Date().toISOString() };
    const { error: uErr } = await sb.from('dashboard_leads').update({ payload: next }).eq('id', row.id);
    if (!uErr) n++;
  }
  return n;
}

/**
 * Bulk remove a tag from every lead in `ids`. Inverse of bulkAddTag —
 * used by the 'Remove from group' affordance.
 */
export async function bulkRemoveTag(ids: string[], tag: string): Promise<number> {
  const sb = createSupabaseAdmin();
  if (!sb || ids.length === 0 || !tag.trim()) return 0;
  const { data, error } = await sb
    .from('dashboard_leads')
    .select('id, payload')
    .in('id', ids);
  if (error || !data) {
    console.error('[mkt.contacts.bulkRemoveTag read]', error);
    return 0;
  }
  let n = 0;
  for (const row of data as { id: string; payload: Lead }[]) {
    const cur = row.payload.tags ?? [];
    if (!cur.includes(tag)) continue;
    const next = { ...row.payload, tags: cur.filter((t) => t !== tag), lastTouchAt: new Date().toISOString() };
    const { error: uErr } = await sb.from('dashboard_leads').update({ payload: next }).eq('id', row.id);
    if (!uErr) n++;
  }
  return n;
}

/**
 * Append one activity event to a lead's payload.activity[] array,
 * keyed by the bridge column on dashboard_mkt_contacts. Used by the
 * Postmark events webhook + the conversations ingest so every
 * marketing interaction shows up on the contact's timeline in the
 * explorer right pane — without losing the prospecting tool's view
 * of the same row.
 *
 * Lookup chain: contactId → mkt_contacts.lead_id → leads.payload.
 * No-ops silently when the bridge is missing (rare — see backfill).
 */
export async function appendLeadActivity(
  contactId: string,
  event: { type: string; summary: string; meta?: Record<string, unknown> },
): Promise<void> {
  const sb = createSupabaseAdmin();
  if (!sb) return;
  // Resolve to lead via the bridge column.
  const { data: bridge } = await sb
    .from('dashboard_mkt_contacts')
    .select('lead_id')
    .eq('id', contactId)
    .maybeSingle();
  const leadId = (bridge as { lead_id: string | null } | null)?.lead_id;
  if (!leadId) return;
  // Pull the lead payload, append the activity, write back.
  const { data: row, error: rErr } = await sb
    .from('dashboard_leads')
    .select('payload')
    .eq('id', leadId)
    .maybeSingle();
  if (rErr || !row) return;
  const lead = (row as { payload: Lead }).payload;
  const activity = Array.isArray(lead.activity) ? lead.activity : [];
  const next: Lead = {
    ...lead,
    lastTouchAt: new Date().toISOString(),
    activity: [
      ...activity,
      {
        id: `act_${Math.random().toString(36).slice(2, 10)}`,
        at: new Date().toISOString(),
        type: event.type as Lead['activity'][number]['type'],
        summary: event.summary,
        meta: event.meta,
      },
    ],
  };
  await sb.from('dashboard_leads').update({ payload: next }).eq('id', leadId);
}
