-- ─── Marketing system — Phase 1 schema ───────────────────────────
-- Internal Klaviyo-style CRM + email broadcaster. All tables prefixed
-- dashboard_mkt_* so they sort together with the other dashboard_*
-- families in the schema browser.

create table if not exists public.dashboard_mkt_contacts (
  id          uuid primary key default gen_random_uuid(),
  first_name  text,
  last_name   text,
  email       text not null,
  phone       text,
  company     text,
  status      text not null default 'active'
              check (status in ('active', 'unsubscribed', 'suppressed')),
  source      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists dashboard_mkt_contacts_email_uidx
  on public.dashboard_mkt_contacts (lower(email));
create index if not exists dashboard_mkt_contacts_status_idx
  on public.dashboard_mkt_contacts (status);
alter table public.dashboard_mkt_contacts enable row level security;

create table if not exists public.dashboard_mkt_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);
create unique index if not exists dashboard_mkt_groups_name_uidx
  on public.dashboard_mkt_groups (lower(name));
alter table public.dashboard_mkt_groups enable row level security;

create table if not exists public.dashboard_mkt_contact_groups (
  contact_id uuid not null references public.dashboard_mkt_contacts(id) on delete cascade,
  group_id   uuid not null references public.dashboard_mkt_groups(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (contact_id, group_id)
);
create index if not exists dashboard_mkt_contact_groups_group_idx
  on public.dashboard_mkt_contact_groups (group_id);
alter table public.dashboard_mkt_contact_groups enable row level security;

create table if not exists public.dashboard_mkt_tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists dashboard_mkt_tags_name_uidx
  on public.dashboard_mkt_tags (lower(name));
alter table public.dashboard_mkt_tags enable row level security;

create table if not exists public.dashboard_mkt_contact_tags (
  contact_id uuid not null references public.dashboard_mkt_contacts(id) on delete cascade,
  tag_id     uuid not null references public.dashboard_mkt_tags(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (contact_id, tag_id)
);
create index if not exists dashboard_mkt_contact_tags_tag_idx
  on public.dashboard_mkt_contact_tags (tag_id);
alter table public.dashboard_mkt_contact_tags enable row level security;

create table if not exists public.dashboard_mkt_events (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.dashboard_mkt_contacts(id) on delete cascade,
  type       text not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists dashboard_mkt_events_contact_idx
  on public.dashboard_mkt_events (contact_id, created_at desc);
create index if not exists dashboard_mkt_events_type_idx
  on public.dashboard_mkt_events (type, created_at desc);
alter table public.dashboard_mkt_events enable row level security;

create table if not exists public.dashboard_mkt_segments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  rules      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists dashboard_mkt_segments_name_uidx
  on public.dashboard_mkt_segments (lower(name));
alter table public.dashboard_mkt_segments enable row level security;

create table if not exists public.dashboard_mkt_campaigns (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  subject    text not null,
  content    text not null,
  status     text not null default 'draft'
             check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  segment_id uuid references public.dashboard_mkt_segments(id) on delete set null,
  group_id   uuid references public.dashboard_mkt_groups(id) on delete set null,
  scheduled_for timestamptz,
  sent_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dashboard_mkt_campaigns_status_idx
  on public.dashboard_mkt_campaigns (status, created_at desc);
alter table public.dashboard_mkt_campaigns enable row level security;

create table if not exists public.dashboard_mkt_campaign_recipients (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.dashboard_mkt_campaigns(id) on delete cascade,
  contact_id    uuid not null references public.dashboard_mkt_contacts(id) on delete cascade,
  status        text not null default 'queued'
                check (status in (
                  'queued', 'sent', 'delivered',
                  'opened', 'clicked',
                  'bounced', 'complained', 'failed', 'suppressed'
                )),
  message_id    text,
  sent_at       timestamptz,
  delivered_at  timestamptz,
  opened_at     timestamptz,
  clicked_at    timestamptz,
  bounced_at    timestamptz,
  error         text,
  created_at    timestamptz not null default now()
);
create unique index if not exists dashboard_mkt_campaign_recipients_uidx
  on public.dashboard_mkt_campaign_recipients (campaign_id, contact_id);
create index if not exists dashboard_mkt_campaign_recipients_status_idx
  on public.dashboard_mkt_campaign_recipients (campaign_id, status);
create index if not exists dashboard_mkt_campaign_recipients_message_idx
  on public.dashboard_mkt_campaign_recipients (message_id);
alter table public.dashboard_mkt_campaign_recipients enable row level security;

create table if not exists public.dashboard_mkt_flows (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  trigger_type  text not null,
  trigger_value text not null,
  is_active     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists dashboard_mkt_flows_active_idx
  on public.dashboard_mkt_flows (is_active);
alter table public.dashboard_mkt_flows enable row level security;

create table if not exists public.dashboard_mkt_flow_steps (
  id         uuid primary key default gen_random_uuid(),
  flow_id    uuid not null references public.dashboard_mkt_flows(id) on delete cascade,
  step_type  text not null check (step_type in ('delay', 'email', 'condition')),
  config     jsonb not null default '{}'::jsonb,
  "order"    integer not null,
  created_at timestamptz not null default now()
);
create unique index if not exists dashboard_mkt_flow_steps_order_uidx
  on public.dashboard_mkt_flow_steps (flow_id, "order");
alter table public.dashboard_mkt_flow_steps enable row level security;

create table if not exists public.dashboard_mkt_domains (
  id              uuid primary key default gen_random_uuid(),
  domain_name     text not null,
  verified        boolean not null default false,
  spf_record      text,
  dkim_selector   text,
  dkim_record     text,
  dmarc_record    text,
  postmark_id     text,
  last_checked_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists dashboard_mkt_domains_name_uidx
  on public.dashboard_mkt_domains (lower(domain_name));
alter table public.dashboard_mkt_domains enable row level security;

create or replace function public.dashboard_mkt_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'dashboard_mkt_contacts',
      'dashboard_mkt_segments',
      'dashboard_mkt_campaigns',
      'dashboard_mkt_flows',
      'dashboard_mkt_domains'
    ])
  loop
    execute format(
      'drop trigger if exists %I_updated_at on public.%I;
       create trigger %I_updated_at
         before update on public.%I
         for each row execute function public.dashboard_mkt_set_updated_at();',
      t, t, t, t
    );
  end loop;
end$$;
