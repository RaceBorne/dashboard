-- Klaviyo — nightly rollup for campaigns, flows, lists, and daily metrics.
--
-- Tables:
--   1. `dashboard_klaviyo_campaigns` — one row per email campaign sent
--   2. `dashboard_klaviyo_flows` — one row per automated flow
--   3. `dashboard_klaviyo_lists` — one row per list or segment
--   4. `dashboard_klaviyo_metrics_days` — daily metric rollup (last 90 days)
--   5. `dashboard_klaviyo_sync_log` — ingest run history + row counts

create table if not exists public.dashboard_klaviyo_campaigns (
  id                 text primary key,
  name               text not null,
  subject_line       text,
  send_time          timestamptz,
  status             text,
  num_recipients     integer not null default 0,
  opens              integer not null default 0,
  opens_unique       integer not null default 0,
  clicks             integer not null default 0,
  clicks_unique      integer not null default 0,
  revenue            numeric not null default 0,
  orders             integer not null default 0,
  unsubscribes       integer not null default 0,
  bounced            integer not null default 0,
  fetched_at         timestamptz not null default now()
);

create index if not exists dashboard_klaviyo_campaigns_send_time_idx
  on public.dashboard_klaviyo_campaigns (send_time desc);

alter table public.dashboard_klaviyo_campaigns enable row level security;

create table if not exists public.dashboard_klaviyo_flows (
  id                 text primary key,
  name               text not null,
  status             text,
  trigger_type       text,
  created            timestamptz,
  updated            timestamptz,
  recipients_28d     integer not null default 0,
  opens_28d          integer not null default 0,
  clicks_28d         integer not null default 0,
  revenue_28d        numeric not null default 0,
  orders_28d         integer not null default 0,
  fetched_at         timestamptz not null default now()
);

alter table public.dashboard_klaviyo_flows enable row level security;

create table if not exists public.dashboard_klaviyo_lists (
  id                 text primary key,
  name               text not null,
  type               text,
  profile_count      integer not null default 0,
  created            timestamptz,
  updated            timestamptz,
  fetched_at         timestamptz not null default now()
);

alter table public.dashboard_klaviyo_lists enable row level security;

create table if not exists public.dashboard_klaviyo_metrics_days (
  day                date not null,
  metric_id          text not null,
  metric_name        text not null,
  count              integer not null default 0,
  value              numeric not null default 0,
  fetched_at         timestamptz not null default now(),
  primary key (day, metric_id)
);

create index if not exists dashboard_klaviyo_metrics_days_metric_idx
  on public.dashboard_klaviyo_metrics_days (metric_id, day desc);

alter table public.dashboard_klaviyo_metrics_days enable row level security;

create table if not exists public.dashboard_klaviyo_sync_log (
  id                 bigserial primary key,
  ran_at             timestamptz not null default now(),
  window_start       date not null,
  window_end         date not null,
  rows_campaigns     integer not null default 0,
  rows_flows         integer not null default 0,
  rows_lists         integer not null default 0,
  rows_metric_days   integer not null default 0,
  duration_ms        integer not null default 0,
  ok                 boolean not null default true,
  error              text
);

create index if not exists dashboard_klaviyo_sync_log_ran_idx
  on public.dashboard_klaviyo_sync_log (ran_at desc);

alter table public.dashboard_klaviyo_sync_log enable row level security;
