-- Singleton row for the homepage tile canvas. Holds the layout
-- (positions, sizes, widget assignments) and the display prefs
-- (showGrid, glass, bgImage data URL). Both as jsonb so we can
-- evolve the shape without further migrations.

create table if not exists public.dashboard_home_canvas (
  id text primary key default 'singleton' check (id = 'singleton'),
  tiles jsonb,
  prefs jsonb,
  updated_at timestamptz not null default now()
);

insert into public.dashboard_home_canvas (id) values ('singleton')
  on conflict (id) do nothing;
