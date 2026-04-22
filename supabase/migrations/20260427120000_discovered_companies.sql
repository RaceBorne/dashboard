-- Discover: cached company enrichments.
-- Keyed on domain so repeat lookups from /discover are instant and cheap.

create table if not exists public.dashboard_discovered_companies (
  domain text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.dashboard_discovered_companies is
  'Cache of enriched company records surfaced on /discover. Payload shape mirrors lib/types.DiscoveredCompany.';

create index if not exists dashboard_discovered_companies_updated_at_idx
  on public.dashboard_discovered_companies (updated_at desc);

-- Fast lookup by category/industry for similar-company searches.
create index if not exists dashboard_discovered_companies_category_idx
  on public.dashboard_discovered_companies ((payload->>'category'));

create index if not exists dashboard_discovered_companies_country_idx
  on public.dashboard_discovered_companies ((payload->'hq'->>'country'));
