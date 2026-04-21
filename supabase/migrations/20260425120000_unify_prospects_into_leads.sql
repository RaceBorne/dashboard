-- Unify prospects and leads into a single table with a tier field.
-- Both tables were empty at migration time — no data migration needed.

alter table public.dashboard_leads
  add column if not exists tier text not null default 'lead'
    check (tier in ('prospect','lead'));

create index if not exists dashboard_leads_tier_idx
  on public.dashboard_leads (tier);
create index if not exists dashboard_leads_play_idx
  on public.dashboard_leads ((payload->>'playId'));
create index if not exists dashboard_leads_category_idx
  on public.dashboard_leads ((payload->>'category'));
create index if not exists dashboard_leads_email_idx
  on public.dashboard_leads ((lower(payload->>'email')));

-- Drop dashboard_prospects — replaced by (tier='prospect') rows in dashboard_leads.
drop table if exists public.dashboard_prospects;
