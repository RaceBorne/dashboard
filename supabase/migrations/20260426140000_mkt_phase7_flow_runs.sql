-- Per-contact execution state for an active flow.

create table if not exists public.dashboard_mkt_flow_runs (
  id                  uuid primary key default gen_random_uuid(),
  flow_id             uuid not null references public.dashboard_mkt_flows(id) on delete cascade,
  contact_id          uuid not null references public.dashboard_mkt_contacts(id) on delete cascade,
  current_step_order  integer not null default 0,
  status              text not null default 'pending'
                      check (status in ('pending', 'waiting', 'running', 'completed', 'failed', 'cancelled')),
  wake_at             timestamptz,
  trigger_event_id    uuid,
  trigger_event_type  text,
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create unique index if not exists dashboard_mkt_flow_runs_unique_active
  on public.dashboard_mkt_flow_runs (flow_id, contact_id)
  where status in ('pending', 'waiting', 'running');

create index if not exists dashboard_mkt_flow_runs_due_idx
  on public.dashboard_mkt_flow_runs (status, wake_at);

create index if not exists dashboard_mkt_flow_runs_flow_idx
  on public.dashboard_mkt_flow_runs (flow_id, created_at desc);

alter table public.dashboard_mkt_flow_runs enable row level security;

drop trigger if exists dashboard_mkt_flow_runs_updated_at on public.dashboard_mkt_flow_runs;
create trigger dashboard_mkt_flow_runs_updated_at
  before update on public.dashboard_mkt_flow_runs
  for each row execute function public.dashboard_mkt_set_updated_at();
