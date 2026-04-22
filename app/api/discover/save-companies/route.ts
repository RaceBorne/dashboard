import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { upsertLead } from '@/lib/dashboard/repository';
import type { DiscoveredCompany, Lead } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface IncomingCompany {
  domain: string;
  name?: string;
  logoUrl?: string;
  category?: string;
  employeeBand?: string;
  hqLabel?: string;
}

interface IncomingBody {
  /** Target folder name — maps to payload.category on tier='prospect' rows. */
  folder: string;
  companies: IncomingCompany[];
}

/**
 * POST /api/discover/save-companies
 *
 * Body: { folder: string, companies: [{ domain, name?, ... }] }
 *
 * Creates one shell prospect row per company under the given folder. These
 * rows carry a synthetic info@{domain} email so the Prospects UI can list
 * them immediately; real contacts are added by later enrichment.
 *
 * Idempotent on (folder, domain) — if a shell for that pairing already
 * exists we skip. Companies with pre-existing prospects (any email on that
 * domain in the same folder) are also skipped.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<IncomingBody>;
  const folder = (body.folder ?? '').trim();
  const companies = Array.isArray(body.companies) ? body.companies : [];

  if (!folder) {
    return NextResponse.json({ ok: false, error: 'folder required' }, { status: 400 });
  }
  if (companies.length === 0) {
    return NextResponse.json({ ok: true, created: 0, skipped: 0, leads: [] });
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  const domains = Array.from(
    new Set(companies.map((c) => normaliseDomain(c.domain)).filter(Boolean)),
  );
  if (domains.length === 0) {
    return NextResponse.json({ ok: true, created: 0, skipped: 0, leads: [] });
  }

  // Pull cached company payloads so we can hydrate shells with any detail
  // we already have (name / logo / category / HQ).
  const { data: companyRows } = await supabase
    .from('dashboard_discovered_companies')
    .select('domain, payload')
    .in('domain', domains);
  const companyByDomain = new Map<string, DiscoveredCompany>();
  for (const r of (companyRows ?? []) as Array<{ domain: string; payload: DiscoveredCompany }>) {
    companyByDomain.set(r.domain, r.payload);
  }

  // Find existing prospects in this folder for any of these domains so we
  // don't create duplicate shells on re-runs.
  const { data: existingRows } = await supabase
    .from('dashboard_leads')
    .select('id, payload')
    .eq('tier', 'prospect')
    .contains('payload', { category: folder });
  const seenDomains = new Set<string>();
  for (const r of (existingRows ?? []) as Array<{ payload: Lead }>) {
    const email = r.payload?.email;
    if (!email) continue;
    const d = email.split('@')[1]?.trim().toLowerCase();
    if (d) seenDomains.add(d);
  }

  const now = new Date().toISOString();
  const created: Lead[] = [];
  let skipped = 0;

  for (const incoming of companies) {
    const domain = normaliseDomain(incoming.domain);
    if (!domain) continue;
    if (seenDomains.has(domain)) {
      skipped += 1;
      continue;
    }
    seenDomains.add(domain);

    const cached = companyByDomain.get(domain);
    const companyName = cached?.name ?? incoming.name ?? domain;
    const employeeRange = cached?.employeeBand ?? incoming.employeeBand;
    const hqFull = cached?.hq?.full ?? incoming.hqLabel;

    const lead: Lead = {
      id: 'lead_' + Math.random().toString(36).slice(2, 12),
      fullName: companyName,
      email: 'info@' + domain,
      source: 'outreach_agent',
      sourceCategory: 'outreach',
      sourceDetail: 'Discover · ' + companyName,
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
          summary: 'Saved from Discover (no contact yet)',
        },
      ],
      tier: 'prospect',
      category: folder,
      companyName,
      companyUrl: 'https://' + domain,
      address: hqFull,
      emailInferred: true,
      orgProfile: {
        orgType: cached?.orgType ?? 'other',
        employeeRange,
        employeeCount: cached?.employeeCount,
        generatedAt: now,
      },
      prospectStatus: 'pending',
      outreach: [],
    };

    const saved = await upsertLead(supabase, lead);
    if (saved) created.push(saved);
  }

  return NextResponse.json({
    ok: true,
    folder,
    created: created.length,
    skipped,
    leads: created,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseDomain(raw: string | undefined): string {
  if (!raw) return '';
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/^www\./, '');
  d = d.split('/')[0] ?? d;
  return d;
}
