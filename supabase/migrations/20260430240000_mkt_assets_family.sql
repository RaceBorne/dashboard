ALTER TABLE dashboard_mkt_assets
  ADD COLUMN IF NOT EXISTS parent_asset_id uuid REFERENCES dashboard_mkt_assets(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS variant_label text;

UPDATE dashboard_mkt_assets a
SET parent_asset_id = (
  SELECT (regexp_match(tag, '^derived:([0-9a-f-]+)$'))[1]::uuid
  FROM unnest(a.tags) AS tag
  WHERE tag LIKE 'derived:%'
  LIMIT 1
)
WHERE a.parent_asset_id IS NULL
  AND EXISTS (
    SELECT 1 FROM unnest(a.tags) AS tag WHERE tag LIKE 'derived:%'
  );

CREATE INDEX IF NOT EXISTS idx_mkt_assets_parent
  ON dashboard_mkt_assets(parent_asset_id)
  WHERE parent_asset_id IS NOT NULL;

COMMENT ON COLUMN dashboard_mkt_assets.parent_asset_id IS
  'When non-null, this row is a variant of the referenced parent asset. Variants travel with the parent and are deleted with it.';
COMMENT ON COLUMN dashboard_mkt_assets.variant_label IS
  'Human-readable label for a variant (e.g. "Newsletter hero", "Mobile thumb"). NULL on roots.';
