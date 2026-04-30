-- Asset purposes. See lib/marketing/assets.ts for the canonical set.
ALTER TABLE dashboard_mkt_assets
  ADD COLUMN IF NOT EXISTS purposes text[] NOT NULL DEFAULT ARRAY['global'];

CREATE INDEX IF NOT EXISTS idx_mkt_assets_purposes
  ON dashboard_mkt_assets USING gin(purposes);

COMMENT ON COLUMN dashboard_mkt_assets.purposes IS
  'Array of channel tags: any subset of {global, web, newsletter}. Used by the Assets page tabs to filter what an asset is prepared for.';
