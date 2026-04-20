-- -----------------------------------------------------------------------------
-- GA4 breakdown tables — powering the graphic-heavy Traffic page.
--
-- We already have:
--   dashboard_traffic_days       (one row per day)
--   dashboard_traffic_sources    (source/medium)
--   dashboard_ga4_pages_28d      (page_path)
--   dashboard_ga4_geo_28d        (country + region)
--
-- This migration:
--   1. Extends dashboard_traffic_days with new_users / engaged_sessions /
--      engagement_rate / events so KPI deltas and 12-month trend sparklines
--      have everything they need.
--   2. Extends dashboard_ga4_pages_28d with page_title + views (separate from
--      sessions) so the "Views by page title" widget looks GA4-native.
--   3. Adds dashboard_ga4_channels_28d for "Sessions by default channel group"
--      (pie + horizontal bar) and "Active users by session default channel
--      group".
--   4. Adds dashboard_ga4_cities_28d for "Active users by Town/City".
--   5. Adds dashboard_ga4_languages_28d for the "Active users by language"
--      horizontal bar.
--   6. Adds dashboard_ga4_events_28d for the key events donut + event table.
--
-- RLS stays OFF on dashboard_* tables (service-role only).
-- -----------------------------------------------------------------------------

ALTER TABLE public.dashboard_traffic_days
  ADD COLUMN IF NOT EXISTS new_users integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engaged_sessions integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_rate double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS events integer DEFAULT 0;

ALTER TABLE public.dashboard_ga4_pages_28d
  ADD COLUMN IF NOT EXISTS page_title text,
  ADD COLUMN IF NOT EXISTS views integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.dashboard_ga4_channels_28d (
  property_id text NOT NULL,
  channel text NOT NULL,
  sessions integer NOT NULL DEFAULT 0,
  users integer NOT NULL DEFAULT 0,
  new_users integer NOT NULL DEFAULT 0,
  engaged_sessions integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  window_start date NOT NULL,
  window_end date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, channel)
);

CREATE TABLE IF NOT EXISTS public.dashboard_ga4_cities_28d (
  property_id text NOT NULL,
  city text NOT NULL,
  country text NOT NULL DEFAULT '',
  country_code text NOT NULL DEFAULT '',
  sessions integer NOT NULL DEFAULT 0,
  users integer NOT NULL DEFAULT 0,
  window_start date NOT NULL,
  window_end date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, city, country_code)
);

CREATE TABLE IF NOT EXISTS public.dashboard_ga4_languages_28d (
  property_id text NOT NULL,
  language text NOT NULL,
  sessions integer NOT NULL DEFAULT 0,
  users integer NOT NULL DEFAULT 0,
  window_start date NOT NULL,
  window_end date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, language)
);

CREATE TABLE IF NOT EXISTS public.dashboard_ga4_events_28d (
  property_id text NOT NULL,
  event_name text NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  users integer NOT NULL DEFAULT 0,
  window_start date NOT NULL,
  window_end date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, event_name)
);

CREATE INDEX IF NOT EXISTS idx_ga4_channels_sessions
  ON public.dashboard_ga4_channels_28d (property_id, sessions DESC);

CREATE INDEX IF NOT EXISTS idx_ga4_cities_sessions
  ON public.dashboard_ga4_cities_28d (property_id, sessions DESC);

CREATE INDEX IF NOT EXISTS idx_ga4_events_count
  ON public.dashboard_ga4_events_28d (property_id, event_count DESC);

CREATE INDEX IF NOT EXISTS idx_ga4_pages_title
  ON public.dashboard_ga4_pages_28d (property_id, page_title);
