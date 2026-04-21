-- Gmail thread ingest — nightly rollup of the last ~30 days of threads.
--
-- One row per Gmail threadId. Payload carries the full `GmailThreadSummary`
-- (subject, snippet, participants, labels, permalink). We mirror category +
-- last_message_at into columns so the briefing / chat context can filter
-- without scanning jsonb.
--
-- Written by /api/integrations/google/gmail/ingest and also the daily cron.

create table if not exists public.dashboard_gmail_threads (
  thread_id       text primary key,
  category        text not null default 'other',
  last_message_at timestamptz not null,
  payload         jsonb not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_dashboard_gmail_threads_category_recent
  on public.dashboard_gmail_threads (category, last_message_at desc);

create index if not exists idx_dashboard_gmail_threads_recent
  on public.dashboard_gmail_threads (last_message_at desc);

-- keep updated_at fresh on upsert
create or replace function public.dashboard_gmail_threads_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dashboard_gmail_threads_touch on public.dashboard_gmail_threads;
create trigger dashboard_gmail_threads_touch
  before update on public.dashboard_gmail_threads
  for each row execute function public.dashboard_gmail_threads_touch();
