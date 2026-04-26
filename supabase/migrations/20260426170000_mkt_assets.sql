create extension if not exists pg_trgm;

create table if not exists public.dashboard_mkt_assets (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'image'
                check (kind in ('image', 'gif', 'logo', 'video_thumb', 'other')),
  filename     text not null,
  storage_key  text not null,
  url          text not null,
  mime_type    text,
  size_bytes   integer,
  width        integer,
  height       integer,
  tags         text[] not null default '{}',
  alt_text     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists dashboard_mkt_assets_kind_idx
  on public.dashboard_mkt_assets (kind, created_at desc);
create index if not exists dashboard_mkt_assets_tags_gin_idx
  on public.dashboard_mkt_assets using gin (tags);
create index if not exists dashboard_mkt_assets_filename_trgm_idx
  on public.dashboard_mkt_assets using gin (filename gin_trgm_ops);
alter table public.dashboard_mkt_assets enable row level security;
drop trigger if exists dashboard_mkt_assets_updated_at on public.dashboard_mkt_assets;
create trigger dashboard_mkt_assets_updated_at
  before update on public.dashboard_mkt_assets
  for each row execute function public.dashboard_mkt_set_updated_at();
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mkt-assets',
  'mkt-assets',
  true,
  10485760,
  array[
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
    'image/gif', 'image/svg+xml', 'image/avif'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='mkt assets public read') then
    create policy "mkt assets public read"
      on storage.objects for select
      using (bucket_id = 'mkt-assets');
  end if;
end$$;
