-- Per-idea (per-play) shortlist of candidate companies. Discovery
-- pumps companies in here with status='candidate'; the operator
-- promotes to 'shortlisted', demotes to 'low_fit', or removes. The
-- fit score + reason are cached on the row so list views stay cheap.

create table if not exists public.dashboard_play_shortlist (
  id uuid primary key default gen_random_uuid(),
  play_id text not null references public.dashboard_plays (id) on delete cascade,
  domain text not null,
  name text not null,
  industry text,
  employees text,
  revenue text,
  location text,
  description text,
  fit_score int,
  fit_band text,
  fit_reason text,
  status text not null default 'candidate' check (status in ('candidate', 'shortlisted', 'low_fit', 'removed')),
  added_at timestamptz not null default now(),
  unique (play_id, domain)
);

create index if not exists dashboard_play_shortlist_play_idx
  on public.dashboard_play_shortlist (play_id);
create index if not exists dashboard_play_shortlist_status_idx
  on public.dashboard_play_shortlist (play_id, status);
