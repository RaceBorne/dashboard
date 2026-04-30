-- Add per-play scope to dashboard_blocked_domains.
ALTER TABLE dashboard_blocked_domains DROP CONSTRAINT IF EXISTS dashboard_blocked_domains_pkey;

ALTER TABLE dashboard_blocked_domains
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE dashboard_blocked_domains
  ADD CONSTRAINT dashboard_blocked_domains_pkey PRIMARY KEY (id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dashboard_blocked_domains' AND column_name = 'blocked_by_play'
  ) THEN
    ALTER TABLE dashboard_blocked_domains RENAME COLUMN blocked_by_play TO play_id;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_blocked_domains_global;
DROP INDEX IF EXISTS idx_blocked_domains_per_play;
CREATE UNIQUE INDEX idx_blocked_domains_global
  ON dashboard_blocked_domains(domain) WHERE play_id IS NULL;
CREATE UNIQUE INDEX idx_blocked_domains_per_play
  ON dashboard_blocked_domains(domain, play_id) WHERE play_id IS NOT NULL;

DROP INDEX IF EXISTS idx_blocked_domains_lookup;
CREATE INDEX idx_blocked_domains_lookup
  ON dashboard_blocked_domains(play_id, domain);

COMMENT ON COLUMN dashboard_blocked_domains.play_id IS
  'Scope. NULL = global (hidden from every venture). UUID = per-play scope (hidden only when prospecting that venture).';
