-- Departure Lounge support — a draft moves Studio Design → Departure
-- Lounge when given a scheduled_for date. Live publish happens when
-- a worker finds rows where scheduled_for <= now() AND
-- shopify_article_id is null, then runs the publish flow.
alter table public.dashboard_journal_drafts
  add column if not exists scheduled_for timestamptz;

create index if not exists dashboard_journal_drafts_scheduled_idx
  on public.dashboard_journal_drafts (scheduled_for)
  where scheduled_for is not null;
