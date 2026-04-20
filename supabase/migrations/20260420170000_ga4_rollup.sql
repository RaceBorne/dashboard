-- Google Analytics 4 — nightly rollup.
--
-- Reuses the existing `dashboard_traffic_days` (one row per day) and
-- `dashboard_traffic_sources` tables — the ingest simply upserts into them.
-- This migration adds the supporting bits:
--
--   1. `dashboard_ga4_sync_log` so we can see when the last ingest ran and
--       what it wrote. One row per ingest run.
--   2. `dashboard_ga4_pages_28d` — top pages by sessions over the last 28d,
--       used by the Traffic page's top-content strip.
--   3. A geo table so the Traffic page can draw the world + UK map.

create table if not exists public.dashboard_ga4_sync_log (
  id           bigserial primary key,
  property_id  text not null,
  ran_at       timestamptz not null default now(),
  window_start date not null,
  window_end   date not null,
  rows_days    integer not null default 0,
  rows_sources integer not null default 0,
  rows_pages   integer not null default 0,
  rows_geo     integer not null default 0,
  duration_ms  integer not null default 0,
  ok           boolean not null default true,
  error        text
);

create index if not exists dashboard_ga4_sync_log_ran_idx
  on public.dashboard_ga4_sync_log (ran_at desc);

alter table public.dashboard_ga4_sync_log enable row level security;

create table if not exists public.dashboard_ga4_pages_28d (
  property_id text not null,
  page_path   text not null,
  sessions    integer not null default 0,
  users       integer not null default 0,
  bounce_rate double precision not null default 0,
  avg_duration_sec integer not null default 0,
  conversions integer not null default 0,
  window_start date not null,
  window_end   date not null,
  fetched_at   timestamptz not null default now(),
  primary key (property_id, page_path)
);

create index if not exists dashboard_ga4_pages_28d_sessions_idx
  on public.dashboard_ga4_pages_28d (property_id, sessions desc);

alter table public.dashboard_ga4_pages_28d enable row level security;

create table if not exists public.dashboard_ga4_geo_28d (
  property_id  text not null,
  country      text not null,
  country_code text,            -- ISO 3166-1 alpha-2 (e.g. 'GB', 'US')
  region       text,            -- sub-region / admin1 for UK map drilldown
  sessions     integer not null default 0,
  users        integer not null default 0,
  conversions  integer not null default 0,
  window_start date not null,
  window_end   date not null,
  fetched_at   timestamptz not null default now(),
  primary key (property_id, country, region)
);

create index if not exists dashboard_ga4_geo_28d_sessions_idx
  on public.dashboard_ga4_geo_28d (property_id, sessions desc);

alter table public.dashboard_ga4_geo_28d enable row level security;
