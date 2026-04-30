CREATE TABLE IF NOT EXISTS dashboard_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  voice text NOT NULL DEFAULT '',
  agent_system_prompt text,
  default_industries text[] NOT NULL DEFAULT '{}',
  default_geographies text[] NOT NULL DEFAULT '{}',
  default_persona text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO dashboard_contexts (
  slug, name, description, voice, default_industries, default_geographies,
  default_persona, is_default
)
VALUES (
  'evari',
  'Evari Speed Bikes',
  'Evari is a premium British e-mobility brand. Every 856 is hand-built in the UK from monocoque carbon fibre with aerospace-grade titanium components. Lights, motor, battery, computer and brake hoses are routed inside the frame so nothing breaks the silhouette. Founder: Craig McDonald. HQ: Hertford, UK. Engineering at Silverstone labs with Cambridge Design Technology.',
  'Confident, understated, British. Design-led: talk about materials, engineering and ride feel, not horsepower. Precise numbers over marketing adjectives. Never shouty, never discount-led. Lead with the object, not the feature list. Never use em-dashes or en-dashes.',
  ARRAY['Luxury cars', 'Yachts', 'Private members clubs', 'Boutique hotels', 'Luxury travel and concierge'],
  ARRAY['United Kingdom', 'Channel Islands', 'Monaco', 'Switzerland'],
  'High-net-worth UK and European customers, often owners of supercars, yachts, or country estates.',
  true
)
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE dashboard_contexts IS
  'Top-level prospecting context. Cookie-driven active context determines AI brand grounding. Hard-capped at 3 rows.';
