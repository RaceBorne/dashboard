/**
 * Fit scoring engine.
 *
 * Reads the singleton rubric (weights + ideal-customer prose), runs an
 * LLM scorer over each candidate (uses the brand brief grounding via
 * buildSystemPrompt), and caches the result keyed by (domain, play_id).
 *
 * Score is 0..100. Band is the textual bucket the UI uses next to the
 * number (Excellent / Very good / Good / Average / Low).
 *
 * Rubric weights are 0..10. They're forwarded into the prompt so the
 * model knows which axes to weight. We don't mathematically combine —
 * the model returns the final integer plus a one-line reason.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { buildSystemPrompt, generateTextWithFallback, hasAIGatewayCredentials } from '@/lib/ai/gateway';

export interface FitCriteria {
  industryMatch: number;
  companySize: number;
  revenuePotential: number;
  geographicFit: number;
  brandAlignment: number;
  idealCustomer: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface FitScore {
  domain: string;
  playId: string | null;
  score: number;
  band: 'excellent' | 'very_good' | 'good' | 'average' | 'low';
  reason: string | null;
  createdAt: string;
}

interface CriteriaRow {
  id: string;
  industry_match: number;
  company_size: number;
  revenue_potential: number;
  geographic_fit: number;
  brand_alignment: number;
  ideal_customer: string | null;
  notes: string | null;
  updated_at: string;
}

const DEFAULTS: FitCriteria = {
  industryMatch: 5,
  companySize: 5,
  revenuePotential: 5,
  geographicFit: 5,
  brandAlignment: 5,
  idealCustomer: null,
  notes: null,
  updatedAt: new Date(0).toISOString(),
};

export async function getFitCriteria(): Promise<FitCriteria> {
  const sb = createSupabaseAdmin();
  if (!sb) return DEFAULTS;
  const { data, error } = await sb
    .from('dashboard_fit_score_criteria')
    .select('*')
    .eq('id', 'singleton')
    .maybeSingle();
  if (error || !data) return DEFAULTS;
  const r = data as CriteriaRow;
  return {
    industryMatch: r.industry_match,
    companySize: r.company_size,
    revenuePotential: r.revenue_potential,
    geographicFit: r.geographic_fit,
    brandAlignment: r.brand_alignment,
    idealCustomer: r.ideal_customer,
    notes: r.notes,
    updatedAt: r.updated_at,
  };
}

export async function updateFitCriteria(patch: Partial<FitCriteria>): Promise<FitCriteria> {
  const sb = createSupabaseAdmin();
  if (!sb) return DEFAULTS;
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.industryMatch !== undefined) dbPatch.industry_match = clampWeight(patch.industryMatch);
  if (patch.companySize !== undefined) dbPatch.company_size = clampWeight(patch.companySize);
  if (patch.revenuePotential !== undefined) dbPatch.revenue_potential = clampWeight(patch.revenuePotential);
  if (patch.geographicFit !== undefined) dbPatch.geographic_fit = clampWeight(patch.geographicFit);
  if (patch.brandAlignment !== undefined) dbPatch.brand_alignment = clampWeight(patch.brandAlignment);
  if ('idealCustomer' in patch) dbPatch.ideal_customer = patch.idealCustomer;
  if ('notes' in patch) dbPatch.notes = patch.notes;
  await sb.from('dashboard_fit_score_criteria').upsert({ id: 'singleton', ...dbPatch }, { onConflict: 'id' });
  return getFitCriteria();
}

function clampWeight(n: number): number { return Math.max(0, Math.min(10, Math.round(n))); }

export function bandFor(score: number): FitScore['band'] {
  if (score >= 90) return 'excellent';
  if (score >= 80) return 'very_good';
  if (score >= 70) return 'good';
  if (score >= 50) return 'average';
  return 'low';
}

export interface CandidateInput {
  domain: string;
  name: string;
  industry?: string | null;
  employeeBand?: string | null;
  revenue?: string | null;
  location?: string | null;
  description?: string | null;
}

export async function scoreCompany(candidate: CandidateInput, playId?: string | null): Promise<FitScore | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  // Cache lookup first.
  const { data: existing } = await sb
    .from('dashboard_fit_scores')
    .select('*')
    .eq('domain', candidate.domain)
    .eq('play_id', playId ?? null)
    .maybeSingle();
  if (existing) return rowToFitScore(existing as Record<string, unknown>);

  if (!hasAIGatewayCredentials()) {
    // Heuristic fallback so the UI shows something even without AI.
    const score = 60;
    return persistScore(candidate.domain, playId ?? null, score, candidate);
  }

  const criteria = await getFitCriteria();
  const system = await buildSystemPrompt({
    voice: 'analyst',
    task: 'Scoring a candidate company for fit against the operator\'s ideal customer profile. Return a single JSON object only.',
  });

  const promptLines = [
    'Score this candidate 0-100 against the rubric below.',
    '',
    'RUBRIC WEIGHTS (0-10 each):',
    `  industry_match: ${criteria.industryMatch}`,
    `  company_size: ${criteria.companySize}`,
    `  revenue_potential: ${criteria.revenuePotential}`,
    `  geographic_fit: ${criteria.geographicFit}`,
    `  brand_alignment: ${criteria.brandAlignment}`,
    criteria.idealCustomer ? `\nIDEAL CUSTOMER PROSE:\n${criteria.idealCustomer}` : '',
    criteria.notes ? `\nADDITIONAL NOTES:\n${criteria.notes}` : '',
    '',
    'CANDIDATE:',
    `  domain: ${candidate.domain}`,
    `  name: ${candidate.name}`,
    `  industry: ${candidate.industry ?? '(unknown)'}`,
    `  employees: ${candidate.employeeBand ?? '(unknown)'}`,
    `  revenue: ${candidate.revenue ?? '(unknown)'}`,
    `  location: ${candidate.location ?? '(unknown)'}`,
    `  description: ${candidate.description ?? '(unknown)'}`,
    '',
    'Return JSON only: {"score": 0-100, "reason": "one short sentence, no em-dashes"}',
  ].filter(Boolean);

  try {
    const { text } = await generateTextWithFallback({
      model: process.env.AI_FIT_MODEL || 'anthropic/claude-haiku-4-5',
      system,
      prompt: promptLines.join('\n'),
      temperature: 0.1,
    });
    const start = text.indexOf('{'); const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const obj = JSON.parse(text.slice(start, end + 1)) as { score?: unknown; reason?: unknown };
      const rawScore = typeof obj.score === 'number' ? obj.score : 60;
      const score = Math.max(0, Math.min(100, Math.round(rawScore)));
      const reason = typeof obj.reason === 'string' ? obj.reason.slice(0, 200) : null;
      return persistScore(candidate.domain, playId ?? null, score, candidate, reason);
    }
  } catch (e) {
    console.warn('[fitScore.scoreCompany]', e);
  }
  return persistScore(candidate.domain, playId ?? null, 60, candidate);
}

async function persistScore(domain: string, playId: string | null, score: number, candidate: CandidateInput, reason?: string | null): Promise<FitScore | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const band = bandFor(score);
  const { data, error } = await sb
    .from('dashboard_fit_scores')
    .upsert({
      domain,
      play_id: playId,
      score,
      band,
      reason: reason ?? null,
      inputs: candidate as unknown as Record<string, unknown>,
    }, { onConflict: 'domain,play_id' })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[fitScore.persist]', error);
    return null;
  }
  return rowToFitScore(data as Record<string, unknown>);
}

function rowToFitScore(row: Record<string, unknown>): FitScore {
  return {
    domain: row.domain as string,
    playId: (row.play_id as string | null) ?? null,
    score: row.score as number,
    band: row.band as FitScore['band'],
    reason: (row.reason as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function getCachedScores(domains: string[], playId?: string | null): Promise<Record<string, FitScore>> {
  const sb = createSupabaseAdmin();
  if (!sb || domains.length === 0) return {};
  const { data } = await sb
    .from('dashboard_fit_scores')
    .select('*')
    .in('domain', domains)
    .eq('play_id', playId ?? null);
  const out: Record<string, FitScore> = {};
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const fs = rowToFitScore(row);
    out[fs.domain] = fs;
  }
  return out;
}
