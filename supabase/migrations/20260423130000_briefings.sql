-- Morning briefings — persisted output of the 6am daily cron.
--
-- One row per calendar day (Europe/London). Row carries the rendered
-- markdown briefing plus the payload snapshot it was generated from,
-- so we can re-render / debug / A/B voices later without re-running
-- the ingests.
--
-- `source` records who/what triggered the write:
--   - 'cron'    — nightly 06:00 cron
--   - 'manual'  — POST /api/briefing (on-demand regenerate)
--
-- Upserting by date means a manual regen in the afternoon replaces the
-- cron-generated morning one — intentional; the latest snapshot is the
-- most-informed.

create table if not exists public.dashboard_briefings (
  brief_date   date primary key,
  markdown     text not null,
  payload      jsonb not null,
  source       text not null default 'manual',
  mock         boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_dashboard_briefings_created_at
  on public.dashboard_briefings (created_at desc);

create or replace function public.dashboard_briefings_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dashboard_briefings_touch on public.dashboard_briefings;
create trigger dashboard_briefings_touch
  before update on public.dashboard_briefings
  for each row execute function public.dashboard_briefings_touch();
