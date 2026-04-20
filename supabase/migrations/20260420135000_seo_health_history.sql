-- SEO Health history — append-only log of scan + fix events.
-- One row per scan-complete and per successful apply-batch so the dashboard
-- can chart score/findings over time and surface fix velocity.

create table if not exists public.dashboard_seo_health_history (
  id bigserial primary key,
  recorded_at timestamptz not null default now(),
  -- 'scan' when runScan finishes; 'fix' when an apply batch commits.
  event text not null check (event in ('scan', 'fix')),
  score int not null,
  findings_total int not null,
  -- {title-missing: 5, meta-missing: 3, ...} — per-check counts for stacked views.
  findings_by_check jsonb not null default '{}'::jsonb,
  -- {products: 37, pages: 14, articles: 12} — only populated on scan events.
  scanned_entities jsonb,
  -- Change in findings_total since previous row (negative = fixes landed).
  -- Null on the very first row and on scan events where no prior exists.
  delta int
);

create index if not exists dashboard_seo_health_history_recorded_at_idx
  on public.dashboard_seo_health_history (recorded_at desc);

alter table public.dashboard_seo_health_history enable row level security;
