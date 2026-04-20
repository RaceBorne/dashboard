-- PageSpeed Insights — per-URL daily snapshots.
--
-- One row per (url, strategy, snapshot_date). The cron overwrites today's row
-- on every run (idempotent), so re-running the job never double-counts but
-- historical days are preserved for trend charts.
--
-- We also store the raw numeric values (not rounded) so the UI can decide
-- how to format. Score is 0-1 (matches PSI's own scale).

create table if not exists public.dashboard_psi_snapshots (
  url               text not null,
  strategy          text not null check (strategy in ('mobile', 'desktop')),
  snapshot_date     date not null,
  performance_score double precision not null default 0,
  lcp_sec           double precision not null default 0,
  cls_score         double precision not null default 0,
  inp_ms            double precision not null default 0,
  fcp_sec           double precision not null default 0,
  ttfb_sec          double precision not null default 0,
  si_sec            double precision not null default 0,
  tbt_ms            double precision not null default 0,
  fetched_at        timestamptz not null default now(),
  primary key (url, strategy, snapshot_date)
);

create index if not exists dashboard_psi_snapshots_latest_idx
  on public.dashboard_psi_snapshots (url, strategy, snapshot_date desc);

create index if not exists dashboard_psi_snapshots_date_idx
  on public.dashboard_psi_snapshots (snapshot_date desc);

alter table public.dashboard_psi_snapshots enable row level security;

-- Target list: which URLs the nightly cron should audit.
-- Pre-seeded with the Evari homepage; expand manually via SQL or the
-- /settings UI once that's wired.
create table if not exists public.dashboard_psi_targets (
  url        text primary key,
  label      text,
  priority   integer not null default 100,
  created_at timestamptz not null default now()
);

alter table public.dashboard_psi_targets enable row level security;

insert into public.dashboard_psi_targets (url, label, priority)
values
  ('https://evari.cc/', 'Home', 10),
  ('https://evari.cc/collections/all', 'Shop — All bikes', 20),
  ('https://evari.cc/pages/about', 'About', 30)
on conflict (url) do nothing;
