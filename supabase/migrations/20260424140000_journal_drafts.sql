-- Journals — server-side storage for in-progress articles.
--
-- The Journals page lists two kinds of rows:
--
--   1. Shopify articles (fetched live from the Admin API)
--   2. Dashboard drafts in this table (not yet published)
--
-- When a draft is published to Shopify we keep the row and stamp
-- `shopify_article_id` on it so the UI can show "Published" and link
-- the original draft to the live article. This means the composer
-- stays the source of truth for the block-editor JSON even after
-- publish, and re-edits stay in the dashboard until pushed again.
create table if not exists public.dashboard_journal_drafts (
  id text primary key,
  -- The draft's target blog. Either a Shopify blog GID (preferred
  -- when we know the blog exists) or the lane key 'cs_plus' / 'blogs'
  -- which is mapped to a real blog at publish time.
  blog_target text not null,
  -- Title the merchant sees in the composer. Becomes the Shopify
  -- article title on publish.
  title text not null default '',
  -- EditorJS JSON document — source of truth for the content.
  editor_data jsonb not null default '{}'::jsonb,
  -- Cover image URL (uploaded to Supabase Storage via `/api/uploads`).
  cover_image_url text,
  -- Summary for the article listing on Shopify (optional).
  summary text,
  -- Comma-split tag list applied on publish.
  tags text[] default '{}'::text[],
  -- Author display name (defaults to 'Evari' at publish time if null).
  author text,
  -- SEO metafields.
  seo_title text,
  seo_description text,
  -- Publish tracking.
  shopify_article_id text,        -- GID of the Shopify article, once published
  shopify_blog_id text,           -- GID of the blog we published into
  published_at timestamptz,
  -- Lifecycle stamps.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dashboard_journal_drafts_blog_target_idx
  on public.dashboard_journal_drafts (blog_target);

create index if not exists dashboard_journal_drafts_updated_idx
  on public.dashboard_journal_drafts (updated_at desc);

-- Service-role API is the only writer. No RLS policies for anon.
