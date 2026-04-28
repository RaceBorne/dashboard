-- Native multi-email sequences inside campaigns. campaigns.sequence
-- carries the step list when present; a separate scheduled_steps
-- table queues subsequent steps for the cron to fire.

alter table public.dashboard_mkt_campaigns
  add column if not exists sequence jsonb;

create table if not exists public.dashboard_mkt_scheduled_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.dashboard_mkt_campaigns (id) on delete cascade,
  step_index int not null,
  run_after timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'sent', 'skipped', 'failed')),
  payload jsonb,
  created_at timestamptz not null default now(),
  ran_at timestamptz
);
create index if not exists dashboard_mkt_scheduled_steps_due_idx
  on public.dashboard_mkt_scheduled_steps (status, run_after);
create index if not exists dashboard_mkt_scheduled_steps_campaign_idx
  on public.dashboard_mkt_scheduled_steps (campaign_id);
