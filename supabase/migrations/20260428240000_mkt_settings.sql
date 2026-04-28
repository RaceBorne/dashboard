-- Singleton settings row for marketing globals: frequency cap (max sends
-- per contact in a rolling window), other future global toggles. One
-- row keyed 'singleton' so the read path is always identical.

create table if not exists public.dashboard_mkt_settings (
  id text primary key default 'singleton' check (id = 'singleton'),
  frequency_cap_count int not null default 0,
  frequency_cap_days int not null default 7,
  updated_at timestamptz not null default now()
);

insert into public.dashboard_mkt_settings (id) values ('singleton')
  on conflict (id) do nothing;
