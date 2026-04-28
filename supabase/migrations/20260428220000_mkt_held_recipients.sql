-- Holding pen for campaign sends.
--
-- When the operator clicks Send on a campaign, the pre-flight review can
-- "hold" any recipients that look problematic (missing first name, wrong
-- audience signal, AI flagged the rendered email, etc). The approved
-- recipients fire immediately; the held set lands here, where it can be
-- inspected, fixed, and either sent later or discarded.
--
-- One row per (campaign, contact). source records who put it there
-- (human in the modal, ai inspector, or both). reason is whatever
-- text was captured at hold time, free-form.
--
-- Lives separately from dashboard_mkt_campaign_recipients so the
-- analytics view stays clean: held entries never were sent, never
-- counted against deliverability, never charged Postmark.

create table if not exists public.dashboard_mkt_held_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.dashboard_mkt_campaigns (id) on delete cascade,
  contact_id uuid not null references public.dashboard_mkt_contacts (id) on delete cascade,
  reason text,
  source text not null default 'human' check (source in ('human', 'ai', 'both')),
  ai_flags jsonb,
  held_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index if not exists dashboard_mkt_held_recipients_campaign_idx
  on public.dashboard_mkt_held_recipients (campaign_id);

create index if not exists dashboard_mkt_held_recipients_contact_idx
  on public.dashboard_mkt_held_recipients (contact_id);
