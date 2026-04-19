-- Operational to-do list (Evari dashboard). Apply in Supabase SQL editor or via CLI.

create table if not exists public.task_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null,
  status text not null,
  priority text not null,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'manual',
  wishlist_ref text,
  notes text,
  list_id uuid references public.task_lists(id) on delete set null
);

create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_category_idx on public.tasks (category);
create index if not exists tasks_list_id_idx on public.tasks (list_id);
create index if not exists tasks_due_date_idx on public.tasks (due_date);

create or replace function public.set_tasks_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at
before update on public.tasks
for each row execute function public.set_tasks_updated_at();

alter table public.task_lists enable row level security;
alter table public.tasks enable row level security;

-- Service role bypasses RLS; anon/authenticated policies can be added later for multi-user.

-- Seed once: real operational work only (skips if tasks already exist).
insert into public.tasks (title, description, category, status, priority, due_date, source)
select title, description, category, status, priority, due_date, source
from (values
  (
    'Review meta titles on flagship products',
    'Tour, Sport, Urban — match H1, search intent, and SERP snippets.',
    'seo',
    'planned',
    'high',
    current_date,
    'manual'
  ),
  (
    'Follow up high-value abandoned checkouts',
    'Prioritise carts over £500; send recovery or personal outreach.',
    'commerce',
    'planned',
    'urgent',
    current_date,
    'manual'
  ),
  (
    'Clear draft quotes awaiting customer',
    'Bike-builder drafts with invoice sent — chase or close.',
    'commerce',
    'in-progress',
    'high',
    current_date + 1,
    'manual'
  ),
  (
    'Plan next journal article',
    'Outline, imagery, and publish date for the Evari blog.',
    'content',
    'proposed',
    'medium',
    current_date + 3,
    'manual'
  ),
  (
    'Weekly Instagram content batch',
    'Three feed posts + stories aligned with product drops.',
    'social',
    'planned',
    'medium',
    current_date + 2,
    'manual'
  ),
  (
    'Reply to inbound DMs and comments',
    'Instagram and email — same-day SLA on business days.',
    'conversations',
    'planned',
    'high',
    current_date,
    'manual'
  ),
  (
    'Check Search Console coverage',
    'Fix new errors and validate sitemap after theme changes.',
    'seo',
    'planned',
    'medium',
    current_date + 7,
    'manual'
  ),
  (
    'Review new website leads',
    'Triage contact and consultation forms; assign follow-up.',
    'lead-gen',
    'planned',
    'high',
    current_date,
    'manual'
  ),
  (
    'Stock check on bestsellers',
    'Ensure Tour and Sport variants aren’t selling through without reorder.',
    'shopify',
    'planned',
    'medium',
    current_date + 2,
    'manual'
  ),
  (
    'Medical vertical — clinic follow-ups',
    'Next steps for active rehab programme conversations.',
    'medical-rehab',
    'planned',
    'medium',
    current_date + 5,
    'manual'
  )
) as v(title, description, category, status, priority, due_date, source)
where not exists (select 1 from public.tasks limit 1);
