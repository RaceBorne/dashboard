-- Plays use string IDs (play-XXX-YYY), not UUIDs. Convert
-- dashboard_blocked_domains.play_id from uuid to text so per-play
-- inserts stop silently failing with a UUID cast error.

DROP INDEX IF EXISTS idx_blocked_domains_global;
DROP INDEX IF EXISTS idx_blocked_domains_per_play;
DROP INDEX IF EXISTS idx_blocked_domains_lookup;

ALTER TABLE dashboard_blocked_domains
  ALTER COLUMN play_id TYPE text USING play_id::text;

CREATE UNIQUE INDEX idx_blocked_domains_global
  ON dashboard_blocked_domains(domain) WHERE play_id IS NULL;
CREATE UNIQUE INDEX idx_blocked_domains_per_play
  ON dashboard_blocked_domains(domain, play_id) WHERE play_id IS NOT NULL;
CREATE INDEX idx_blocked_domains_lookup
  ON dashboard_blocked_domains(play_id, domain);
