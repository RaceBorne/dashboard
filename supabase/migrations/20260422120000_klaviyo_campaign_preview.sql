-- Klaviyo campaigns — store rendered preview HTML + extra metadata for the
-- new /klaviyo dashboard.
--
-- Adds:
--   - preview_html        : full rendered email HTML used for iframe thumbnails
--   - preview_text        : first ~240 chars of plain text (fallback + preview)
--   - preview_subject     : de-duped subject snapshot at render time
--   - from_email          : sender address surfaced in the card header
--   - from_label          : sender friendly name (e.g. "Evari Bikes")
--   - reply_to_email      : reply-to address (often different)
--   - delivered           : delivered sends (num_recipients minus hard bounces)
--   - clicks_to_opens     : derived click-to-open ratio (click uniqs / open uniqs)
--   - preview_fetched_at  : when the rendered HTML was last refreshed
--
-- Everything is nullable so older rows written before this migration stay valid.

alter table public.dashboard_klaviyo_campaigns
  add column if not exists preview_html        text,
  add column if not exists preview_text        text,
  add column if not exists preview_subject     text,
  add column if not exists from_email          text,
  add column if not exists from_label          text,
  add column if not exists reply_to_email      text,
  add column if not exists delivered           integer not null default 0,
  add column if not exists clicks_to_opens     numeric not null default 0,
  add column if not exists preview_fetched_at  timestamptz;
