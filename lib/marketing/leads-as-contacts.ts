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
  /** Quick activity preview — count + most recent. */
  activityCount: number;
  lastActivityAt?: string;
}

export interface ContactFolder {
  id: string;             // 'all' | 'manual' | 'unsorted' | playId
  kind: 'all' | 'manual' | 'unsorted' | 'play';
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
    activityCount: (lead.activity ?? []).length,
    lastActivityAt: lead.activity?.[0]?.at,
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

  const folders: ContactFolder[] = [
    { id: 'all', kind: 'all', label: 'All contacts', count: countAll },
    { id: 'manual', kind: 'manual', label: 'Manual', count: countManual },
    { id: 'unsorted', kind: 'unsorted', label: 'Unsorted', count: countUnsorted },
    ...playFolders,
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
  return leadToContact(next);
}
