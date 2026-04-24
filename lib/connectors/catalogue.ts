/**
 * Connector catalogue.
 *
 * One entry per external API the dashboard talks to. The catalogue is
 * the single source of truth for:
 *
 *   - which connectors the Settings → Connectors UI renders
 *   - what fields each connector needs (secret vs config)
 *   - which module owns the connector (Web Tools, Ventures, Social, Base)
 *   - which env vars the legacy fallback reads when the row is empty
 *
 * Keeping this declarative lets the UI, the credential helper, and the
 * testers all stay in sync when we add or change providers.
 */

export type ConnectorCategory =
  | 'commerce'
  | 'analytics'
  | 'seo'
  | 'email'
  | 'social'
  | 'ai'
  | 'infra';

export type ConnectorModule =
  | 'base'
  | 'web-tools'
  | 'ventures'
  | 'social';

export interface ConnectorField {
  key: string;
  label: string;
  placeholder?: string;
  /** Secret = redacted in UI, stored encrypted when a key is configured. */
  secret?: boolean;
  /** Optional fields don't block status=live if missing. */
  optional?: boolean;
  /** Non-secret default baked into the catalogue (e.g. Shopify API version). */
  default?: string;
  helpText?: string;
}

export interface ConnectorSpec {
  id: string;
  name: string;
  category: ConnectorCategory;
  module: ConnectorModule;
  icon: string; // lucide icon name
  description: string;
  docsUrl?: string;
  fields: ConnectorField[];
  /**
   * The env var names the legacy fallback reads when the Supabase row
   * is empty. Keeps the Evari deployment working during rollout.
   */
  envFallback?: Record<string, string>;
  /**
   * Identifier for the test function in lib/connectors/testers.ts.
   * When omitted, the Test button is hidden and the status derives only
   * from whether required fields are present.
   */
  tester?: string;
  /** True = uses OAuth, fields include a refresh_token slot for now. */
  oauth?: boolean;
}

