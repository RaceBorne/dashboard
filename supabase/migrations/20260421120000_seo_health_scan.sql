-- Latest SEO Health scan snapshot (survives serverless cold starts / refresh).
-- Written by the app after each scan or batch of fixes; read on hydrate.

create table if not exists public.dashboard_seo_health_scan (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.dashboard_seo_health_scan enable row level security;
