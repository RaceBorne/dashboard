-- Google Search Console — nightly rollup.
--
-- One row per (site, query) with the last 28-day totals for clicks, impressions,
-- CTR, and average position. Overwritten on each ingest by truncating and
-- re-inserting (we don't need historical snapshots for the Keywords page yet).
--
-- Pages rollup is symmetric: one row per (site, page).

create table if not exists public.dashboard_gsc_queries_28d (
  site_url     text not null,
  query        text not null,
  clicks       integer not null default 0,
  impressions  integer not null default 0,
  ctr          double precision not null default 0,
  position     double precision not null default 0,
  window_start date not null,
  window_end   date not null,
  fetched_at   timestamptz not null default now(),
  primary key (site_url, query)
);

create index if not exists dashboard_gsc_queries_28d_impr_idx
  on public.dashboard_gsc_queries_28d (site_url, impressions desc);

create index if not exists dashboard_gsc_queries_28d_clicks_idx
  on public.dashboard_gsc_queries_28d (site_url, clicks desc);

alter table public.dashboard_gsc_queries_28d enable row level security;

create table if not exists public.dashboard_gsc_pages_28d (
  site_url     text not null,
  page         text not null,
  clicks       integer not null default 0,
  impressions  integer not null default 0,
  ctr          double precision not null default 0,
  position     double precision not null default 0,
  window_start date not null,
  window_end   date not null,
  fetched_at   timestamptz not null default now(),
  primary key (site_url, page)
);

create index if not exists dashboard_gsc_pages_28d_impr_idx
  on public.dashboard_gsc_pages_28d (site_url, impressions desc);

create index if not exists dashboard_gsc_pages_28d_clicks_idx
  on public.dashboard_gsc_pages_28d (site_url, clicks desc);

alter table public.dashboard_gsc_pages_28d enable row level security;
