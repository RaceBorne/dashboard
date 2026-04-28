-- Smart follow-up suggestions.
--
-- Run a scheduled (or manual) check 48 hours after every send. If the
-- open rate is below threshold, write a pending suggestion here with
-- an AI-drafted follow-up subject + body. Operator reviews the
-- suggestion in the inbox card on /email/campaigns and either
-- accepts (which creates a real direct-message campaign targeting
-- non-openers, marked needs_review) or dismisses.

create table if not exists public.dashboard_mkt_followup_suggestions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.dashboard_mkt_campaigns (id) on delete cascade,
  reason text not null,
  open_rate numeric,
  recipient_count int,
  non_opener_count int,
  draft_subject text,
  draft_body text,
  status text not null default 'pending' check (status in ('pending', 'dismissed', 'sent')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists dashboard_mkt_followup_suggestions_campaign_idx
  on public.dashboard_mkt_followup_suggestions (campaign_id);

create index if not exists dashboard_mkt_followup_suggestions_status_idx
  on public.dashboard_mkt_followup_suggestions (status);
