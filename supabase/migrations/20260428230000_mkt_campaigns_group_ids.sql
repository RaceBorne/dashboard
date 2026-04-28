-- Multi-list campaign audiences.
--
-- Original schema only allowed one group per campaign. The wizard now
-- supports selecting multiple lists; their union is the audience. We
-- keep the legacy group_id column as a fallback so old draft rows
-- still work, but new sends prefer group_ids when set.

alter table public.dashboard_mkt_campaigns
  add column if not exists group_ids uuid[];

create index if not exists dashboard_mkt_campaigns_group_ids_idx
  on public.dashboard_mkt_campaigns using gin (group_ids);
