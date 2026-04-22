import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay, upsertLead } from '@/lib/dashboard/repository';
import type {
  CompanyContact,
  DiscoveredCompany,
  DiscoverEmail,
  Lead,
  OrgProfile,
} from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface IncomingPick {
  domain: string;
  /** Addresses the operator ticked. */
  emails: string[];
}

interface IncomingBody {
  playId: string;
  picks: IncomingPick[];
}

/**
 * POST /api/discover/send-to-prospects
 *
 * Body: { playId, picks: [{ domain, emails[] }] }
 *
 * For each picked email, creates one `dashboard_leads` row with tier=prospect
 * and playId = the given Play. Company data comes from the cached
 * dashboard_discovered_companies row; missing cache rows fall back to just
 * the domain + address. Dedupes by (playId, email).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<IncomingBody>;
  if (!body.playId) {
    return NextResponse.json({ ok: false, error: 'playId required' }, { status: 400 });
  }
  const picks = Array.isArray(body.picks) ? body.picks : [];
  if (picks.length === 0) {
    return NextResponse.json({ ok: false, error: 'No picks supplied' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  const play = await getPlay(supabase, body.playId);
  if (!play) {
    return NextResponse.json({ ok: false, error: 'Play not found' }, { status: 404 });
  }

  // Load all cached companies for the picked domains in one go
  const domains = Array.from(new Set(picks.map((p) => normaliseDomain(p.domain))));
  const { data: companyRows } = await supabase
    .from('dashboard_discovered_companies')
    .select('domain, payload')
    .in('domain', domains);
  const companyByDomain = new Map<string, DiscoveredCompany>();
  for (const r of (companyRows ?? []) as Array<{ domain: string; payload: DiscoveredCompany }>) {
    companyByDomain.set(r.domain, r.payload);
  }

  // Dedupe against existing prospects on this play with matching emails
  const { data: existingRows } = await supabase
    .from('dashboard_leads')
    .select('id, payload')
    .eq('payload->>playId', body.playId);
  const existingEmails = new Set<string>();
  for (const r of (existingRows ?? []) as Array<{ payload: Lead }>) {
    if (r.payload?.email) existingEmails.add(r.payload.email.trim().toLowerCase());
  }

  const now = new Date().toISOString();
  const created: Lead[] = [];
  let skipped = 0;

  for (const pick of picks) {
    const domain = normaliseDomain(pick.domain);
    if (!domain) continue;
    const company = companyByDomain.get(domain);
    const emails = (pick.emails ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0 && /@/.test(e));
    if (emails.length === 0) continue;

    for (const email of emails) {
      if (existingEmails.has(email)) {
        skipped += 1;
        continue;
      }
      existingEmails.add(email);

      const meta = metaFor(company, email);
      const lead: Lead = {
        id: 'lead_' + Math.random().toString(36).slice(2, 12),
        fullName: meta.fullName,
        email,
        source: 'outreach_agent',
        sourceCategory: 'outreach',
        sourceDetail: 'Discover · ' + (company?.name ?? domain),
        stage: 'new',
        intent: 'unknown',
        firstSeenAt: now,
        lastTouchAt: now,
        tags: [],
        activity: [
          {
            id: 'act_' + Math.random().toString(36).slice(2, 10),
            at: now,
            type: 'note',
            summary: 'Added from Discover',
          },
        ],
        tier: 'prospect',
        category: play.category,
        playId: body.playId,
        companyName: company?.name,
        companyUrl: 'https://' + domain,
        jobTitle: meta.jobTitle,
        address: company?.hq?.full,
        emailInferred: meta.emailInferred,
        orgProfile: toOrgProfile(company, now),
        prospectStatus: 'pending',
        outreach: [],
      };
      const saved = await upsertLead(supabase, lead);
      if (saved) created.push(saved);
    }
  }

  return NextResponse.json({
    ok: true,
    playId: body.playId,
    created: created.length,
    skipped,
    leads: created,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function metaFor(company: DiscoveredCompany | undefined, email: string): {
  fullName: string;
  jobTitle?: string;
  emailInferred: boolean;
} {
  const match = company?.emails?.find(
    (e) => e.address.trim().toLowerCase() === email.trim().toLowerCase(),
  );
  if (match) {
    return {
      fullName: match.name && match.name.trim() ? match.name.trim() : inferNameFromEmail(email, company),
      jobTitle: match.jobTitle,
      emailInferred: match.source === 'inferred' || match.source === 'ai',
    };
  }
  return {
    fullName: inferNameFromEmail(email, company),
    emailInferred: false,
  };
}

function inferNameFromEmail(email: string, company: DiscoveredCompany | undefined): string {
  const local = email.split('@')[0] ?? '';
  // Role-mailbox fallback to company name
  const roles = new Set([
    'info', 'contact', 'hello', 'team', 'support', 'sales', 'admin',
    'enquiries', 'enquiry', 'press', 'media', 'office', 'accounts', 'bookings',
  ]);
  if (roles.has(local.toLowerCase())) return company?.name ?? local;
  // Otherwise title-case the local part — best effort
  return local
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

function toOrgProfile(
  company: DiscoveredCompany | undefined,
  nowIso: string,
): OrgProfile | undefined {
  if (!company) return undefined;
  const contacts: CompanyContact[] = (company.emails ?? []).map((e) => ({
    name: e.name ?? inferNameFromEmail(e.address, company),
    jobTitle: e.jobTitle,
    email: e.address,
    emailSource: e.source ?? 'scraped',
    confidence: e.confidence ?? 'medium',
    sourceUrl: e.sourceUrl,
  }));
  return {
    orgType: company.orgType,
    employeeCount: company.employeeCount,
    employeeRange: company.employeeBand,
    contacts: contacts.length ? contacts : undefined,
    contactsSourceNote: contacts.length ? 'Imported from Discover' : undefined,
    contactsEnrichedAt: company.enrichedAt,
    sourceNote: 'Imported from Discover',
    generatedAt: nowIso,
  };
}

function normaliseDomain(input: string): string {
  const s = (input || '').trim().toLowerCase();
  if (!s) return '';
  try {
    const url = s.startsWith('http') ? new URL(s) : new URL('https://' + s);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}
