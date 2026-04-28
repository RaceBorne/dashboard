-- Distinguish newsletter campaigns (designed, branded, broadcast)
-- from direct messages (personal text-based emails). Same recipient
-- pipeline + suppressions + tracking, but different compose surfaces
-- and analytics expectations.
--
-- 'newsletter' is the legacy default — every existing row classifies
-- as a newsletter so nothing breaks. New direct-message campaigns
-- written via the new composer set kind='direct'.

alter table public.dashboard_mkt_campaigns
  add column if not exists kind text not null default 'newsletter';

create index if not exists dashboard_mkt_campaigns_kind_idx
  on public.dashboard_mkt_campaigns (kind);
