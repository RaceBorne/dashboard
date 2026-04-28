-- Enrichment surface — contacts found at shortlisted companies, plus
-- AI-generated bullet summary, suggested tags, and signal feed.
-- Status drives the inbox tabs (Needs review / Ready to engage / Archived).

create table if not exists public.dashboard_enrichment_contacts (
  id uuid primary key default gen_random_uuid(),
  play_id text references public.dashboard_plays (id) on delete set null,
  shortlist_id uuid references public.dashboard_play_shortlist (id) on delete set null,
  domain text,
  company_name text,
  full_name text,
  first_name text,
  last_name text,
  email text,
  email_verified boolean default false,
  job_title text,
  department text,
  seniority text,
  linkedin_url text,
  phone text,
  fit_score int,
  ai_summary text,
  suggested_tags text[],
  signals jsonb,
  status text not null default 'needs_review' check (status in ('needs_review', 'ready', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dashboard_enrichment_contacts_play_idx
  on public.dashboard_enrichment_contacts (play_id);
create index if not exists dashboard_enrichment_contacts_shortlist_idx
  on public.dashboard_enrichment_contacts (shortlist_id);
create index if not exists dashboard_enrichment_contacts_status_idx
  on public.dashboard_enrichment_contacts (play_id, status);
