/**
 * Strategy analytics — derive Target profile + Ideal customer
 * numbers from real Supabase tables for a single play.
 *
 * Sources:
 *   strategy brief (industries, geography, size, revenue, ICP prose)
 *   shortlist     (count + fit_score for revenue / engagement proxy)
 *   enrichment    (count + seniority + job_title for personas)
 *   fit rubric    (singleton score weights)
 *
 * No LLM calls — these read what's already there.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getOrCreateBrief } from './strategy';
import { getFitCriteria } from './fitScore';

export type SeniorityKey = 'c_level' | 'vp' | 'director' | 'head' | 'manager' | 'other';

export interface BreakdownEntry {
  key: string;
  label: string;
  count: number;
  pct: number; // 0..100
}

export interface StrategyAnalytics {
  // Headline ICP score (0..100). Avg of avg(shortlist.fit_score) and the
  // rubric's normalised weight average. Falls back to 60 when no data.
  icpScore: number;
  icpBand: 'excellent' | 'very_good' | 'good' | 'average' | 'low';

  // Headline numbers across the funnel
  addressableMarket: number;     // shortlist.total
  highFitCount: number;          // shortlist where fit_score >= 80
  reachableContacts: number;     // enrichment count
  decisionMakerCount: number;    // enrichment where seniority is decision-maker
  revenuePotentialLabel: string; // textual range
  engagementLikelihood: 'High' | 'Medium' | 'Low' | 'Unknown';

  // Persona donut + seniority pie
  decisionMakers: BreakdownEntry[];
  seniorityMix: BreakdownEntry[];

  // Ideal company profile (from strategy brief)
  industries: string[];
  companySizeMin: number | null;
  companySizeMax: number | null;
  revenueMin: string | null;
  revenueMax: string | null;
  locations: string[];
  industryFitPct: number;        // % of shortlisted companies whose industry matches brief.industries

  // Ideal customer extras (heuristic, drawn from shortlisted descriptions)
  techStack: string[];           // best-effort: any tech keywords seen in descriptions
  buyingSignals: string[];       // best-effort: keyword extraction
  idealCustomerSummary: string;  // brief.idealCustomer (or composed if blank)
  bestFitCompaniesCount: number; // shortlisted with score >= 80
  winRateHistorical: number | null; // % from past sent campaigns when present
}

const SENIORITY_LABELS: Record<SeniorityKey, string> = {
  c_level: 'C-Level', vp: 'VP', director: 'Director', head: 'Head of Dept',
  manager: 'Manager', other: 'Other',
};

function classifySeniority(jobTitle: string | null, seniority: string | null): SeniorityKey {
  const t = `${jobTitle ?? ''} ${seniority ?? ''}`.toLowerCase();
  if (/\b(ceo|cfo|cto|coo|cmo|chief)\b/.test(t)) return 'c_level';
  if (/\bvp\b|vice president/.test(t)) return 'vp';
  if (/\bdirector\b/.test(t)) return 'director';
  if (/\bhead of\b/.test(t)) return 'head';
  if (/\bmanager\b/.test(t)) return 'manager';
  return 'other';
}

const DECISION_MAKER_KEYS: SeniorityKey[] = ['c_level', 'vp', 'director', 'head'];

function normaliseToBreakdown(counts: Map<string, number>, labels: Record<string, string>): BreakdownEntry[] {
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  return Array.from(counts.entries()).map(([key, count]) => ({
    key,
    label: labels[key] ?? key,
    count,
    pct: total > 0 ? Math.round((count / total) * 100) : 0,
  })).sort((a, b) => b.count - a.count);
}

function bandFor(score: number): StrategyAnalytics['icpBand'] {
  if (score >= 90) return 'excellent';
  if (score >= 80) return 'very_good';
  if (score >= 70) return 'good';
  if (score >= 50) return 'average';
  return 'low';
}

const TECH_KEYWORDS = [
  'salesforce', 'hubspot', 'microsoft 365', 'google workspace', 'aws', 'azure', 'gcp',
  'shopify', 'stripe', 'klaviyo', 'mailchimp', 'segment', 'snowflake', 'databricks',
  'tableau', 'looker', 'power bi', 'linkedin sales navigator', 'zoominfo', 'apollo',
  'marketo', 'pardot', 'intercom', 'zendesk', 'asana', 'monday', 'notion', 'slack',
];

const SIGNAL_KEYWORDS = [
  ['recent funding', 'raised', 'series a', 'series b', 'investment'],
  ['hiring', 'recruiting', 'expanding team'],
  ['new technology', 'new product launch', 'new platform'],
  ['expansion to new markets', 'expanding internationally', 'new region'],
  ['engagement with content', 'content marketing', 'thought leadership'],
];

export async function getStrategyAnalytics(playId: string): Promise<StrategyAnalytics> {
  const sb = createSupabaseAdmin();
  const brief = await getOrCreateBrief(playId);
  const criteria = await getFitCriteria();

  const empty: StrategyAnalytics = {
    icpScore: 60, icpBand: 'average',
    addressableMarket: 0, highFitCount: 0, reachableContacts: 0, decisionMakerCount: 0,
    revenuePotentialLabel: brief?.revenueMin && brief?.revenueMax ? `${brief.revenueMin} – ${brief.revenueMax}` : '—',
    engagementLikelihood: 'Unknown',
    decisionMakers: [], seniorityMix: [],
    industries: brief?.industries ?? [],
    companySizeMin: brief?.companySizeMin ?? null,
    companySizeMax: brief?.companySizeMax ?? null,
    revenueMin: brief?.revenueMin ?? null,
    revenueMax: brief?.revenueMax ?? null,
    locations: brief?.geography ? [brief.geography] : [],
    industryFitPct: 0,
    techStack: [], buyingSignals: [],
    idealCustomerSummary: brief?.idealCustomer ?? '',
    bestFitCompaniesCount: 0,
    winRateHistorical: null,
  };
  if (!sb || !brief) return empty;

  // Shortlist read.
  const { data: shortlistRows } = await sb
    .from('dashboard_play_shortlist')
    .select('fit_score, industry, revenue, description')
    .eq('play_id', playId)
    .neq('status', 'removed');
  const slist = (shortlistRows ?? []) as Array<{ fit_score: number | null; industry: string | null; revenue: string | null; description: string | null }>;

  const addressableMarket = slist.length;
  const highFitCount = slist.filter((r) => (r.fit_score ?? 0) >= 80).length;
  const bestFitCompaniesCount = highFitCount;

  // Avg fit score from shortlist; fall back to rubric balance for ICP score.
  const validScores = slist.map((r) => r.fit_score).filter((n): n is number => typeof n === 'number');
  const avgShortlistFit = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : null;
  const rubricAvg = Math.round((criteria.industryMatch + criteria.companySize + criteria.revenuePotential + criteria.geographicFit + criteria.brandAlignment) * 2); // 0..100
  const icpScore = avgShortlistFit !== null ? Math.round((avgShortlistFit + rubricAvg) / 2) : rubricAvg;

  // Industry fit: % of shortlist whose industry contains any brief.industries token (case-insensitive).
  let industryFitPct = 0;
  if (brief.industries.length > 0 && slist.length > 0) {
    const wanted = brief.industries.map((s) => s.toLowerCase());
    const hits = slist.filter((r) => {
      const ind = (r.industry ?? '').toLowerCase();
      return wanted.some((w) => ind.includes(w));
    }).length;
    industryFitPct = Math.round((hits / slist.length) * 100);
  }

  // Enrichment read.
  const { data: enrRows } = await sb
    .from('dashboard_enrichment_contacts')
    .select('id, job_title, seniority')
    .eq('play_id', playId)
    .neq('status', 'archived');
  const erows = (enrRows ?? []) as Array<{ id: string; job_title: string | null; seniority: string | null }>;
  const reachableContacts = erows.length;

  // Persona / seniority breakdown.
  const counts = new Map<string, number>();
  for (const r of erows) {
    const k = classifySeniority(r.job_title, r.seniority);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const seniorityMix = normaliseToBreakdown(counts, SENIORITY_LABELS);
  // Decision makers — same buckets but limited to the four DM rows.
  const dmCounts = new Map<string, number>();
  for (const k of DECISION_MAKER_KEYS) dmCounts.set(k, counts.get(k) ?? 0);
  const decisionMakers = normaliseToBreakdown(dmCounts, SENIORITY_LABELS);
  const decisionMakerCount = decisionMakers.reduce((a, b) => a + b.count, 0);

  // Engagement likelihood — heuristic from forecast lib's open rate baseline:
  // High if avgFit >= 80, Medium if >= 60, Low otherwise. Unknown when no data.
  let engagementLikelihood: StrategyAnalytics['engagementLikelihood'] = 'Unknown';
  if (avgShortlistFit !== null) {
    engagementLikelihood = avgShortlistFit >= 80 ? 'High' : avgShortlistFit >= 60 ? 'Medium' : 'Low';
  }

  // Revenue potential label.
  const revenuePotentialLabel = brief.revenueMin && brief.revenueMax ? `${brief.revenueMin} – ${brief.revenueMax}` : (brief.revenueMin ?? brief.revenueMax ?? '—');

  // Tech stack + buying signals — extract keyword hits from descriptions.
  const allText = slist.map((r) => `${r.description ?? ''}`).join('\n').toLowerCase();
  const techStack = TECH_KEYWORDS.filter((kw) => allText.includes(kw)).map((kw) => kw.replace(/\b\w/g, (c) => c.toUpperCase()));
  const buyingSignals: string[] = [];
  for (const group of SIGNAL_KEYWORDS) {
    if (group.some((kw) => allText.includes(kw))) buyingSignals.push(group[0].replace(/\b\w/g, (c) => c.toUpperCase()));
  }

  // Win rate historical — read past campaigns' open + reply rates as a rough proxy.
  let winRateHistorical: number | null = null;
  const { data: recip } = await sb
    .from('dashboard_mkt_campaign_recipients')
    .select('id, opened_at, delivered_at')
    .gte('sent_at', new Date(Date.now() - 180 * 86400_000).toISOString());
  const rrows = (recip ?? []) as Array<{ delivered_at: string | null; opened_at: string | null }>;
  const delivered = rrows.filter((r) => r.delivered_at).length;
  const opened = rrows.filter((r) => r.opened_at).length;
  if (delivered >= 20) winRateHistorical = Math.round((opened / delivered) * 100);

  const idealCustomerSummary = brief.idealCustomer && brief.idealCustomer.trim().length > 0
    ? brief.idealCustomer
    : `Mid-market companies in ${brief.industries.join(', ') || 'your target industries'} with ${brief.companySizeMin ?? '?'} to ${brief.companySizeMax ?? '?'} employees, located in ${brief.geography ?? 'your target geography'}.`;

  return {
    icpScore, icpBand: bandFor(icpScore),
    addressableMarket, highFitCount, reachableContacts, decisionMakerCount,
    revenuePotentialLabel, engagementLikelihood,
    decisionMakers, seniorityMix,
    industries: brief.industries,
    companySizeMin: brief.companySizeMin, companySizeMax: brief.companySizeMax,
    revenueMin: brief.revenueMin, revenueMax: brief.revenueMax,
    locations: brief.geography ? [brief.geography] : [],
    industryFitPct,
    techStack, buyingSignals,
    idealCustomerSummary,
    bestFitCompaniesCount,
    winRateHistorical,
  };
}
