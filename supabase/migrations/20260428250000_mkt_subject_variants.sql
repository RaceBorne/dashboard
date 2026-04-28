-- A/B testing on subject lines.
--
-- subject_variants holds 1-N alternative subjects (capped at 4 client
-- side). When set + non-empty, the send pipeline distributes recipients
-- evenly across variants and stamps each row with which variant it got
-- so the report can compute per-variant open + click rates and pick a
-- winner.

alter table public.dashboard_mkt_campaigns
  add column if not exists subject_variants text[];

alter table public.dashboard_mkt_campaign_recipients
  add column if not exists assigned_variant int;
