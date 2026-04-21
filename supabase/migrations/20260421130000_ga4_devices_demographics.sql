-- -----------------------------------------------------------------------------
-- GA4 breakdowns: device category + demographics
--
-- dashboard_ga4_devices_28d        mobile / desktop / tablet / smart_tv split
-- dashboard_ga4_demographics_28d   gender + age bracket (Google Signals)
--
-- These two power the Devices panel + Demographics panel on /traffic. Both
-- follow the same shape as the other *_28d breakdown tables: keyed on
-- (property_id, dimension), truncated + reinserted each ingest.
--
-- Demographics requires Google Signals enabled on the GA4 property. If it is
-- off the query returns zero rows and the UI falls back to an empty-state
-- hint instead of the panel collapsing with a raw "no data" message.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.dashboard_ga4_devices_28d (
  property_id text NOT NULL,
  device text NOT NULL, -- 'mobile' | 'desktop' | 'tablet' | 'smart_tv' | '(unknown)'
  sessions integer NOT NULL DEFAULT 0,
  users integer NOT NULL DEFAULT 0,
  new_users integer NOT NULL DEFAULT 0,
  engaged_sessions integer NOT NULL DEFAULT 0,
  window_start date NOT NULL,
  window_end date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, device)
);

CREATE TABLE IF NOT EXISTS public.dashboard_ga4_demographics_28d (
  property_id text NOT NULL,
  gender text NOT NULL, -- 'male' | 'female' | 'unknown'
  age_bracket text NOT NULL, -- '18-24' | '25-34' | ... | '65+' | 'unknown'
  users integer NOT NULL DEFAULT 0,
  sessions integer NOT NULL DEFAULT 0,
  window_start date NOT NULL,
  window_end date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, gender, age_bracket)
);

CREATE INDEX IF NOT EXISTS idx_ga4_devices_sessions
  ON public.dashboard_ga4_devices_28d (property_id, sessions DESC);

CREATE INDEX IF NOT EXISTS idx_ga4_demographics_users
  ON public.dashboard_ga4_demographics_28d (property_id, users DESC);
