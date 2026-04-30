-- The peer brain. Maps a reference brand domain to a known peer
-- domain, with a confidence score and a source. Built up over time
-- by AI suggestions + user actions (Add to list, Send to shortlist).
-- Once seeded, lookups are 10ms instead of 2-4 seconds and quality
-- compounds rather than rerolling on each call.
CREATE TABLE IF NOT EXISTS dashboard_brand_peers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_domain text NOT NULL,
  peer_domain text NOT NULL,
  peer_name text,
  why text,
  confidence real NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'user', 'verified', 'seed')),
  use_count integer NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reference_domain, peer_domain)
);

CREATE INDEX IF NOT EXISTS idx_brand_peers_lookup
  ON dashboard_brand_peers(reference_domain, confidence DESC, last_used_at DESC);

COMMENT ON TABLE dashboard_brand_peers IS
  'Persistent peer knowledge graph. Reference brand to peer brand, with confidence + source. Filled by AI calls and reinforced by user actions. Query before hitting any AI / web service.';
COMMENT ON COLUMN dashboard_brand_peers.confidence IS
  '0.0 to 1.0. Default 0.5 for AI seeded. User Add to list bumps +0.2. Send to shortlist bumps +0.4. Web verify bumps +0.3 and sets source=verified.';
COMMENT ON COLUMN dashboard_brand_peers.source IS
  'Where this peer came from: ai (training knowledge), user (operator confirmed via Add/Send), verified (web search confirmed), seed (manually loaded).';
