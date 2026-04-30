/**
 * GET /api/discover/[playId]/dashboard
 *
 * Returns the data for the new Discovery dashboard view:
 *   - top stats (companies found, decision makers, data coverage,
 *     estimated reachable, avg fit score)
 *   - rows[] — companies in the play's shortlist with fit score,
 *     decision-maker count, data-coverage %, location, etc.
 *   - topIndustries[] — distribution for the AI Insights pane
 *
 * All numbers come from existing tables: dashboard_play_shortlist
 * + dashboard_enrichment_contacts + dashboard_suppressions.
 */

import { NextResponse } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ShortlistRow {
  id: string; domain: string; name: string;
  industry: string | null; employees: string | null; revenue: string | null;
  location: string | null; description: string | null;
  fit_score: number | null; status: string;
  logo_url: string | null;
}

interface EnrichmentRow {
  id: string; domain: string | null; email: string | null; email_verified: boolean | null;
  job_title: string | null; seniority: string | null;
}

interface SuppressionRow { email: string }

export async function GET(_req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  const [{ data: shortlist }, { data: enrichment }, { data: suppressions }] = await Promise.all([
    sb.from('dashboard_play_shortlist').select('*').eq('play_id', playId).neq('status', 'removed'),
    sb.from('dashboard_enrichment_contacts').select('id, domain, email, email_verified, job_title, seniority').eq('play_id', playId).neq('status', 'archived'),
    sb.from('dashboard_suppressions').select('email').limit(5000),
  ]);

  const slist = (shortlist ?? []) as ShortlistRow[];
  const erows = (enrichment ?? []) as EnrichmentRow[];
  const suppressed = new Set(((suppressions ?? []) as SuppressionRow[]).map((r) => r.email.toLowerCase()));

  // Per-domain index of contacts.
  const contactsByDomain = new Map<string, EnrichmentRow[]>();
  for (const e of erows) {
    const d = (e.domain ?? '').toLowerCase();
    if (!d) continue;
    if (!contactsByDomain.has(d)) contactsByDomain.set(d, []);
    contactsByDomain.get(d)!.push(e);
  }

  function classifyDM(jobTitle: string | null, seniority: string | null): boolean {
    const t = `${jobTitle ?? ''} ${seniority ?? ''}`.toLowerCase();
    return /\b(ceo|cfo|cto|coo|cmo|chief|vp|vice president|director|head of)\b/.test(t);
  }

  const totalContacts = erows.length;
  const enrichedContacts = erows.filter((e) => e.email && e.email.length > 0).length;
  const decisionMakers = erows.filter((e) => classifyDM(e.job_title, e.seniority)).length;
  const reachable = erows.filter((e) => e.email && classifyDM(e.job_title, e.seniority) && !suppressed.has(e.email.toLowerCase())).length;
  const dataCoverage = totalContacts > 0 ? Math.round((enrichedContacts / totalContacts) * 100) : 0;
  const fitScores = slist.map((r) => r.fit_score).filter((n): n is number => typeof n === 'number');
  const avgFitScore = fitScores.length > 0 ? Math.round(fitScores.reduce((a, b) => a + b, 0) / fitScores.length) : 0;

  // Per-row aggregation.
  const rows = slist.map((r) => {
    const dContacts = contactsByDomain.get(r.domain.toLowerCase()) ?? [];
    const dDM = dContacts.filter((c) => classifyDM(c.job_title, c.seniority)).length;
    const dEnriched = dContacts.filter((c) => c.email).length;
    const dCoverage = dContacts.length > 0 ? Math.round((dEnriched / dContacts.length) * 100) : 0;
    return {
      id: r.id,
      domain: r.domain,
      name: r.name,
      industry: r.industry,
      size: r.employees,
      revenue: r.revenue,
      location: r.location,
      fitScore: r.fit_score,
      decisionMakerCount: dDM,
      dataCoverage: dCoverage,
      status: r.status,
      logoUrl: r.logo_url,
    };
  }).sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));

  // Top industries breakdown (% of total).
  const industryCounts = new Map<string, number>();
  for (const r of slist) {
    const ind = (r.industry ?? 'Other').trim() || 'Other';
    industryCounts.set(ind, (industryCounts.get(ind) ?? 0) + 1);
  }
  const total = slist.length;
  let topIndustries = Array.from(industryCounts.entries())
    .map(([name, count]) => ({ name, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
  if (topIndustries.length > 4) {
    const top = topIndustries.slice(0, 3);
    const rest = topIndustries.slice(3);
    const others = rest.reduce((sum, x) => sum + x.count, 0);
    topIndustries = [...top, { name: 'Others', count: others, pct: total > 0 ? Math.round((others / total) * 100) : 0 }];
  }

  return NextResponse.json({
    ok: true,
    stats: {
      companiesFound: slist.length,
      decisionMakers,
      dataCoverage,
      estimatedReachable: reachable,
      avgFitScore,
      pctOfDM: decisionMakers > 0 ? Math.round((reachable / decisionMakers) * 100) : 0,
    },
    rows,
    topIndustries,
  });
}
