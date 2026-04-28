-- Per-membership status on the mkt_contacts <-> mkt_groups join.
--
-- A contact's relationship to a specific list can be 'approved' (safe
-- to send to as part of any campaign pointing at this list) or
-- 'pending' (sourced from prospecting, awaiting an operator's nod
-- before they get included in a send).
--
-- Default 'approved' so every existing junction row classifies as
-- already-vetted (which is what they are — the previous flow only
-- produced approved memberships). The 'pending' state is only ever
-- written by the new prospect-import path.

alter table public.dashboard_mkt_contact_groups
  add column if not exists status text not null default 'approved',
  add column if not exists added_at timestamptz not null default now(),
  add column if not exists added_by_source text;

-- Fast lookup of a list's pending vs approved members for the UI.
create index if not exists dashboard_mkt_contact_groups_group_status_idx
  on public.dashboard_mkt_contact_groups (group_id, status);
