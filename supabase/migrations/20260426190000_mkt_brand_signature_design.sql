alter table public.dashboard_mkt_brand
  add column if not exists signature_design jsonb;
