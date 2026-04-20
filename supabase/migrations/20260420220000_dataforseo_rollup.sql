-- DataForSEO — backlinks, SERP tracking, keyword research, on-page audit.
--
-- Tables:
--   1. dashboard_dataforseo_backlinks_summary       — per-target domain summary (rank, referring domains, etc.)
--   2. dashboard_dataforseo_backlinks               — individual backlinks (url_from → url_to)
--   3. dashboard_dataforseo_referring_domains       — backlinks aggregated per referring domain
--   4. dashboard_dataforseo_serp_keywords           — tracked keywords (one per keyword + location + language + target)
--   5. dashboard_dataforseo_serp_history            — SERP position checks over time
--   6. dashboard_dataforseo_keyword_data            — search volume, CPC, competition per keyword
--   7. dashboard_dataforseo_onpage_pages            — per-page crawl results (meta, links, score)
--   8. dashboard_dataforseo_onpage_issues           — individual issues per page
--   9. dashboard_dataforseo_sync_log                — one row per ingest run per product

-- 1. Backlinks summary
create table if not exists public.dashboard_dataforseo_backlinks_summary (
  target                   text primary key,
  rank                     integer not null default 0,
  backlinks                bigint  not null default 0,
  backlinks_nofollow       bigint  not null default 0,
  referring_domains        integer not null default 0,
  referring_main_domains   integer not null default 0,
  referring_ips            integer not null default 0,
  referring_subnets        integer not null default 0,
  anchor_text_top10        jsonb   not null default '[]'::jsonb,
  first_seen               timestamptz,
  lost_date                timestamptz,
  fetched_at               timestamptz not null default now()
);
alter table public.dashboard_dataforseo_backlinks_summary enable row level security;

-- 2. Individual backlinks (capped per ingest — use this for UI lists)
create table if not exists public.dashboard_dataforseo_backlinks (
  id               bigserial primary key,
  target           text not null,
  url_from         text not null,
  url_to           text not null,
  domain_from      text not null,
  domain_to        text not null,
  anchor           text,
  is_nofollow      boolean not null default false,
  is_broken        boolean not null default false,
  page_from_rank   integer,
  domain_from_rank integer,
  first_seen       timestamptz,
  last_seen        timestamptz,
  fetched_at       timestamptz not null default now(),
  unique (target, url_from, url_to)
);
create index if not exists dashboard_dataforseo_backlinks_target_idx
  on public.dashboard_dataforseo_backlinks (target, last_seen desc);
alter table public.dashboard_dataforseo_backlinks enable row level security;

-- 3. Referring domains (one row per (target, domain_from))
create table if not exists public.dashboard_dataforseo_referring_domains (
  target       text not null,
  domain_from  text not null,
  backlinks    integer not null default 0,
  first_seen   timestamptz,
  last_seen    timestamptz,
  rank         integer,
  fetched_at   timestamptz not null default now(),
  primary key (target, domain_from)
);
alter table public.dashboard_dataforseo_referring_domains enable row level security;

-- 4. SERP tracked keywords
create table if not exists public.dashboard_dataforseo_serp_keywords (
  id                    bigserial primary key,
  keyword               text not null,
  location_code         integer not null default 2826, -- United Kingdom
  language_code         text not null default 'en',
  target                text,
  latest_position       integer,
  latest_url            text,
  latest_title          text,
  latest_serp_features  jsonb default '[]'::jsonb,
  latest_checked_at     timestamptz,
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (keyword, location_code, language_code, target)
);
alter table public.dashboard_dataforseo_serp_keywords enable row level security;

-- 5. SERP history — one snapshot per check
create table if not exists public.dashboard_dataforseo_serp_history (
  id             bigserial primary key,
  keyword_id     bigint not null references public.dashboard_dataforseo_serp_keywords(id) on delete cascade,
  checked_at     timestamptz not null default now(),
  position       integer,
  url            text,
  title          text,
  serp_features  jsonb default '[]'::jsonb,
  total_results  bigint,
  fetched_at     timestamptz not null default now()
);
create index if not exists dashboard_dataforseo_serp_history_kw_idx
  on public.dashboard_dataforseo_serp_history (keyword_id, checked_at desc);
alter table public.dashboard_dataforseo_serp_history enable row level security;

-- 6. Keyword research data
create table if not exists public.dashboard_dataforseo_keyword_data (
  keyword            text not null,
  location_code      integer not null default 2826,
  language_code      text not null default 'en',
  search_volume      integer,
  cpc                numeric,
  competition        numeric,
  competition_level  text,
  keyword_difficulty integer,
  search_intent      text,
  monthly_searches   jsonb default '[]'::jsonb,
  fetched_at         timestamptz not null default now(),
  primary key (keyword, location_code, language_code)
);
alter table public.dashboard_dataforseo_keyword_data enable row level security;

-- 7. On-page crawl — per-page results
create table if not exists public.dashboard_dataforseo_onpage_pages (
  id                               bigserial primary key,
  task_id                          text not null,
  target                           text not null,
  url                              text not null,
  status_code                      integer,
  fetch_time                       timestamptz,
  page_timing_time_to_interactive  integer,
  page_timing_dom_complete         integer,
  meta_title                       text,
  meta_description                 text,
  meta_canonical                   text,
  h1                               jsonb default '[]'::jsonb,
  internal_links_count             integer,
  external_links_count             integer,
  images_count                     integer,
  words_count                      integer,
  onpage_score                     numeric,
  fetched_at                       timestamptz not null default now(),
  unique (task_id, url)
);
create index if not exists dashboard_dataforseo_onpage_pages_target_idx
  on public.dashboard_dataforseo_onpage_pages (target, fetched_at desc);
alter table public.dashboard_dataforseo_onpage_pages enable row level security;

-- 8. On-page issues — per-page findings
create table if not exists public.dashboard_dataforseo_onpage_issues (
  id         bigserial primary key,
  page_id    bigint not null references public.dashboard_dataforseo_onpage_pages(id) on delete cascade,
  severity   text not null,
  category   text not null,
  check_name text not null,
  message    text,
  fetched_at timestamptz not null default now()
);
create index if not exists dashboard_dataforseo_onpage_issues_page_idx
  on public.dashboard_dataforseo_onpage_issues (page_id);
create index if not exists dashboard_dataforseo_onpage_issues_severity_idx
  on public.dashboard_dataforseo_onpage_issues (severity, category);
alter table public.dashboard_dataforseo_onpage_issues enable row level security;

-- 9. Sync log (one row per ingest run, per product)
create table if not exists public.dashboard_dataforseo_sync_log (
  id           bigserial primary key,
  product      text not null,
  ran_at       timestamptz not null default now(),
  target       text,
  cost_usd     numeric,
  rows_written integer not null default 0,
  duration_ms  integer not null default 0,
  ok           boolean not null default true,
  error        text
);
create index if not exists dashboard_dataforseo_sync_log_ran_idx
  on public.dashboard_dataforseo_sync_log (ran_at desc);
create index if not exists dashboard_dataforseo_sync_log_product_idx
  on public.dashboard_dataforseo_sync_log (product, ran_at desc);
alter table public.dashboard_dataforseo_sync_log enable row level security;
