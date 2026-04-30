/**
 * Per-idea shortlist of candidate companies.
 *
 * Discovery writes companies in with status='candidate'. The Shortlist
 * page lets the operator promote ('shortlisted') or demote ('low_fit')
 * or remove ('removed' / hard delete). When a candidate is added, we
 * also try to compute its fit score so the list view can sort/filter
 * by score immediately.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { scoreCompany, type CandidateInput } from '@/lib/marketing/fitScore';

export type ShortlistStatus = 'candidate' | 'shortlisted' | 'low_fit' | 'removed';

export interface AboutMeta {
  address?: string | null;
  phone?: string | null;
  employeeRange?: string | null;
  orgType?: string | null;
  generatedAt?: string;
}

export interface ShortlistEntry {
  id: string;
  playId: string;
  domain: string;
  name: string;
  industry: string | null;
  employees: string | null;
  revenue: string | null;
  location: string | null;
  description: string | null;
  fitScore: number | null;
  fitBand: string | null;
  fitReason: string | null;
  status: ShortlistStatus;
  addedAt: string;
  // Cached enrichment from Discovery's prefetch loop. Travels with
  // the row through Shortlist + Enrichment so the drawer hits cached
  // data instead of re-spending the AI budget.
  aboutText: string | null;
  aboutMeta: AboutMeta | null;
  notes: string | null;
  logoUrl: string | null;
}

interface Row {
  id: string; play_id: string; domain: string; name: string;
  industry: string | null; employees: string | null; revenue: string | null;
  location: string | null; description: string | null;
  fit_score: number | null; fit_band: string | null; fit_reason: string | null;
  status: ShortlistStatus; added_at: string;
  about_text: string | null;
  about_meta: AboutMeta | null;
  notes: string | null;
  logo_url: string | null;
}

function rowToEntry(r: Row): ShortlistEntry {
  return {
    id: r.id, playId: r.play_id, domain: r.domain, name: r.name,
    industry: r.industry, employees: r.employees, revenue: r.revenue,
    location: r.location, description: r.description,
    fitScore: r.fit_score, fitBand: r.fit_band, fitReason: r.fit_reason,
    status: r.status, addedAt: r.added_at,
    aboutText: r.about_text,
    aboutMeta: r.about_meta,
    notes: r.notes,
    logoUrl: r.logo_url ?? `https://logo.clearbit.com/${r.domain}`,
  };
}

export async function listShortlist(playId: string): Promise<ShortlistEntry[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_play_shortlist')
    .select('*')
    .eq('play_id', playId)
    .neq('status', 'removed')
    .order('fit_score', { ascending: false, nullsFirst: false });
  if (error) {
    console.error('[shortlist.list]', error);
    return [];
  }
  return ((data ?? []) as Row[]).map(rowToEntry);
}

export async function addCandidate(playId: string, candidate: CandidateInput): Promise<ShortlistEntry | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  // Score in parallel with insert; we'll write the score back if successful.
  const score = await scoreCompany(candidate, playId);
  const { data, error } = await sb
    .from('dashboard_play_shortlist')
    .upsert({
      play_id: playId,
      domain: candidate.domain,
      name: candidate.name,
      industry: candidate.industry ?? null,
      employees: candidate.employeeBand ?? null,
      revenue: candidate.revenue ?? null,
      location: candidate.location ?? null,
      description: candidate.description ?? null,
      fit_score: score?.score ?? null,
      fit_band: score?.band ?? null,
      fit_reason: score?.reason ?? null,
      status: 'candidate',
    }, { onConflict: 'play_id,domain' })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[shortlist.add]', error);
    return null;
  }
  return rowToEntry(data as Row);
}

export async function setStatus(playId: string, ids: string[], status: ShortlistStatus): Promise<number> {
  if (ids.length === 0) return 0;
  const sb = createSupabaseAdmin();
  if (!sb) return 0;
  const { error } = await sb
    .from('dashboard_play_shortlist')
    .update({ status })
    .eq('play_id', playId)
    .in('id', ids)
    ;
  if (error) {
    console.error('[shortlist.setStatus]', error);
    return 0;
  }
  return ids.length;
}

export async function removeFromShortlist(playId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const sb = createSupabaseAdmin();
  if (!sb) return 0;
  const { error } = await sb
    .from('dashboard_play_shortlist')
    .delete({ count: 'exact' })
    .eq('play_id', playId)
    .in('id', ids);
  if (error) {
    console.error('[shortlist.remove]', error);
    return 0;
  }
  return ids.length;
}

export async function shortlistCounts(playId: string): Promise<{
  total: number; high: number; medium: number; low: number; shortlisted: number;
}> {
  const sb = createSupabaseAdmin();
  if (!sb) return { total: 0, high: 0, medium: 0, low: 0, shortlisted: 0 };
  const { data } = await sb
    .from('dashboard_play_shortlist')
    .select('id, fit_score, status')
    .eq('play_id', playId)
    .neq('status', 'removed');
  let total = 0, high = 0, medium = 0, low = 0, shortlisted = 0;
  for (const r of (data ?? []) as { id: string; fit_score: number | null; status: ShortlistStatus }[]) {
    total++;
    const sc = r.fit_score ?? 0;
    if (sc >= 80) high++;
    else if (sc >= 60) medium++;
    else low++;
    if (r.status === 'shortlisted') shortlisted++;
  }
  return { total, high, medium, low, shortlisted };
}
