-- Fit scoring engine — editable rubric + per-company cached scores.
--
-- The rubric is a singleton; every score uses the current weights at
-- compute time. Recomputing across a venture is intentional (different
-- plays target different ICPs, so a score is keyed by (domain, play_id)).

create table if not exists public.dashboard_fit_score_criteria (
  id text primary key default 'singleton' check (id = 'singleton'),
  industry_match int not null default 5,
  company_size int not null default 5,
  revenue_potential int not null default 5,
  geographic_fit int not null default 5,
  brand_alignment int not null default 5,
  ideal_customer text,
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.dashboard_fit_score_criteria (id) values ('singleton')
  on conflict (id) do nothing;

create table if not exists public.dashboard_fit_scores (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  play_id uuid,
  score int not null check (score >= 0 and score <= 100),
  band text not null check (band in ('excellent', 'very_good', 'good', 'average', 'low')),
  reason text,
  inputs jsonb,
  created_at timestamptz not null default now(),
  unique (domain, play_id)
);

create index if not exists dashboard_fit_scores_play_idx
  on public.dashboard_fit_scores (play_id);
create index if not exists dashboard_fit_scores_domain_idx
  on public.dashboard_fit_scores (domain);
