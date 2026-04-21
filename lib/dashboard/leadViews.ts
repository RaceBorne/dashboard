/**
 * Lead <-> Prospect view mapping.
 *
 * Since the dashboard_prospects table was merged into dashboard_leads, the
 * Prospect type now lives only as a view onto a Lead row where tier='prospect'.
 * The repository materialises Prospect[] for the existing Prospects UI by
 * mapping each Lead row through leadToProspect().
 *
 * New writes (Source Prospects agent, reply-scan, drafts/send) emit Lead rows
 * directly — use prospectToLead() when you only have a Prospect-shaped payload.
 */
import type { Lead, Prospect } from '@/lib/types';

const nowIso = () => new Date().toISOString();

export function leadToProspect(l: Lead): Prospect {
  return {
    id: l.id,
    name: l.fullName,
    org: l.companyName,
    role: l.jobTitle,
    email: l.email || undefined,
    phone: l.phone,
    channel: 'email',
    status: l.prospectStatus ?? 'pending',
    playId: l.playId,
    sourceDetail: l.sourceDetail,
    createdAt: l.firstSeenAt,
    lastTouchAt: l.lastTouchAt ?? l.firstSeenAt,
    signals: l.prospectSignals,
    outreach: l.outreach ?? [],
    notes: l.notes,
  };
}

/**
 * Produce a Lead from Prospect-shaped data. Used when legacy code only has a
 * Prospect object; keeps the Lead-canonical fields consistent.
 */
export function prospectToLead(p: Prospect, category?: string): Lead {
  return {
    id: p.id,
    fullName: p.name,
    email: p.email ?? '',
    phone: p.phone,
    companyName: p.org,
    jobTitle: p.role,
    source: 'outreach_agent',
    sourceCategory: 'outreach',
    sourceDetail: p.sourceDetail,
    stage: 'new',
    intent: 'unknown',
    firstSeenAt: p.createdAt,
    lastTouchAt: p.lastTouchAt ?? p.createdAt,
    tags: [],
    activity: [],
    notes: p.notes,
    tier: 'prospect',
    category,
    playId: p.playId,
    prospectStatus: p.status,
    prospectSignals: p.signals,
    outreach: p.outreach,
  };
}

export function ensureLeadTimestamps(lead: Lead): Lead {
  const firstSeenAt = lead.firstSeenAt ?? nowIso();
  return {
    ...lead,
    firstSeenAt,
    lastTouchAt: lead.lastTouchAt ?? firstSeenAt,
    tier: lead.tier ?? 'lead',
    tags: lead.tags ?? [],
    activity: lead.activity ?? [],
  };
}
