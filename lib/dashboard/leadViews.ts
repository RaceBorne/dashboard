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
import type {
  DiscoverEmail,
  DiscoverEmailBucket,
  DiscoveredCompany,
  Lead,
  Prospect,
} from '@/lib/types';

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
    category: l.category,
    sourceDetail: l.sourceDetail,
    createdAt: l.firstSeenAt,
    lastTouchAt: l.lastTouchAt ?? l.firstSeenAt,
    signals: l.prospectSignals,
    outreach: l.outreach ?? [],
    notes: l.notes,
    synopsis: l.synopsis,
    synopsisGeneratedAt: l.synopsisGeneratedAt,
    companyUrl: l.companyUrl,
    linkedinUrl: l.linkedinUrl,
    address: l.address,
    emailInferred: l.emailInferred,
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

// ---------------------------------------------------------------------------
// Lead -> DiscoveredCompany (for CompanyPanel re-use on /prospects + /leads)
// ---------------------------------------------------------------------------

/**
 * Extract a normalised domain from a URL or email string. Returns '' when no
 * clean domain can be derived — callers should fall back to a placeholder.
 */
function deriveDomain(lead: Lead): string {
  const fromUrl = lead.companyUrl ? normaliseHostish(lead.companyUrl) : '';
  if (fromUrl) return fromUrl;
  const email = lead.email ?? '';
  const at = email.indexOf('@');
  if (at > -1) {
    const d = email.slice(at + 1).trim().toLowerCase();
    if (d) return d;
  }
  return '';
}

function normaliseHostish(raw: string): string {
  let d = raw.trim().toLowerCase();
  if (!d) return '';
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/^www\./, '');
  d = d.split('/')[0] ?? d;
  return d;
}

function bucketForEmail(address: string): DiscoverEmailBucket {
  const local = address.split('@')[0]?.toLowerCase() ?? '';
  if (!local) return 'generic';
  if (/^(info|hello|contact|admin|office|enquir|enquiries?|reception)/.test(local)) return 'generic';
  if (/^(support|help|service|care)/.test(local)) return 'support';
  if (/^(sales|partners?|bd|biz|business)/.test(local)) return 'sales';
  if (/^(press|media|pr|comms?)/.test(local)) return 'media';
  return 'personal';
}

/**
 * Convert a Lead row (prospect or lead tier) into a DiscoveredCompany-shaped
 * stub so the Discover CompanyPanel can render the same person / company
 * across /discover, /prospects and /leads.
 *
 * Emails are hydrated from:
 *   - the lead's own email (skipped when emailInferred and the local part
 *     is a generic catchall like "info@")
 *   - relatedContacts[]
 *   - orgProfile.contacts[]
 */
export function leadToDiscoveredCompany(lead: Lead): DiscoveredCompany {
  const domain = deriveDomain(lead) || 'unknown.local';
  const name = lead.companyName?.trim() || lead.fullName || domain;

  const emails: DiscoverEmail[] = [];
  const seen = new Set<string>();

  const pushEmail = (e: DiscoverEmail | null) => {
    if (!e) return;
    const addr = e.address.trim().toLowerCase();
    if (!addr || seen.has(addr)) return;
    seen.add(addr);
    emails.push({ ...e, address: addr });
  };

  // Primary lead email.
  if (lead.email) {
    const local = lead.email.split('@')[0]?.toLowerCase() ?? '';
    const isGenericInferred =
      lead.emailInferred === true && /^(info|hello|contact|admin|enquir|enquiries?)/.test(local);
    if (!isGenericInferred) {
      pushEmail({
        address: lead.email,
        name: lead.fullName,
        jobTitle: lead.jobTitle,
        bucket: bucketForEmail(lead.email),
        source: lead.emailInferred ? 'inferred' : 'scraped',
        confidence: lead.emailInferred ? 'low' : 'medium',
      });
    } else {
      // Still surface the generic catchall so the panel has something to show.
      pushEmail({
        address: lead.email,
        bucket: 'generic',
        source: 'inferred',
        confidence: 'low',
      });
    }
  }

  // Related contacts from the lead row.
  for (const rc of lead.relatedContacts ?? []) {
    if (!rc.email) continue;
    pushEmail({
      address: rc.email,
      name: rc.name,
      jobTitle: rc.jobTitle,
      bucket: bucketForEmail(rc.email),
      source: 'scraped',
      confidence: 'medium',
    });
  }

  // Richer enriched contacts from the org profile.
  for (const c of lead.orgProfile?.contacts ?? []) {
    if (!c.email) continue;
    pushEmail({
      address: c.email,
      name: c.name,
      jobTitle: c.jobTitle,
      bucket: bucketForEmail(c.email),
      source: c.emailSource ?? 'scraped',
      confidence: c.confidence,
      sourceUrl: c.sourceUrl,
    });
  }

  return {
    domain,
    name,
    description: lead.synopsis,
    category: lead.category,
    orgType: lead.orgProfile?.orgType,
    employeeBand: lead.orgProfile?.employeeRange,
    employeeCount: lead.orgProfile?.employeeCount,
    phone: lead.phone,
    hq: lead.address ? { full: lead.address } : undefined,
    socials: lead.linkedinUrl ? { linkedin: lead.linkedinUrl } : undefined,
    emails,
    enrichedAt: lead.orgProfile?.generatedAt ?? lead.synopsisGeneratedAt,
  };
}