export const CONNECTORS: ConnectorSpec[] = [
  // ----- COMMERCE -----
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'commerce',
    module: 'base',
    icon: 'ShoppingBag',
    description:
      'Admin API access for products, pages, articles, orders, redirects and more. Used across Pages, SEO Health, Synopsis, Klaviyo lookups, and Ventures.',
    docsUrl: 'https://shopify.dev/docs/api/admin-graphql',
    fields: [
      {
        key: 'storeDomain',
        label: 'Store domain',
        placeholder: 'mystore.myshopify.com',
      },
      {
        key: 'adminAccessToken',
        label: 'Admin API access token',
        placeholder: 'shpat_...',
        secret: true,
      },
      {
        key: 'apiVersion',
        label: 'API version',
        default: '2025-01',
        optional: true,
      },
      {
        key: 'storefrontUrl',
        label: 'Public storefront URL',
        placeholder: 'https://mystore.com',
        optional: true,
      },
    ],
    envFallback: {
      storeDomain: 'SHOPIFY_STORE_DOMAIN',
      adminAccessToken: 'SHOPIFY_ADMIN_ACCESS_TOKEN',
      apiVersion: 'SHOPIFY_API_VERSION',
      storefrontUrl: 'NEXT_PUBLIC_STOREFRONT_URL',
    },
    tester: 'shopify',
  },

  // ----- ANALYTICS -----
  {
    id: 'google-oauth',
    name: 'Google (OAuth)',
    category: 'analytics',
    module: 'base',
    icon: 'KeyRound',
    description:
      'Shared OAuth credentials. One connection unlocks Gmail send/read, GA4, Google Search Console, and the Play dry-run agents. Requires scopes for each sub-service.',
    docsUrl: 'https://developers.google.com/identity/protocols/oauth2',
    oauth: true,
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: '...apps.googleusercontent.com' },
      { key: 'clientSecret', label: 'Client secret', secret: true },
      {
        key: 'refreshToken',
        label: 'Refresh token',
        secret: true,
        helpText:
          'Paste the long-lived refresh token minted via OAuth Playground. Must carry scopes for gmail.send, gmail.modify, analytics.readonly, webmasters.readonly.',
      },
    ],
    envFallback: {
      clientId: 'GOOGLE_CLIENT_ID',
      clientSecret: 'GOOGLE_CLIENT_SECRET',
      refreshToken: 'GOOGLE_REFRESH_TOKEN',
    },
    tester: 'google-oauth',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    category: 'email',
    module: 'ventures',
    icon: 'Mail',
    description:
      'Sender identity for outreach drafts. Requires the Google OAuth connector above to be live with gmail.send + gmail.modify scopes.',
    fields: [
      {
        key: 'senderEmail',
        label: 'Sender email',
        placeholder: 'hello@yourdomain.com',
      },
    ],
    envFallback: {
      senderEmail: 'GMAIL_USER_EMAIL',
    },
  },
  {
    id: 'ga4',
    name: 'Google Analytics 4',
    category: 'analytics',
    module: 'web-tools',
    icon: 'TrendingUp',
    description:
      'Property + service-account credentials for the Traffic dashboard. Reads sessions, events, channels, pages, geo.',
    docsUrl: 'https://developers.google.com/analytics/devguides/reporting/data/v1',
    fields: [
      {
        key: 'propertyId',
        label: 'Property ID',
        placeholder: '123456789',
      },
      {
        key: 'clientEmail',
        label: 'Service account client email',
        placeholder: 'ga4-reader@project.iam.gserviceaccount.com',
        optional: true,
      },
      {
        key: 'privateKey',
        label: 'Service account private key',
        secret: true,
        optional: true,
        helpText:
          'PEM-encoded key with BEGIN/END lines intact. Escape newlines as \\n if stored in a single-line env.',
      },
    ],
    envFallback: {
      propertyId: 'GA4_PROPERTY_ID',
      clientEmail: 'GA4_CLIENT_EMAIL',
      privateKey: 'GA4_PRIVATE_KEY',
    },
    tester: 'ga4',
  },
  {
    id: 'gsc',
    name: 'Google Search Console',
    category: 'analytics',
    module: 'web-tools',
    icon: 'Search',
    description:
      'Site URL for GSC queries + pages + performance ingest. Authenticated via the Google OAuth connector.',
    fields: [
      {
        key: 'siteUrl',
        label: 'Property URL',
        placeholder: 'https://yourdomain.com/',
        helpText: 'Include the trailing slash. Must match the property exactly as registered in GSC.',
      },
    ],
    envFallback: {
      siteUrl: 'GSC_SITE_URL',
    },
    tester: 'gsc',
  },
  {
    id: 'pagespeed',
    name: 'PageSpeed Insights',
    category: 'analytics',
    module: 'web-tools',
    icon: 'Gauge',
    description:
      'Google PageSpeed / Lighthouse API for the Performance dashboard. Free, just needs an API key from Google Cloud Console.',
    fields: [{ key: 'apiKey', label: 'API key', secret: true }],
    envFallback: { apiKey: 'PAGESPEED_API_KEY' },
    tester: 'pagespeed',
  },
  {
    id: 'google-places',
    name: 'Google Places',
    category: 'analytics',
    module: 'ventures',
    icon: 'MapPin',
    description:
      'Place Search / Details API for the Ventures Discover module. Used to source qualified business prospects.',
    fields: [{ key: 'apiKey', label: 'API key', secret: true }],
    envFallback: { apiKey: 'GOOGLE_PLACES_API_KEY' },
    tester: 'google-places',
  },

  // ----- SEO -----
  {
    id: 'dataforseo',
    name: 'DataForSEO',
    category: 'seo',
    module: 'web-tools',
    icon: 'Hash',
    description:
      'SERP positions, backlinks, keyword volumes, competitor rank tracking. Powers the Keywords + Backlinks workspaces.',
    docsUrl: 'https://docs.dataforseo.com/v3/',
    fields: [
      { key: 'login', label: 'Login', placeholder: 'you@yourcompany.com' },
      { key: 'password', label: 'Password', secret: true },
    ],
    envFallback: { login: 'DATAFORSEO_LOGIN', password: 'DATAFORSEO_PASSWORD' },
    tester: 'dataforseo',
  },

  // ----- EMAIL -----
  {
    id: 'klaviyo',
    name: 'Klaviyo',
    category: 'email',
    module: 'base',
    icon: 'Mail',
    description:
      'Klaviyo private API for campaigns, flows, lists, and metrics used in the marketing dashboard.',
    docsUrl: 'https://developers.klaviyo.com/en/reference/api_overview',
    fields: [{ key: 'apiKey', label: 'Private API key', placeholder: 'pk_...', secret: true }],
    envFallback: { apiKey: 'KLAVIYO_API_KEY' },
    tester: 'klaviyo',
  },

  // ----- SOCIAL -----
  {
    id: 'meta',
    name: 'Meta (Instagram + Facebook)',
    category: 'social',
    module: 'social',
    icon: 'Instagram',
    description:
      'Graph API access token for Instagram business + Facebook page insights. One token covers both.',
    oauth: true,
    fields: [
      {
        key: 'instagramBusinessAccountId',
        label: 'Instagram business account ID',
        optional: true,
      },
      { key: 'accessToken', label: 'Long-lived access token', secret: true },
    ],
    envFallback: {
      instagramBusinessAccountId: 'INSTAGRAM_BUSINESS_ACCOUNT_ID',
      accessToken: 'META_ACCESS_TOKEN',
    },
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    category: 'social',
    module: 'social',
    icon: 'Linkedin',
    description:
      'LinkedIn Marketing API for company page posts, impressions, and follower counts.',
    oauth: true,
    fields: [
      { key: 'accessToken', label: 'Access token', secret: true },
      {
        key: 'organizationUrn',
        label: 'Organization URN',
        placeholder: 'urn:li:organization:12345',
      },
    ],
    envFallback: {
      accessToken: 'LINKEDIN_ACCESS_TOKEN',
      organizationUrn: 'LINKEDIN_ORGANIZATION_URN',
    },
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    category: 'social',
    module: 'social',
    icon: 'Music',
    description:
      'TikTok for Business API. Used for organic post analytics on the Social dashboard.',
    oauth: true,
    fields: [{ key: 'accessToken', label: 'Access token', secret: true }],
    envFallback: { accessToken: 'TIKTOK_ACCESS_TOKEN' },
  },

  // ----- AI -----
  {
    id: 'ai-gateway',
    name: 'Vercel AI Gateway',
    category: 'ai',
    module: 'base',
    icon: 'Sparkles',
    description:
      'Preferred AI provider. Cheaper per-token, unified billing, automatic provider failover inside Vercel.',
    fields: [{ key: 'apiKey', label: 'API key', secret: true, optional: true }],
    envFallback: { apiKey: 'AI_GATEWAY_API_KEY' },
  },
  {
    id: 'anthropic',
    name: 'Anthropic (fallback)',
    category: 'ai',
    module: 'base',
    icon: 'Brain',
    description:
      'Direct Anthropic key used as fallback when the gateway rate-limits or errors on auth.',
    fields: [{ key: 'apiKey', label: 'API key', secret: true, optional: true }],
    envFallback: { apiKey: 'ANTHROPIC_API_KEY' },
  },
];

export function getConnectorSpec(id: string): ConnectorSpec | null {
  return CONNECTORS.find((c) => c.id === id) ?? null;
}

export function connectorsByCategory(): Record<ConnectorCategory, ConnectorSpec[]> {
  const out: Record<ConnectorCategory, ConnectorSpec[]> = {
    commerce: [],
    analytics: [],
    seo: [],
    email: [],
    social: [],
    ai: [],
    infra: [],
  };
  for (const c of CONNECTORS) out[c.category].push(c);
  return out;
}

export const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  commerce: 'Commerce',
  analytics: 'Analytics',
  seo: 'SEO',
  email: 'Email',
  social: 'Social',
  ai: 'AI',
  infra: 'Infrastructure',
};
