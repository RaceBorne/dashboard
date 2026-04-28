-- Thread-ify dashboard_mkt_conversations.
--
-- Each row currently models ONE inbound email reply. To render the
-- back-and-forth in /email/conversations we add:
--   direction  - 'inbound' | 'outbound'. Defaults 'inbound' so existing
--                rows (all inbound webhook arrivals) classify correctly.
--   thread_key - derived key for grouping siblings:
--                  lower(counterparty_email) || '|' || normalised_subject
--                where 'counterparty' = from_email on inbound rows,
--                to_email on outbound rows. The normalised subject
--                strips leading 're:'/'fwd:' so 'Re: Hello' threads
--                with 'Hello'.
--
-- Backfill computes thread_key for every existing row so the UI can
-- group them on day one. Two indexes support the most common reads:
-- 'list threads' (group by thread_key) and 'load one thread'
-- (thread_key + received_at DESC).

alter table public.dashboard_mkt_conversations
  add column if not exists direction  text        not null default 'inbound',
  add column if not exists thread_key text;

-- Backfill: for inbound (everything to date), counterparty is from_email.
update public.dashboard_mkt_conversations
set thread_key = lower(trim(coalesce(from_email, '')))
              || '|'
              || lower(regexp_replace(coalesce(subject, ''), '^(re|fwd?):\s*', '', 'i'))
where thread_key is null;

create index if not exists dashboard_mkt_conversations_thread_key_idx
  on public.dashboard_mkt_conversations (thread_key);

create index if not exists dashboard_mkt_conversations_thread_received_idx
  on public.dashboard_mkt_conversations (thread_key, received_at desc);

create index if not exists dashboard_mkt_conversations_direction_idx
  on public.dashboard_mkt_conversations (direction);
