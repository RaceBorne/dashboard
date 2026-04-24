-- Branding / theme assets — logos persist server-side instead of each
-- browser's localStorage so switching device, incognito, or clearing
-- site data doesn't wipe them.
create table if not exists public.dashboard_branding (
  id text primary key,
  logo_light_url text,
  logo_dark_url text,
  -- Keep the data URLs as a fallback in case Storage isn't configured
  -- yet (dev setups without a Storage bucket). Same ~1MB cap as the
  -- client-side uploader enforces.
  logo_light_data_url text,
  logo_dark_data_url text,
  updated_at timestamptz not null default now()
);

-- Single-row table. We always upsert on id = 'singleton'.
insert into public.dashboard_branding (id)
  values ('singleton')
  on conflict (id) do nothing;

-- Service-role API is the only writer. No RLS policies needed for anon
-- since the read path goes through the server.
