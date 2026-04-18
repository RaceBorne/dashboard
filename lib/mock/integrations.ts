import type { IntegrationStatus } from '@/lib/types';

function envSet(name: string) {
  return Boolean(process.env[name] && process.env[name]!.length > 0);
}

function buildStatus(
  key: IntegrationStatus['key'],
  label: string,
  category: IntegrationStatus['category'],
  envVarsRequired: string[],
  docsUrl: string,
  notes?: string,
): IntegrationStatus {
  const envVarsMissing = envVarsRequired.filter((v) => !envSet(v));
  return {
    key,
    label,
    category,
    connected: envVarsMissing.length === 0,
    envVarsRequired,
    envVarsMissing,
    docsUrl,
    notes,
  };
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  return [
    buildStatus(
      'ai_gateway',
      'Vercel AI Gateway',
      'ai',
      ['AI_GATEWAY_API_KEY'],
      'https://vercel.com/docs/ai-gateway',
      'OIDC via `vercel env pull` is the preferred auth — leave AI_GATEWAY_API_KEY blank when running on Vercel.',
    ),
    buildStatus(
      'shopify',
      'Shopify Admin API',
      'commerce',
      ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ADMIN_ACCESS_TOKEN'],
      'https://shopify.dev/docs/api/admin',
      'Required scopes: read/write products, collections, content, orders, customers, draft orders.',
    ),
    buildStatus(
      'gsc',
      'Google Search Console',
      'seo',
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GSC_SITE_URL'],
      'https://developers.google.com/webmaster-tools',
    ),
    buildStatus(
      'ga4',
      'GA4 Data API',
      'seo',
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GA4_PROPERTY_ID'],
      'https://developers.google.com/analytics/devguides/reporting/data/v1',
    ),
    buildStatus(
      'gmail',
      'Gmail (lead inbox)',
      'leads',
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GMAIL_USER_EMAIL'],
      'https://developers.google.com/gmail/api',
      'Scopes: gmail.readonly + gmail.send. The dashboard reads threads tagged with the Evari/Leads label and can send replies.',
    ),
    buildStatus(
      'pagespeed',
      'PageSpeed Insights',
      'seo',
      [],
      'https://developers.google.com/speed/docs/insights/v5/get-started',
      'Works without a key. Add PAGESPEED_API_KEY for higher rate limits.',
    ),
    buildStatus(
      'linkedin',
      'LinkedIn Marketing API',
      'social',
      ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_ORGANIZATION_URN'],
      'https://learn.microsoft.com/en-us/linkedin/marketing/',
      'Needs Marketing Developer Platform access — review can take 2-4 weeks.',
    ),
    buildStatus(
      'instagram',
      'Meta (Instagram Business)',
      'social',
      ['META_APP_ID', 'META_APP_SECRET', 'META_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID'],
      'https://developers.facebook.com/docs/instagram-api',
      'Permissions: instagram_content_publish, instagram_manage_insights, business_management.',
    ),
    buildStatus(
      'tiktok',
      'TikTok Content Posting + Business',
      'social',
      ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_ACCESS_TOKEN'],
      'https://developers.tiktok.com/doc/content-posting-api-get-started/',
      'Two scopes required: content.publish and business.account.read. App review applies.',
    ),
    buildStatus(
      'database',
      'Neon Postgres',
      'storage',
      ['DATABASE_URL'],
      'https://vercel.com/marketplace/neon',
      'Provision via Vercel Marketplace — DATABASE_URL is auto-injected.',
    ),
  ];
}
