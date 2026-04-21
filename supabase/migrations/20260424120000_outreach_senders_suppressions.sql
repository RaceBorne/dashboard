-- Outreach senders: mailboxes the dashboard can send from.
-- Signature + logo stored in payload so the UI can edit them without DDL.

create table if not exists public.dashboard_outreach_senders (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dashboard_outreach_senders enable row level security;

-- Suppression list: anyone we must never email again (unsubscribes,
-- hard bounces, manual DNC). Checked at send time.

create table if not exists public.dashboard_suppressions (
  id text primary key,
  payload jsonb not null,
  email text generated always as (lower(payload->>'email')) stored,
  created_at timestamptz not null default now()
);

alter table public.dashboard_suppressions enable row level security;

create index if not exists dashboard_suppressions_email_idx
  on public.dashboard_suppressions (email);
