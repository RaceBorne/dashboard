-- Global no-go list. Domains here are excluded from every Discovery
-- search path: find-similar, the discover-agent, auto-scan, and the
-- peer brain lookup. Once a domain is blocked, the operator never
-- sees it again unless they manually delete the row.
CREATE TABLE IF NOT EXISTS dashboard_blocked_domains (
  domain text PRIMARY KEY,
  reason text,
  blocked_by_play uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blocked_domains_created
  ON dashboard_blocked_domains(created_at DESC);

COMMENT ON TABLE dashboard_blocked_domains IS
  'Global block list. Any domain here is excluded from every Discovery search path. Filled by the Not a fit action on Discovery rows.';
