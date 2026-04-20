-- Keyword workspace — named lists (our keywords + one per competitor) and
-- their members. Read path stitches these against the existing DataForSEO
-- tables (keyword_data, serp_keywords, serp_history) so each list can be
-- rendered with market data + positions + SERP features without duplication.
--
-- Design notes:
--   - location + language live on the *list*, not the member. Every keyword
--     in a given list is compared in the same locale. Cross-locale is a
--     separate list.
--   - Competitor positions are NOT cached on the member row — they're read
--     from dashboard_dataforseo_serp_keywords where target = list.target_domain.
--     Single source of truth.
--   - For competitor lists, "our position" is looked up lazily (only for the
--     keywords the user explicitly opts to track). Prevents cost explosion
--     on 1,000-keyword competitor ingests.
--   - `retired_at` is a soft-delete (don't cascade — you want to keep history).
--   - `source` on a member records where the keyword came from ('manual',
--     'auto' from ranked_keywords, 'gsc' from GSC queries, 'seed' from an
--     initial data-migration seed).

create table if not exists public.dashboard_keyword_lists (
  id                   bigserial primary key,
  slug                 text unique not null,
  label                text not null,
  kind                 text not null check (kind in ('own', 'competitor')),
  target_domain        text,
  color_tone           text not null default 'accent',
  location_code        integer not null default 2826,
  language_code        text not null default 'en',
  notes                text,
  created_at           timestamptz not null default now(),
  retired_at           timestamptz,
  last_synced_at       timestamptz,
  last_sync_cost_usd   numeric,
  -- 'own' lists must have no target_domain; 'competitor' lists must have one.
  constraint dashboard_keyword_lists_domain_matches_kind check (
    (kind = 'own' and target_domain is null) or
    (kind = 'competitor' and target_domain is not null)
  )
);

create index if not exists dashboard_keyword_lists_kind_idx
  on public.dashboard_keyword_lists (kind)
  where retired_at is null;

alter table public.dashboard_keyword_lists enable row level security;

create table if not exists public.dashboard_keyword_list_members (
  list_id     bigint not null references public.dashboard_keyword_lists(id) on delete cascade,
  keyword     text not null,
  source      text not null default 'manual' check (source in ('manual', 'auto', 'gsc', 'seed')),
  priority    integer not null default 0,
  notes       text,
  added_at    timestamptz not null default now(),
  primary key (list_id, keyword)
);

create index if not exists dashboard_keyword_list_members_keyword_idx
  on public.dashboard_keyword_list_members (keyword);

alter table public.dashboard_keyword_list_members enable row level security;

-- Seed a default "Our keywords" list so the workspace isn't empty on first
-- visit, and backfill it with every keyword we're already SERP-tracking for
-- evari.cc. Idempotent via on-conflict-do-nothing on slug + composite PK.
insert into public.dashboard_keyword_lists (slug, label, kind, target_domain, color_tone, notes)
values ('our-keywords', 'Our keywords', 'own', null, 'accent', 'Primary Evari keyword list. Tracked in Google UK.')
on conflict (slug) do nothing;

insert into public.dashboard_keyword_list_members (list_id, keyword, source)
select
  (select id from public.dashboard_keyword_lists where slug = 'our-keywords'),
  sk.keyword,
  'seed'
from public.dashboard_dataforseo_serp_keywords sk
where sk.target = 'evari.cc'
  and sk.location_code = 2826
  and sk.language_code = 'en'
on conflict do nothing;
