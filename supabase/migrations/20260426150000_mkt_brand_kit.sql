-- Marketing brand kit — singleton row.
create table if not exists public.dashboard_mkt_brand (
  id text primary key default 'singleton'
     check (id = 'singleton'),
  company_name        text,
  company_address     text,
  reply_to_email      text,
  logo_light_url      text,
  logo_dark_url       text,
  colors              jsonb not null default jsonb_build_object(
    'primary',    '#1a1a1a',
    'accent',     '#d4a017',
    'text',       '#1a1a1a',
    'bg',         '#ffffff',
    'link',       '#0066cc',
    'buttonBg',   '#1a1a1a',
    'buttonText', '#ffffff',
    'muted',      '#666666'
  ),
  fonts               jsonb not null default jsonb_build_object(
    'heading', 'Inter',
    'body',    'Inter'
  ),
  signature_html      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.dashboard_mkt_brand enable row level security;
drop trigger if exists dashboard_mkt_brand_updated_at on public.dashboard_mkt_brand;
create trigger dashboard_mkt_brand_updated_at
  before update on public.dashboard_mkt_brand
  for each row execute function public.dashboard_mkt_set_updated_at();
insert into public.dashboard_mkt_brand (id) values ('singleton')
on conflict (id) do nothing;
