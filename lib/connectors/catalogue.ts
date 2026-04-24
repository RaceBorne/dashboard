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
  /**
   * Numbered setup instructions rendered inside the Configure panel.
   * Each step is a short sentence (one action per line). Keep them
   * specific enough that a first-time operator can follow without
   * needing to open the docs. Leave empty for connectors without a
   * meaningful external signup (e.g. AI Gateway).
   */
  setupSteps?: string[];
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
    setupSteps: [
      'Open your Shopify admin > Settings > Apps and sales channels > Develop apps.',
      'Click Create an app. Name it something like "Evari dashboard" and save.',
      'Go to Configuration > Admin API integration > Configure.',
      'Grant read/write on: products, orders, customers, online_store_pages, online_store_navigation, online_store_articles, content, inventory, analytics. Save.',
      'Go to API credentials. Click Install app.',
      'Copy the Admin API access token (starts with shpat_) into the Admin API access token field here.',
      'Store domain is the .myshopify.com URL (e.g. mystore.myshopify.com).',
    ],
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
    setupSteps: [
      'Go to https://console.cloud.google.com and create or pick a project.',
      'APIs & Services > Library: enable Gmail API, Google Analytics Data API, Search Console API, Google Analytics Admin API.',
      'APIs & Services > OAuth consent screen: External, add your email as a test user, save.',
      'APIs & Services > Credentials > Create credentials > OAuth client ID > Web application. Authorised redirect URI: https://developers.google.com/oauthplayground',
      'Copy the Client ID + Client secret into the fields here.',
      'Open https://developers.google.com/oauthplayground, click the gear icon, tick "Use your own OAuth credentials" and paste your Client ID + Secret.',
      'In the left pane, paste these scopes (one per line): https://www.googleapis.com/auth/gmail.send, https://www.googleapis.com/auth/gmail.modify, https://www.googleapis.com/auth/analytics.readonly, https://www.googleapis.com/auth/webmasters.readonly',
      'Click Authorize APIs, sign in, approve. On the next page click Exchange authorization code for tokens.',
      'Copy the Refresh token (long string) into the Refresh token field here.',
    ],
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
    setupSteps: [
      'Requires the Google (OAuth) connector above to be live first with gmail.send + gmail.modify scopes.',
      'Enter the email address outreach should send from (must match the account that approved the OAuth refresh token).',
    ],
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
    setupSteps: [
      'In Google Analytics: Admin > Property Settings. Copy the Property ID (9-10 digit number) into the Property ID field here.',
      'Easiest auth path: the Google (OAuth) connector above already covers GA4 read access. If it is live, leave the service-account fields blank.',
      'Service account path (optional, for server-to-server without OAuth): Google Cloud Console > IAM & Admin > Service accounts > Create. Download the JSON key.',
      'Paste the client_email value into Service account client email. Paste the entire private_key string (-----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----) into the key field.',
      'In Google Analytics > Admin > Property access management, add that service account email with Viewer role.',
    ],
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
    setupSteps: [
      'Open https://search.google.com/search-console. Make sure your property is verified (Domain or URL prefix).',
      'Copy the property as it appears in the property picker (e.g. sc-domain:evari.cc or https://www.evari.cc/) into the Property URL field here.',
      'Authentication is handled by the Google (OAuth) connector above — needs the webmasters.readonly scope.',
    ],
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
    setupSteps: [
      'Open https://console.cloud.google.com > APIs & Services > Library. Search for PageSpeed Insights API and enable it.',
      'Go to Credentials > Create credentials > API key.',
      'Copy the key into the API key field here. Optionally restrict it to the PageSpeed Insights API for safety.',
    ],
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
    setupSteps: [
      'Open https://console.cloud.google.com > APIs & Services > Library. Enable "Places API (New)".',
      'Credentials > Create credentials > API key. Copy the key.',
      'Restrict the key to Places API (New) under API restrictions for safety.',
      'Paste the key into the API key field here.',
    ],
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
    setupSteps: [
      'Sign up at https://dataforseo.com. They offer a free trial with credit to explore the APIs.',
      'Open https://app.dataforseo.com/api-access after logging in.',
      'Copy the API Login (your signup email) into the Login field here.',
      'Copy the API Password (auto-generated, not your account password) into the Password field here.',
    ],
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
    setupSteps: [
      'In Klaviyo: Account (bottom-left avatar) > Settings > API keys.',
      'Click Create Private API Key. Name it something like "Evari dashboard".',
      'Grant at minimum: campaigns:read, flows:read, lists:read, metrics:read, accounts:read, profiles:read.',
      'Copy the full key (starts with pk_) into the Private API key field here.',
    ],
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
    setupSteps: [
      'Open https://developers.facebook.com. Create an app (type: Business).',
      'Add products: Instagram Graph API, Facebook Pages API.',
      'Under Instagram Graph API > Basic display, link your Instagram Business account (the account must be Business or Creator, linked to a Facebook Page).',
      'Use Graph API Explorer: select your app, generate a User token with scopes: pages_read_engagement, pages_read_user_content, instagram_basic, instagram_manage_insights.',
      'Convert the short-lived token to a long-lived token: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived',
      'Paste the long-lived token into Access token. Paste the Instagram Business account ID (17-digit number from Graph API Explorer) into Instagram business account ID.',
    ],
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
    setupSteps: [
      'Open https://www.linkedin.com/developers. Create a new app, associate it with your Company Page.',
      'Products tab: request access to Marketing Developer Platform (approval can take 1-2 days for a brand-new app).',
      'Auth tab: add redirect URL https://www.linkedin.com/developers/tools/oauth. Scopes needed: r_organization_social, rw_organization_admin, r_ads_reporting.',
      'Generate an access token via the OAuth 2.0 token generator tool in the Auth tab.',
      'Paste the access token into Access token field here.',
      'Organization URN is urn:li:organization:<your-company-id>. Find the ID at linkedin.com/company/<slug>/admin/ (numeric ID in the URL).',
    ],
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
    setupSteps: [
      'Open https://business.tiktok.com. Create a TikTok for Business account if you do not have one.',
      'Go to https://developers.tiktok.com > My apps > Create new app.',
      'Add the Content Posting API and Display API products. Complete the verification flow.',
      'Under Login Kit, request scopes user.info.basic, video.list.',
      'Use the Authorization endpoint to generate a user access token for your TikTok Business account.',
      'Paste the access token into the Access token field here.',
    ],
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
    setupSteps: [
      'In your Vercel project, go to AI > Gateway > Create gateway (or reuse an existing one).',
      'Copy the gateway API key from the gateway settings page.',
      'Paste it into the API key field here. This routes every AI call through Vercel with unified billing + automatic provider failover.',
    ],
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
    setupSteps: [
      'Open https://console.anthropic.com and sign up or log in.',
      'Settings > API keys > Create Key. Name it something like "Evari dashboard fallback".',
      'Copy the key (starts with sk-ant-) into the API key field here. Used as fallback when the AI Gateway rate-limits or errors.',
    ],
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
