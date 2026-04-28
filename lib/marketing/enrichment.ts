/**
 * Enrichment surface — per-play (or per-shortlisted-company) contact
 * cards with AI summary, suggested tags, recent signals.
 *
 * For now signals + LinkedIn URL come in stubbed; data-providers
 * integration is a follow-up. The status enum drives the tabs:
 * needs_review (default), ready, archived.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export type EnrichmentStatus = 'needs_review' | 'ready' | 'archived';

export interface EnrichmentSignal {
  type: 'linkedin_post' | 'event' | 'news' | 'announcement';
  text: string;
  date?: string | null;
}

export interface EnrichmentContact {
  id: string;
  playId: string | null;
  shortlistId: string | null;
  domain: string | null;
  companyName: string | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emailVerified: boolean;
  jobTitle: string | null;
  department: string | null;
  seniority: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  fitScore: number | null;
  aiSummary: string | null;
  suggestedTags: string[];
  signals: EnrichmentSignal[];
  status: EnrichmentStatus;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  play_id: string | null;
  shortlist_id: string | null;
  domain: string | null;
  company_name: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_verified: boolean | null;
  job_title: string | null;
  department: string | null;
  seniority: string | null;
  linkedin_url: string | null;
  phone: string | null;
  fit_score: number | null;
  ai_summary: string | null;
  suggested_tags: string[] | null;
  signals: EnrichmentSignal[] | null;
  status: EnrichmentStatus;
  created_at: string;
  updated_at: string;
}

function rowToContact(r: Row): EnrichmentContact {
  return {
    id: r.id,
    playId: r.play_id,
    shortlistId: r.shortlist_id,
    domain: r.domain,
    companyName: r.company_name,
    fullName: r.full_name,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    emailVerified: r.email_verified ?? false,
    jobTitle: r.job_title,
    department: r.department,
    seniority: r.seniority,
    linkedinUrl: r.linkedin_url,
    phone: r.phone,
    fitScore: r.fit_score,
    aiSummary: r.ai_summary,
    suggestedTags: r.suggested_tags ?? [],
    signals: r.signals ?? [],
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listEnrichment(playId: string): Promise<EnrichmentContact[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_enrichment_contacts')
    .select('*')
    .eq('play_id', playId)
    .neq('status', 'archived')
    .order('fit_score', { ascending: false, nullsFirst: false });
  if (error) {
    console.error('[enrichment.list]', error);
    return [];
  }
  return ((data ?? []) as Row[]).map(rowToContact);
}

export async function setEnrichmentStatus(playId: string, ids: string[], status: EnrichmentStatus): Promise<number> {
  if (ids.length === 0) return 0;
  const sb = createSupabaseAdmin();
  if (!sb) return 0;
  const { error } = await sb
    .from('dashboard_enrichment_contacts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('play_id', playId)
    .in('id', ids)
    ;
  if (error) {
    console.error('[enrichment.setStatus]', error);
    return 0;
  }
  return ids.length;
}

interface AddInput {
  playId: string;
  shortlistId?: string | null;
  domain?: string | null;
  companyName: string;
  fullName: string;
  email?: string | null;
  jobTitle?: string | null;
  linkedinUrl?: string | null;
  fitScore?: number | null;
  aiSummary?: string | null;
  suggestedTags?: string[] | null;
  signals?: EnrichmentSignal[] | null;
}

export async function addEnrichmentContact(input: AddInput): Promise<EnrichmentContact | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const parts = input.fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? null;
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
  const { data, error } = await sb
    .from('dashboard_enrichment_contacts')
    .insert({
      play_id: input.playId,
      shortlist_id: input.shortlistId ?? null,
      domain: input.domain ?? null,
      company_name: input.companyName,
      full_name: input.fullName,
      first_name: firstName,
      last_name: lastName,
      email: input.email ?? null,
      job_title: input.jobTitle ?? null,
      linkedin_url: input.linkedinUrl ?? null,
      fit_score: input.fitScore ?? null,
      ai_summary: input.aiSummary ?? null,
      suggested_tags: input.suggestedTags ?? null,
      signals: input.signals ?? null,
    })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[enrichment.add]', error);
    return null;
  }
  return rowToContact(data as Row);
}

export interface EnrichmentSummary {
  found: number;
  enriched: number;
  verified: number;
  jobTitled: number;
  ready: number;
}

export async function enrichmentSummary(playId: string): Promise<EnrichmentSummary> {
  const sb = createSupabaseAdmin();
  if (!sb) return { found: 0, enriched: 0, verified: 0, jobTitled: 0, ready: 0 };
  const { data } = await sb
    .from('dashboard_enrichment_contacts')
    .select('id, email, email_verified, job_title, status')
    .eq('play_id', playId)
    .neq('status', 'archived');
  let found = 0, enriched = 0, verified = 0, jobTitled = 0, ready = 0;
  for (const r of (data ?? []) as { id: string; email: string | null; email_verified: boolean | null; job_title: string | null; status: EnrichmentStatus }[]) {
    found++;
    if (r.email) enriched++;
    if (r.email && r.email_verified) verified++;
    if (r.job_title) jobTitled++;
    if (r.status === 'ready') ready++;
  }
  return { found, enriched, verified, jobTitled, ready };
}
