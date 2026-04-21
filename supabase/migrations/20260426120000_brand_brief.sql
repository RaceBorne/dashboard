-- Brand brief storage. One row per id. We seed a single 'brand_brief' row.
-- Everything the AI needs to ground its output about Evari lives in payload.

create table if not exists public.dashboard_brand_brief (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.dashboard_brand_brief is
  'Brand grounding for every AI call (Spitball, Strategy, Scope, Synopsis). Refreshed weekly by /api/cron/brand-refresh.';

create index if not exists dashboard_brand_brief_updated_at_idx
  on public.dashboard_brand_brief (updated_at);
