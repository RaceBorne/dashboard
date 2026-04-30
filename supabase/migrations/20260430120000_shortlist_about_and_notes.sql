-- Discovery drawer: per-row synopsis, structured company facts, and
-- free-form notes. All three columns persist with the row through
-- Shortlist + Enrichment so they don't need to be re-derived later.

ALTER TABLE dashboard_play_shortlist
  ADD COLUMN IF NOT EXISTS about_text text,
  ADD COLUMN IF NOT EXISTS about_meta jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN dashboard_play_shortlist.about_text IS
  'AI-generated 60-90 word company synopsis. Lazy-fetched on first About-tab open in the Discovery drawer; cached here to avoid re-spending on re-opens.';
COMMENT ON COLUMN dashboard_play_shortlist.about_meta IS
  'Structured company facts extracted alongside about_text: { address, phone, employeeRange, orgType, generatedAt }.';
COMMENT ON COLUMN dashboard_play_shortlist.notes IS
  'Free-form user notes attached to the row in the Discovery drawer. Persists into Shortlist + Enrichment.';
