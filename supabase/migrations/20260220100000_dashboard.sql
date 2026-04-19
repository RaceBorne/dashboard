-- Dashboard CRM / analytics seed tables (JSONB documents + typed traffic rows).
-- Populate via: npm run db:seed

create table if not exists public.dashboard_leads (
  id text primary key,
  payload jsonb not null
);

create table if not exists public.dashboard_threads (
  id text primary key,
  payload jsonb not null
);

create table if not exists public.dashboard_plays (
  id text primary key,
  payload jsonb not null
);

create table if not exists public.dashboard_prospects (
  id text primary key,
  payload jsonb not null
);

create table if not exists public.dashboard_traffic_days (
  day date primary key,
  sessions int not null,
  users int not null,
  bounce_rate double precision not null,
  avg_duration_sec int not null,
  conversions int not null
);

create table if not exists public.dashboard_traffic_sources (
  id serial primary key,
  sort_order int not null default 0,
  source text not null,
  medium text not null,
  sessions int not null,
  conversions int not null,
  conversion_rate double precision not null
);

create table if not exists public.dashboard_landing_pages (
  path text primary key,
  payload jsonb not null
);

create table if not exists public.dashboard_seo_keywords (
  id text primary key,
  payload jsonb not null
);

create table if not exists public.dashboard_seo_pages (
  id text primary key,
  payload jsonb not null
);

create table if not exists public.dashboard_audit_findings (
  id text primary key,
  payload jsonb not null
);

create table if not exists public.dashboard_social_posts (
  id text primary key,
  payload jsonb not null
);

create table if not exists public.dashboard_users (
  id text primary key,
  payload jsonb not null
);

alter table public.dashboard_leads enable row level security;
alter table public.dashboard_threads enable row level security;
alter table public.dashboard_plays enable row level security;
alter table public.dashboard_prospects enable row level security;
alter table public.dashboard_traffic_days enable row level security;
alter table public.dashboard_traffic_sources enable row level security;
alter table public.dashboard_landing_pages enable row level security;
alter table public.dashboard_seo_keywords enable row level security;
alter table public.dashboard_seo_pages enable row level security;
alter table public.dashboard_audit_findings enable row level security;
alter table public.dashboard_social_posts enable row level security;
alter table public.dashboard_users enable row level security;
