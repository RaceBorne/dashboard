alter table public.dashboard_mkt_brand
  add column if not exists custom_fonts jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mkt-brand-fonts',
  'mkt-brand-fonts',
  true,
  5242880,
  array[
    'font/woff2', 'font/woff', 'font/ttf', 'font/otf',
    'application/font-woff2', 'application/font-woff',
    'application/x-font-ttf', 'application/x-font-otf',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='mkt brand fonts public read') then
    create policy "mkt brand fonts public read"
      on storage.objects for select
      using (bucket_id = 'mkt-brand-fonts');
  end if;
end$$;
