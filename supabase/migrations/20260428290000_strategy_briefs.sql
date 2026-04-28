-- Per-idea strategy brief. One row per play, jsonb-leaning so the
-- vertical step builder (brief, target profile, ideal customer,
-- channels, messaging, success metrics, handoff) can extend without
-- migrations. play_id is text since dashboard_plays.id is text.

create table if not exists public.dashboard_strategy_briefs (
  id uuid primary key default gen_random_uuid(),
  play_id text not null unique references public.dashboard_plays (id) on delete cascade,
  campaign_name text,
  objective text,
  target_audience text[],
  geography text,
  industries text[],
  company_size_min int,
  company_size_max int,
  revenue_min text,
  revenue_max text,
  channels text[],
  messaging jsonb,
  success_metrics jsonb,
  ideal_customer text,
  handoff_status text default 'draft' check (handoff_status in ('draft', 'ready', 'handed_off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dashboard_strategy_briefs_play_idx
  on public.dashboard_strategy_briefs (play_id);
