/**
 * Wireframe — system architecture data.
 *
 * Each `node` is a service. Each `flow` is a connection between two services
 * with bidirectional payloads (what data moves which way). The detail panel
 * on /wireframe reads this file directly — Craig + partner should be able to
 * understand the whole stack from these descriptions alone.
 *
 * Costs are monthly in GBP at the tier we're likely to need.
 *
 * This is the canonical source of integration info — the /wireframe page is
 * the single place to see every connection, and eventually the old
 * /connections page is being retired in favour of this.
 */

export type WireframeTier =
  | 'foundation'
  | 'commerce'
  | 'marketing'
  | 'seo'
  | 'social'
  | 'email'
  | 'leads'
  | 'app';

export interface CostLine {
  label: string;
  amount: number;
  note?: string;
}

export interface AccountInfo {
  label: string;
  identifierEnvVar?: string;
  identifierStatic?: string;
  identifierPlaceholder?: string;
  adminUrlTemplate: string;
}

export interface WireframeNode {
  id: string;
  label: string;
  role: string;
  costGBP: number;
  costNote: string;
  costDetail: CostLine[];
  tier: WireframeTier;
  /** Optional cluster id — nodes in the same cluster get a visible background grouping */
  cluster?: string;
  x: number;
  y: number;
  envVars: string[];
  optional?: boolean;
  account?: AccountInfo;
  blurb: string;
  manageHere: string[];
  manageInService: string[];
  outcomes: string[];
  capabilities?: { name: string; description: string }[];
  notes?: string;
  docsUrl?: string;
}

export interface WireframeFlow {
  from: string;
  to: string;
  fromPayloads: string[];
  toPayloads: string[];
  summary: string;
}

export interface DashboardSection {
  label: string;
  pages: { href: string; label: string; blurb: string }[];
}

export const DASHBOARD_MAP: DashboardSection[] = [
  {
    label: 'Today',
    pages: [
      { href: '/', label: 'Briefing', blurb: 'Morning editorial in your voice — what happened, what needs your eye today.' },
      { href: '/tasks', label: 'To-do', blurb: 'Personal task list with custom lists, priority lozenges, calendar view.' },
    ],
  },
  {
    label: 'Pipeline',
    pages: [
      { href: '/plays', label: 'Plays', blurb: 'Outbound campaigns you run — medical, retreat hotels, boat owners, etc.' },
      { href: '/prospects', label: 'Prospects', blurb: 'Pre-lead outbound suspects being tested. Promote to leads when they bite.' },
      { href: '/leads', label: 'Leads', blurb: 'Active sales pipeline with stages, source attribution, estimated value.' },
      { href: '/conversations', label: 'Conversations', blurb: 'Gmail threads + AI-drafted replies in a three-pane viewer.' },
    ],
  },
  {
    label: 'Website',
    pages: [
      { href: '/traffic', label: 'Traffic', blurb: 'GA4 sessions, sources, conversions, engagement.' },
      { href: '/seo', label: 'SEO Health', blurb: 'Technical + on-page issues across evari.cc. Bulk-fix from here.' },
      { href: '/pages', label: 'Pages', blurb: 'Every page on evari.cc with meta, ranks, CWV, edit + publish.' },
      { href: '/keywords', label: 'Keywords', blurb: 'Query performance — ranks, impressions, clicks, opportunity score.' },
    ],
  },
  {
    label: 'Broadcast',
    pages: [
      { href: '/social', label: 'Social & blogs', blurb: 'Unified calendar — IG, LinkedIn, TikTok, YouTube, GBP, Shopify blog, Klaviyo newsletters.' },
    ],
  },
  {
    label: 'System',
    pages: [
      { href: '/wireframe', label: 'Wireframe', blurb: 'This page — live system architecture + per-service AI assistant.' },
      { href: '/connections', label: 'Connections', blurb: 'Legacy setup chat (being retired — wireframe is the replacement).' },
      { href: '/users', label: 'Users', blurb: 'Team members with role-based permissions.' },
      { href: '/settings', label: 'Settings', blurb: 'Theme, accent colour, voice, skill paths.' },
    ],
  },
];

// Layout constants (also consumed by WireframeDiagram — keep in sync there)
export const VIEW_W = 1500;
export const VIEW_H = 900;
export const BOX_W = 180;
export const BOX_H = 88;
// 16 units of spacing between any two adjacent boxes — invariant respected by
// the cluster grid AND the snap-on-drop logic.
export const GRID_GAP_X = 16;
export const GRID_GAP_Y = 16;
/** Padding inside the cluster rect on left/right/bottom (32 units around boxes) */
export const CLUSTER_PAD = 32;
/** Total top strip height of the cluster rect — 20px above the title label
 *  (fixed rule) + room for the label itself + a small gap before the first box. */
export const CLUSTER_TITLE_H = 48;

/**
 * Visual clusters — named groups of nodes that get a brighter background
 * rectangle drawn behind them. One cluster per shared function (core, social,
 * outreach, SEO). Dashboard sits at the centre, outside any cluster.
 */
export interface ClusterMeta {
  label: string;
  /** Fill colour for the cluster rect — 4% brighter than the surface */
  fillVar: string;
}
export const CLUSTERS: Record<string, ClusterMeta> = {
  core: { label: 'Core', fillVar: 'rgb(255 255 255 / 0.04)' },
  social: { label: 'Social', fillVar: 'rgb(255 255 255 / 0.04)' },
  outreach: { label: 'Commerce & Outreach', fillVar: 'rgb(255 255 255 / 0.04)' },
  seo: { label: 'SEO', fillVar: 'rgb(255 255 255 / 0.04)' },
};

/**
 * Cluster placement — where each cluster sits in the viewBox and how its
 * members are arranged in a grid. Everything radiates from the dashboard at
 * the centre, with the four clusters in the four quadrants.
 */
export interface ClusterLayoutDef {
  id: string;
  /** Centre of cluster in viewBox coords */
  cx: number;
  cy: number;
  /** Number of columns in the grid (rows computed from member count) */
  cols: number;
  /** Node IDs in row-major order */
  members: string[];
}

export const CLUSTER_LAYOUT: ClusterLayoutDef[] = [
  {
    id: 'core',
    cx: 330,
    cy: 200, // shifted down so the cluster rect top stays ≥32px from viewBox top
    cols: 2,
    members: ['github', 'vercel', 'supabase', 'aigateway'],
  },
  {
    id: 'social',
    cx: 1180,
    cy: 200,
    cols: 2,
    members: ['linkedin', 'instagram', 'tiktok', 'youtube'],
  },
  {
    id: 'outreach',
    cx: 330,
    cy: 680, // shifted up so the 3rd-row Booking box stays ≥32px from viewBox bottom
    cols: 2,
    members: ['shopify', 'klaviyo', 'whatsapp', 'email', 'booking'],
  },
  {
    id: 'seo',
    cx: 1150,
    cy: 680,
    cols: 3,
    members: ['gsc', 'ga4', 'pagespeed', 'gbp', 'trustpilot', 'semrush'],
  },
];

/** Dashboard at the geometric centre — sits between core/social above and outreach/seo below. */
export const DASHBOARD_CENTER = { x: 750, y: 420 };

/** Minimum distance between any cluster rect edge and the viewBox edge. */
export const CANVAS_MARGIN = 32;

/**
 * Compute the default position map: Dashboard at centre, every service
 * laid out inside its cluster grid. Called on mount and when the
 * "Clean up" button is clicked.
 */
export function computeDefaultPositions(): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  map.set('dashboard', { ...DASHBOARD_CENTER });
  for (const cluster of CLUSTER_LAYOUT) {
    const rows = Math.ceil(cluster.members.length / cluster.cols);
    const totalW = cluster.cols * BOX_W + (cluster.cols - 1) * GRID_GAP_X;
    const totalH = rows * BOX_H + (rows - 1) * GRID_GAP_Y;
    const x0 = cluster.cx - totalW / 2 + BOX_W / 2;
    const y0 = cluster.cy - totalH / 2 + BOX_H / 2;
    cluster.members.forEach((id, i) => {
      const col = i % cluster.cols;
      const row = Math.floor(i / cluster.cols);
      map.set(id, {
        x: x0 + col * (BOX_W + GRID_GAP_X),
        y: y0 + row * (BOX_H + GRID_GAP_Y),
      });
    });
  }
  return map;
}

export const WIREFRAME_NODES: WireframeNode[] = [
  // --- Dashboard (top centre) ---
  {
    id: 'dashboard',
    label: 'Evari Dashboard',
    role: 'The single pane',
    costGBP: 0,
    costNote: 'in repo',
    costDetail: [{ label: 'Source code (in GitHub)', amount: 0 }],
    tier: 'app',
    x: 600,
    y: 120,
    envVars: [],
    blurb:
      "The unified workspace Craig and the team work in. Briefing, To-do, Plays, Prospects, Leads, Conversations, SEO, Pages, Keywords, Social, Connections, Users, Settings. Every other service feeds it and it pushes work back out.",
    manageHere: [
      'Daily briefing + anomaly alerts',
      'Lead pipeline + conversation triage',
      'Plays + prospects with promotion lineage',
      'Tasks + custom lists',
      'Social calendar + post drafts',
      'SEO health + page-level audit',
      'Connections + credential storage',
    ],
    manageInService: [],
    outcomes: [
      'One window for all of Evari operations',
      'AI-drafted replies, briefings, social posts in your voice',
      'Cross-service insight (e.g. SEO drop tied to Klaviyo unsubscribe spike)',
    ],
  },

  // --- Foundation row (y=230) ---
  {
    id: 'github',
    label: 'GitHub',
    role: 'Source control',
    costGBP: 0,
    costNote: 'free',
    costDetail: [{ label: 'Private repo, unlimited collaborators', amount: 0 }],
    tier: 'foundation',
    cluster: 'core',
    x: 240,
    y: 290,
    // VERCEL_GIT_COMMIT_REPO is auto-provisioned by Vercel when the project
    // is linked to a GitHub repo — so this lights up green automatically on
    // the deployed site without needing manual env var configuration.
    envVars: ['VERCEL_GIT_COMMIT_REPO'],
    account: {
      label: 'Repository',
      // On Vercel, VERCEL_GIT_REPO_SLUG is "dashboard" and OWNER is "RaceBorne"
      // — but showing the full repo URL via the combined slug looks cleaner.
      identifierEnvVar: 'VERCEL_GIT_REPO_SLUG',
      identifierPlaceholder: 'RaceBorne/dashboard',
      adminUrlTemplate: 'https://github.com/RaceBorne/dashboard',
    },
    blurb:
      'Where the code lives. Every change is a branch + PR + preview deploy. Auto-deploys to Vercel on merge to main.',
    manageHere: ['Issue list mirror (optional)', 'PR comments in activity feed'],
    manageInService: ['Code review + merging', 'Branch protection', 'Secrets storage (encrypted)'],
    outcomes: ['Roll back any release in seconds', 'Preview deploy per PR', 'Free CI/CD via Vercel'],
    capabilities: [
      { name: 'Repo', description: 'Private repo for the dashboard + CI/CD pipeline.' },
      { name: 'PR workflow', description: 'Every change goes through a branch → preview deploy → merge → prod.' },
      { name: 'Actions (optional)', description: 'Scheduled jobs + test runs if we want them outside Vercel cron.' },
    ],
    notes: 'Optional GITHUB_TOKEN enables PR comments + issue automation from the dashboard.',
    docsUrl: 'https://docs.github.com/en/rest',
  },
  {
    id: 'vercel',
    label: 'Vercel',
    role: 'Hosting + cron + AI gateway',
    costGBP: 16,
    costNote: 'Pro',
    costDetail: [
      { label: 'Pro plan (per member)', amount: 16, note: '$20/mo USD' },
      { label: 'Cron + preview deploys', amount: 0, note: 'included' },
    ],
    tier: 'foundation',
    cluster: 'core',
    x: 480,
    y: 290,
    // VERCEL is auto-provisioned to "1" by Vercel's build/runtime environment
    // — so a deployed app always lights Vercel up green. Locally, it's absent.
    envVars: ['VERCEL'],
    account: {
      label: 'Team',
      identifierStatic: 'Evari',
      adminUrlTemplate: 'https://vercel.com/dashboard',
    },
    blurb:
      "Where the dashboard runs. Auto-deploys from GitHub. Hosts our cron jobs. Provides keyless OIDC auth into the AI Gateway so we don't need API keys in env vars.",
    manageHere: ['Deployment status', 'Cron schedules via vercel.json (in repo)'],
    manageInService: ['DNS + custom domains', 'Password protection', 'Marketplace installs', 'Per-environment env vars'],
    outcomes: ['Zero-downtime deploys', 'Preview URL per branch', 'Single invoice for AI Gateway'],
    capabilities: [
      { name: 'Hosting', description: 'Serverless deployment of the Next.js app.' },
      { name: 'OIDC → AI Gateway', description: 'Keyless auth for all AI calls.' },
      { name: 'Cron', description: 'Scheduled jobs — daily digest, weekly reminder, nightly Shopify sync.' },
      { name: 'Marketplace', description: 'Supabase / Sentry one-click installs.' },
    ],
    notes: 'All three env values are auto-populated by `vercel link` + `vercel env pull`.',
    docsUrl: 'https://vercel.com/docs',
  },
  {
    id: 'supabase',
    label: 'Supabase',
    role: 'Postgres + auth + storage',
    costGBP: 20,
    costNote: 'Pro',
    costDetail: [
      { label: 'Pro plan', amount: 20, note: '$25/mo, 8GB DB included' },
      { label: 'Edge functions', amount: 0, note: '500k invocations included' },
    ],
    tier: 'foundation',
    cluster: 'core',
    x: 720,
    y: 290,
    envVars: ['DATABASE_URL'],
    account: {
      label: 'Project',
      identifierStatic: 'evari',
      adminUrlTemplate: 'https://supabase.com/dashboard',
    },
    blurb:
      'The brain. Stores everything: leads, tasks, the Shopify mirror, conversations, keyword history, prospects with promotion lineage, plays. Also handles user login, file uploads, realtime updates.',
    manageHere: ['All data in the dashboard', 'User accounts + role-based permissions', 'File uploads'],
    manageInService: ['Schema migrations in repo', 'Backups + point-in-time recovery', 'Row-level security'],
    outcomes: ['No more spreadsheets — single source of truth', 'Multi-user from day one', 'Built-in auth removes weeks of work'],
    capabilities: [
      { name: 'Schema', description: 'Owned in-repo via migrations, generated TypeScript types.' },
      { name: 'Row-level security', description: 'Per-user policies once auth is wired.' },
      { name: 'Point-in-time restore', description: 'Built-in backups.' },
    ],
    notes: 'Provision via Vercel Marketplace — DATABASE_URL auto-injected.',
    docsUrl: 'https://supabase.com/docs',
  },
  {
    id: 'aigateway',
    label: 'AI Gateway',
    role: 'Routes AI calls (optional)',
    costGBP: 8,
    costNote: 'pay-as-you-go',
    costDetail: [
      { label: 'Gateway itself', amount: 0, note: 'Vercel pass-through — no surcharge' },
      { label: 'Claude Sonnet (briefings + replies)', amount: 5, note: '~50 generations/mo' },
      { label: 'Claude Haiku (voice + chat)', amount: 3, note: '~500 short turns/mo' },
    ],
    tier: 'foundation',
    cluster: 'core',
    x: 960,
    y: 290,
    envVars: ['AI_GATEWAY_API_KEY'],
    optional: true,
    account: {
      label: 'Team',
      identifierStatic: 'Evari',
      adminUrlTemplate: 'https://vercel.com/dashboard/ai',
    },
    blurb:
      "Optional — dashboard runs fine without this. Turn on when you want the morning briefing, Hey Evari, email reply drafts, social post generation, and per-box chat to actually be intelligent. Gateway itself is free; you only pay LLM tokens.",
    manageHere: ['Model selection per use-case', 'Budget alerts via Vercel'],
    manageInService: ['Add/remove provider keys', 'Per-route rate limiting'],
    outcomes: [
      'Briefings in your voice using actual numbers',
      'Hey Evari becomes conversational',
      'AI-drafted email responses',
      'Per-service chat on this page becomes genuinely useful',
    ],
    capabilities: [
      { name: 'Daily briefing', description: 'Morning narrative in your voice from live data.' },
      { name: 'Reply suggestions', description: 'Drafts replies in Conversations.' },
      { name: 'Social drafts', description: 'Captions at /social/new.' },
      { name: 'Per-service chat', description: 'The AI window on each wireframe box.' },
    ],
    notes: 'OIDC via `vercel env pull` is preferred — leave AI_GATEWAY_API_KEY blank on Vercel.',
    docsUrl: 'https://vercel.com/docs/ai-gateway',
  },

  // --- Commerce + Messaging + Booking row (y=380) ---
  {
    id: 'shopify',
    label: 'Shopify',
    role: 'Storefront + commerce engine',
    costGBP: 25,
    costNote: 'Basic',
    costDetail: [
      { label: 'Basic Shopify plan', amount: 25, note: 'UK pricing' },
      { label: 'Transaction fees', amount: 0, note: '2.0% + 25p per online card sale' },
    ],
    tier: 'commerce',
    cluster: 'outreach',
    x: 200,
    y: 440,
    envVars: ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ADMIN_ACCESS_TOKEN'],
    account: {
      label: 'Store',
      identifierEnvVar: 'SHOPIFY_STORE_DOMAIN',
      identifierPlaceholder: 'evari-bikes.myshopify.com',
      adminUrlTemplate: 'https://{id}/admin',
    },
    blurb:
      "The commerce engine. Hosts evari.cc, takes the orders, holds the customer database, runs the bike builder. Shopify content (pages, blog posts, products) becomes the SEO surface area we audit and improve.",
    manageHere: [
      'Product meta — edit and push back',
      'Page meta (bulk fix from SEO Health)',
      'Blog drafts (Shopify-published)',
      'Abandoned carts (synced as Leads)',
      'Draft orders from bike builder',
      '301 redirects',
    ],
    manageInService: [
      'Theme design + storefront layout',
      'Variant pricing + stock levels',
      'Payment + shipping config',
      'Apps marketplace + checkout',
    ],
    outcomes: [
      'Edit product copy in dashboard → live on evari.cc in seconds',
      'Abandoned carts surface as leads automatically',
      'SEO meta updates pushed in bulk',
      'Medical/rehab leads convert via dashboard-generated draft orders',
    ],
    capabilities: [
      { name: 'read/write_products', description: 'Titles, descriptions, meta, images, variants, prices.' },
      { name: 'read/write_content', description: 'Pages + blog articles for SEO + publishing.' },
      { name: 'read/write_themes', description: 'Theme assets — JSON-LD + CWV fixes.' },
      { name: 'read/write_metaobjects', description: 'Custom structured content.' },
      { name: 'read_customers + read_orders', description: 'Attribution + LTV.' },
      { name: 'read/write_draft_orders', description: 'Bike builder quotes.' },
      { name: 'read/write_redirects', description: 'Fix 404s, URL hygiene.' },
    ],
    notes: 'Custom app in Shopify admin → generate Admin API access token with scopes above.',
    docsUrl: 'https://shopify.dev/docs/api/admin',
  },
  {
    id: 'klaviyo',
    label: 'Klaviyo',
    role: 'Email + SMS + WhatsApp',
    costGBP: 35,
    costNote: '~2.5k contacts',
    costDetail: [
      { label: 'Email plan up to 2,500 contacts', amount: 35, note: 'free under 250' },
      { label: 'SMS pay-as-you-go', amount: 0, note: '~£0.04 per UK SMS' },
    ],
    tier: 'marketing',
    cluster: 'outreach',
    x: 400,
    y: 440,
    envVars: ['KLAVIYO_PRIVATE_API_KEY'],
    account: {
      label: 'Account',
      identifierStatic: 'Evari Speed Bikes',
      adminUrlTemplate: 'https://www.klaviyo.com/dashboard',
    },
    blurb:
      'Email/SMS/WhatsApp engine. Newsletter campaigns, automated flows, segmentation. Synced two-way with Shopify customers and the lead pipeline.',
    manageHere: [
      'Subscriber list as a live view',
      'Schedule campaigns from /social calendar',
      'Campaign performance per send',
      'Trigger flow events programmatically',
      'Add/remove from lists by lead stage',
      'Approve AI-drafted email copy',
    ],
    manageInService: [
      'Email TEMPLATE design (drag-drop builder)',
      'Flow editor (visual automations)',
      'Deliverability + warmup',
      'SMS sender ID + WhatsApp template approval',
    ],
    outcomes: [
      'Subscribers + leads are the same dataset',
      'Campaign performance next to SEO on briefing',
      'Triggered automations from dashboard events',
      'Stop logging into Klaviyo to send a newsletter',
    ],
    capabilities: [
      { name: 'Campaigns', description: 'Pull + schedule email/SMS sends with segment targeting.' },
      { name: 'Flows', description: 'Welcome, abandoned cart, post-purchase, rehab nurture.' },
      { name: 'Profiles', description: 'Create + update subscribers, list membership.' },
      { name: 'Metrics', description: 'Custom events for attribution.' },
      { name: 'Catalog feed', description: 'Shopify products for personalised blocks.' },
    ],
    notes: 'Private key is server-side only. Public key is safe for browser (tracking + sign-up).',
    docsUrl: 'https://developers.klaviyo.com/en/reference/api_overview',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp Business',
    role: 'Templated messaging + two-way chat',
    costGBP: 0,
    costNote: 'via Klaviyo or direct',
    costDetail: [
      { label: 'Klaviyo WhatsApp (recommended)', amount: 0, note: 'Klaviyo handles engine' },
      { label: 'Meta conversation fee', amount: 0, note: '~£0.035/UK conversation' },
    ],
    tier: 'marketing',
    cluster: 'outreach',
    x: 600,
    y: 440,
    envVars: ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN'],
    optional: true,
    account: {
      label: 'Business account',
      identifierEnvVar: 'WHATSAPP_PHONE_NUMBER_ID',
      identifierPlaceholder: '+44 ...',
      adminUrlTemplate: 'https://business.whatsapp.com/',
    },
    blurb:
      'Fast reach for UK customers who prefer WhatsApp. Schedule template broadcasts or handle inbound enquiries. Especially useful for medical partner onboarding.',
    manageHere: [
      'Template broadcasts (test-ride reminders, consultation follow-ups)',
      'Opt-in capture (website form + consent flag)',
      'Inbound messages route into Conversations',
    ],
    manageInService: ['Template approval (Meta takes 1-3 days)', 'Business verification'],
    outcomes: [
      'Higher open rates than email (~95% vs 22%)',
      'Rehab partners prefer WhatsApp',
      'Unified conversation view with Gmail',
    ],
    capabilities: [
      { name: 'Klaviyo WhatsApp', description: 'Use Klaviyo as engine — no separate Meta review.' },
      { name: 'Templated broadcasts', description: 'Pre-approved templates.' },
      { name: 'Two-way chat', description: 'Inbound routes into Conversations.' },
    ],
    notes: 'Two paths: (a) Klaviyo WhatsApp (simpler, recommended for v1); (b) direct Meta Cloud API.',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
  },
  {
    id: 'email',
    label: 'Gmail (Workspace)',
    role: 'Lead inbox + outbound',
    costGBP: 18,
    costNote: '£6 × 3 users',
    costDetail: [
      { label: 'Workspace Business Starter', amount: 18, note: '£6 per user/month' },
      { label: 'Same OAuth covers GSC, GA4, GBP, YouTube', amount: 0 },
    ],
    tier: 'email',
    cluster: 'outreach',
    x: 800,
    y: 440,
    envVars: ['GMAIL_USER_EMAIL', 'GOOGLE_REFRESH_TOKEN'],
    account: {
      label: 'Inbox',
      identifierEnvVar: 'GMAIL_USER_EMAIL',
      identifierPlaceholder: 'craig@evari.cc',
      adminUrlTemplate: 'https://mail.google.com/mail/u/?authuser={id}',
    },
    blurb:
      'Inbound + outbound business email. Threads tagged Evari/Leads pull into Conversations where Claude drafts replies in your voice.',
    manageHere: ['Threads in Conversations', 'AI-drafted replies', 'Labels', 'Convert thread → lead → prospect'],
    manageInService: ['Filter rules', 'Email signature', 'Out-of-office', 'Spam/phishing'],
    outcomes: ['One inbox, AI triage', 'Consistent Evari voice', 'Email becomes structured data'],
    capabilities: [
      { name: 'gmail.readonly', description: 'Read threads in Evari/Leads label.' },
      { name: 'gmail.send', description: 'Send approved replies.' },
      { name: 'gmail.labels', description: 'Apply/remove labels after triage.' },
    ],
    notes: 'One Google OAuth client covers GSC, GA4, Gmail, GBP, YouTube — one token, five services.',
    docsUrl: 'https://developers.google.com/gmail/api',
  },
  {
    id: 'booking',
    label: 'Cal.com',
    role: 'Self-serve consultation booker',
    costGBP: 0,
    costNote: 'free (self-hosted)',
    costDetail: [
      { label: 'Cal.com cloud (optional)', amount: 12, note: '£12/team/mo if not self-hosted' },
      { label: 'Calendly alternative', amount: 8, note: '$10/mo per seat' },
    ],
    tier: 'leads',
    cluster: 'outreach',
    x: 1000,
    y: 440,
    envVars: ['BOOKING_PROVIDER', 'BOOKING_API_KEY'],
    optional: true,
    account: {
      label: 'Workspace',
      identifierStatic: 'evari',
      adminUrlTemplate: 'https://app.cal.com/bookings',
    },
    blurb:
      'Replaces phone-tag with a self-serve booker. Prospect clicks "Book a consultation" → picks time → lead + Klaviyo event fire. Accelerator for medical/rehab where clinicians are busy.',
    manageHere: [
      'See bookings in Conversations as pending events',
      'Webhook creates lead + fires Klaviyo event',
      'Reschedule/cancel syncs lead record',
    ],
    manageInService: [
      'Event type creation (30-min consult, 15-min discovery, 60-min fitting)',
      'Availability + buffers',
      'Calendar integration (Google, Outlook)',
    ],
    outcomes: [
      'Fewer phone-tag cycles',
      'Embed on /rehab + product pages lifts conversion 30-50%',
      'Every booking has source attribution',
    ],
    capabilities: [
      { name: 'Event types', description: '30/15/60-min events mapped to lead sources.' },
      { name: 'Booking webhook', description: 'New booking → lead + Klaviyo event.' },
      { name: 'Embed widget', description: 'Drop into evari.cc pages with no redirect.' },
    ],
    notes: 'Cal.com is open-source, self-hostable, API-first. Calendly is the incumbent and easier.',
    docsUrl: 'https://cal.com/docs/api-reference',
  },

  // --- SEO row (y=530) ---
  {
    id: 'gsc',
    label: 'Google Search Console',
    role: 'Organic ranks, impressions, CTR',
    costGBP: 0,
    costNote: 'free',
    costDetail: [{ label: 'Free Google service', amount: 0 }],
    tier: 'seo',
    cluster: 'seo',
    x: 170,
    y: 580,
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GSC_SITE_URL'],
    account: {
      label: 'Site',
      identifierEnvVar: 'GSC_SITE_URL',
      identifierPlaceholder: 'https://evari.cc/',
      adminUrlTemplate: 'https://search.google.com/search-console?resource_id={id}',
    },
    blurb:
      'Pulls ranking data — queries, impressions, clicks, CTR, average position — per page and keyword. Feeds the Keywords page and the editorial headline on Briefing.',
    manageHere: ['Weekly keyword deltas on /keywords', 'Per-page rank stats on /pages', 'Sitemap errors surface on /seo'],
    manageInService: ['Property verification', 'Sitemap submission', 'URL removal requests'],
    outcomes: [
      'See every query we rank for (not competitor data — that needs SEMrush)',
      'Spot ranking drops within 24 hours',
      'Free — should always be wired',
    ],
    capabilities: [
      { name: 'searchanalytics.query', description: 'Impressions, clicks, CTR, position — weekly deltas.' },
      { name: 'sitemaps.list', description: 'Detect submission errors.' },
      { name: 'urlInspection', description: 'Per-URL index coverage + mobile usability.' },
    ],
    notes: 'Single Google OAuth client shared with GA4, Gmail, GBP, YouTube — one refresh token.',
    docsUrl: 'https://developers.google.com/webmaster-tools',
  },
  {
    id: 'ga4',
    label: 'GA4',
    role: 'Sessions + conversions',
    costGBP: 0,
    costNote: 'free',
    costDetail: [{ label: 'Free Google service', amount: 0 }],
    tier: 'seo',
    cluster: 'seo',
    x: 340,
    y: 580,
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GA4_PROPERTY_ID'],
    account: {
      label: 'Property',
      identifierEnvVar: 'GA4_PROPERTY_ID',
      identifierPlaceholder: '123456789',
      adminUrlTemplate: 'https://analytics.google.com/',
    },
    blurb:
      'Session / conversion / engagement reporting. Powers the Traffic page and the sessions sparkline on Briefing.',
    manageHere: ['Traffic dashboard at /traffic', 'Source attribution per lead', 'Realtime "who\'s on the site"'],
    manageInService: ['Event configuration', 'Goal definitions', 'Audiences'],
    outcomes: ['Know exactly where traffic comes from', 'Attribute leads to source', 'Daily trend in briefing'],
    capabilities: [
      { name: 'runReport', description: 'Sessions, users, bounce, conversions, sources.' },
      { name: 'runRealtimeReport', description: "Who's on the site right now." },
    ],
    notes: 'Same Google OAuth as GSC/Gmail/GBP/YouTube.',
    docsUrl: 'https://developers.google.com/analytics/devguides/reporting/data/v1',
  },
  {
    id: 'pagespeed',
    label: 'PageSpeed Insights',
    role: 'Core Web Vitals per URL',
    costGBP: 0,
    costNote: 'free',
    costDetail: [{ label: 'Free API', amount: 0, note: 'optional key for higher rate limits' }],
    tier: 'seo',
    cluster: 'seo',
    x: 515,
    y: 580,
    envVars: [],
    optional: true,
    account: {
      label: 'API',
      identifierStatic: 'public',
      adminUrlTemplate: 'https://pagespeed.web.dev/',
    },
    blurb:
      'Core Web Vitals per URL — LCP, CLS, INP — so we flag slow pages on SEO health and Pages. Free and already scaffolded.',
    manageHere: ['Per-page CWV on /pages', 'Slow-page alerts on /seo'],
    manageInService: [],
    outcomes: ['Find slow pages before Google penalises', 'Fix CWV → SEO boost', 'Baseline before theme changes'],
    capabilities: [{ name: 'runPagespeed', description: 'CWV for any URL on demand.' }],
    notes: 'Works without a key. Add PAGESPEED_API_KEY for higher rate limits.',
    docsUrl: 'https://developers.google.com/speed/docs/insights/v5/get-started',
  },
  {
    id: 'gbp',
    label: 'Google Business Profile',
    role: 'Local SEO + reviews',
    costGBP: 0,
    costNote: 'free',
    costDetail: [{ label: 'Free Google service', amount: 0 }],
    tier: 'seo',
    cluster: 'seo',
    x: 685,
    y: 580,
    envVars: ['GBP_ACCOUNT_ID', 'GBP_LOCATION_ID', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
    account: {
      label: 'Location',
      identifierEnvVar: 'GBP_LOCATION_ID',
      identifierPlaceholder: 'locations/123',
      adminUrlTemplate: 'https://business.google.com/n/{id}',
    },
    blurb:
      'Critical for local SEO and the medical/rehab "near me" funnel. Weekly posts, photos, Q&A, reviews — all from the dashboard. Ranks in Maps pack for "ebike rehab UK" etc.',
    manageHere: ['Weekly GBP posts from /social/new', 'Reviews in Conversations', 'AI-drafted review replies', 'Insights on /traffic'],
    manageInService: ['Business verification', 'Service area configuration', 'Photo management'],
    outcomes: [
      'Appear in local "near me" searches',
      'Star ratings in search results',
      'Medical/rehab discovery channel',
    ],
    capabilities: [
      { name: 'Posts', description: 'Weekly GBP posts scheduled from /social/new.' },
      { name: 'Reviews (read + reply)', description: 'Pull + respond to reviews.' },
      { name: 'Insights', description: 'Views, searches, call clicks, directions.' },
    ],
    notes: 'Same Google OAuth as GSC/GA4/Gmail/YouTube — no separate token needed.',
    docsUrl: 'https://developers.google.com/my-business',
  },
  {
    id: 'trustpilot',
    label: 'Trustpilot',
    role: 'Third-party reviews + schema stars',
    costGBP: 0,
    costNote: 'free tier',
    costDetail: [
      { label: 'Free tier (invites + reviews)', amount: 0 },
      { label: 'Paid tier (auto-invite API)', amount: 200, note: 'from ~£200/mo for API access' },
    ],
    tier: 'seo',
    cluster: 'seo',
    x: 855,
    y: 580,
    envVars: ['TRUSTPILOT_API_KEY', 'TRUSTPILOT_BUSINESS_UNIT_ID'],
    optional: true,
    account: {
      label: 'Business',
      identifierEnvVar: 'TRUSTPILOT_BUSINESS_UNIT_ID',
      identifierPlaceholder: 'evari.cc',
      adminUrlTemplate: 'https://business.trustpilot.com/',
    },
    blurb:
      'Star ratings in Google results (via review schema) boost CTR 20-35%. Trustpilot is the most credible third-party review platform in the UK. Feeds SEO moat workstream — review velocity is a cheap, durable advantage.',
    manageHere: ['Auto-invite after invoice_paid event', 'Reviews in Conversations', 'AI-drafted replies'],
    manageInService: ['Review moderation', 'Display widgets', 'Domain verification'],
    outcomes: [
      'Star-rated organic search listings',
      'Automated invite flow lifts review count 3-5x',
      'Response time becomes a competitive advantage',
    ],
    capabilities: [
      { name: 'Invitation API', description: 'Automated review invites post-purchase.' },
      { name: 'Reviews (read + reply)', description: 'Pull into Conversations for monitoring.' },
      { name: 'Product reviews', description: 'Per-bike reviews as schema stars on product pages.' },
    ],
    notes: 'Invitation-only partner API — apply through Trustpilot for programmatic invites.',
    docsUrl: 'https://developers.trustpilot.com/',
  },
  {
    id: 'semrush',
    label: 'DataForSEO API',
    role: 'Keyword + competitor + backlink data',
    costGBP: 60,
    costNote: 'API plan',
    costDetail: [
      { label: 'DataForSEO pay-per-call', amount: 60, note: '~£0.0006/SERP call' },
      { label: 'SEMrush Pro (alternative)', amount: 110, note: '$140/mo — overkill since we own the UI' },
    ],
    tier: 'seo',
    cluster: 'seo',
    x: 1030,
    y: 580,
    envVars: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'],
    optional: true,
    account: {
      label: 'Login',
      identifierEnvVar: 'DATAFORSEO_LOGIN',
      identifierPlaceholder: 'craig@raceborne.com',
      adminUrlTemplate: 'https://app.dataforseo.com/',
    },
    blurb:
      "External SEO data — keyword volumes, competitor SERP positions, backlink discovery. Two routes: SEMrush (paid UI we'd rarely visit) or DataForSEO API (raw data, half the price). Recommend DataForSEO.",
    manageHere: [
      'Keyword volume + difficulty in /keywords',
      'Competitor rank tracking',
      'Backlink prospecting',
      'Topic gap analysis',
    ],
    manageInService: ['Nothing — DataForSEO is API-only'],
    outcomes: [
      'Decide which blog posts to write based on real data',
      'Spot when a competitor jumps a rank we own',
      'Find 50-100 link prospects per month',
      'Save £50/mo vs SEMrush',
    ],
    capabilities: [
      { name: 'SERP API', description: 'Live + historical SERP positions.' },
      { name: 'Keywords', description: 'Volumes, difficulty, CPC per query.' },
      { name: 'Backlinks', description: 'Who links to us + competitors.' },
    ],
    notes: 'Pay only for calls you make. At our usage ~£60/mo.',
    docsUrl: 'https://docs.dataforseo.com/v3/',
  },

  // --- Social row (y=680) ---
  {
    id: 'linkedin',
    label: 'LinkedIn',
    role: 'B2B content + insights',
    costGBP: 0,
    costNote: 'free API',
    costDetail: [
      { label: 'Marketing Developer Platform', amount: 0, note: 'approval can take 2-4 weeks' },
      { label: 'Sales Navigator (optional)', amount: 60, note: 'for outbound prospecting — separate subscription' },
    ],
    tier: 'social',
    cluster: 'social',
    x: 240,
    y: 720,
    envVars: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_ORGANIZATION_URN'],
    optional: true,
    account: {
      label: 'Company',
      identifierEnvVar: 'LINKEDIN_ORGANIZATION_URN',
      identifierPlaceholder: 'urn:li:organization:1234567',
      adminUrlTemplate: 'https://www.linkedin.com/company/evari/',
    },
    blurb:
      'Post + schedule from the dashboard, read engagement, attribute traffic. Especially important for the medical/rehab vertical outreach where clinicians live on LinkedIn.',
    manageHere: ['Schedule posts from /social', 'Post performance on /traffic', 'Draft in Evari voice via AI'],
    manageInService: ['Company page setup', 'Employee advocacy', 'Sales Navigator prospecting (separate)'],
    outcomes: ['Reach UK clinicians + estate managers (core ICPs)', 'B2B content distribution', 'Thought leadership → backlinks'],
    capabilities: [
      { name: 'w_organization_social', description: 'Publish text, image, video, document posts.' },
      { name: 'r_organization_social', description: 'Read post engagement.' },
      { name: 'rw_ads', description: '(Optional) run paid campaigns from the dashboard.' },
    ],
    notes: 'Marketing Developer Platform approval is slow — apply early.',
    docsUrl: 'https://learn.microsoft.com/en-us/linkedin/marketing/',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    role: 'Feed + stories + reels',
    costGBP: 0,
    costNote: 'free API',
    costDetail: [{ label: 'Meta Graph API', amount: 0 }],
    tier: 'social',
    cluster: 'social',
    x: 480,
    y: 720,
    envVars: ['META_APP_ID', 'META_APP_SECRET', 'META_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID'],
    optional: true,
    account: {
      label: 'Handle',
      identifierStatic: '@evari.bikes',
      adminUrlTemplate: 'https://www.instagram.com/evari.bikes/',
    },
    blurb:
      'Schedule and publish feed posts, stories, reels, carousels to Evari Instagram. Read insights per post.',
    manageHere: ['Schedule from /social', 'Post performance on /traffic', 'AI-drafted captions'],
    manageInService: ['Business portfolio management', 'Story reply inbox'],
    outcomes: ['Consumer reach for premium ebike market', 'Product story visuals', 'UGC repost pipeline'],
    capabilities: [
      { name: 'instagram_content_publish', description: 'Post feed / story / reel / carousel.' },
      { name: 'instagram_manage_insights', description: 'Impressions, reach, engagement.' },
      { name: 'instagram_manage_comments', description: 'Read + reply (later).' },
    ],
    notes: 'Permissions: instagram_content_publish, instagram_manage_insights, business_management.',
    docsUrl: 'https://developers.facebook.com/docs/instagram-api',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    role: 'Short-form video',
    costGBP: 0,
    costNote: 'free API',
    costDetail: [{ label: 'Content Posting API', amount: 0, note: 'app review required' }],
    tier: 'social',
    cluster: 'social',
    x: 720,
    y: 720,
    envVars: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_ACCESS_TOKEN'],
    optional: true,
    account: {
      label: 'Handle',
      identifierStatic: '@evari.bikes',
      adminUrlTemplate: 'https://www.tiktok.com/@evari.bikes',
    },
    blurb:
      'Schedule vertical video + photo carousels to Evari TikTok. Pull post performance for the social calendar.',
    manageHere: ['Schedule from /social', 'Post performance on /traffic'],
    manageInService: ['Account verification', 'TikTok Shop setup (if commerce)'],
    outcomes: ['Reach consumer discovery layer', 'Same vertical assets as IG Reels', 'Low-cost viral upside'],
    capabilities: [
      { name: 'content.publish', description: 'Upload + publish video / photo.' },
      { name: 'business.account.read', description: 'Follower / engagement / demographics.' },
    ],
    notes: 'Two scopes required: content.publish and business.account.read. App review applies.',
    docsUrl: 'https://developers.tiktok.com/doc/content-posting-api-get-started/',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    role: 'Long-form + Shorts',
    costGBP: 0,
    costNote: 'free API',
    costDetail: [{ label: 'YouTube Data API v3', amount: 0, note: 'shared Google OAuth' }],
    tier: 'social',
    cluster: 'social',
    x: 960,
    y: 720,
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'YOUTUBE_CHANNEL_ID'],
    optional: true,
    account: {
      label: 'Channel',
      identifierEnvVar: 'YOUTUBE_CHANNEL_ID',
      identifierPlaceholder: 'UC...',
      adminUrlTemplate: 'https://studio.youtube.com/channel/{id}',
    },
    blurb:
      'Second-biggest search engine, and Google ranks videos directly in SERPs. Ride videos, rehab protocol demos, build walkthroughs, customer stories — a long-lived asset library.',
    manageHere: ['Schedule uploads from /social', 'Analytics on /traffic', 'AI-drafted titles + descriptions'],
    manageInService: ['Thumbnail design', 'End-screen + cards', 'Community posts'],
    outcomes: [
      'SEO surface area beyond text',
      'Shorts feed same discovery as TikTok',
      'Customer stories as high-converting content',
    ],
    capabilities: [
      { name: 'Upload', description: 'Publish videos with metadata + chapters.' },
      { name: 'Analytics', description: 'Views, watch time, subscriber growth.' },
      { name: 'Playlists', description: 'Organise rehab / commute / touring.' },
      { name: 'Captions', description: 'Upload transcripts for SEO + accessibility.' },
    ],
    notes: 'Same Google OAuth as GSC/GA4/Gmail/GBP.',
    docsUrl: 'https://developers.google.com/youtube/v3',
  },
];

export const WIREFRAME_FLOWS: WireframeFlow[] = [
  // Foundation
  {
    from: 'github',
    to: 'vercel',
    fromPayloads: ['Source code', 'Branch → preview deploy', 'Tag → production deploy'],
    toPayloads: ['Deploy status', 'Preview URLs', 'Build logs'],
    summary: 'Auto-deploy: every merge to main is live in 90 seconds; every PR has its own preview URL.',
  },
  {
    from: 'vercel',
    to: 'supabase',
    fromPayloads: ['Reads + writes from server actions', 'Cron batch jobs'],
    toPayloads: ['Query results', 'Realtime subscriptions', 'Auth tokens'],
    summary: 'The dashboard reads and writes here. Cron nightly-syncs Shopify, weekly-pulls SEO, etc.',
  },
  {
    from: 'vercel',
    to: 'aigateway',
    fromPayloads: ['Inference requests', 'OIDC keyless auth'],
    toPayloads: ['Streaming AI responses', 'Token usage + cost'],
    summary: 'Every AI call routes through here. OIDC auth means no API keys to leak.',
  },
  {
    from: 'supabase',
    to: 'aigateway',
    fromPayloads: ['Grounding context (leads, tasks, plays, metrics, service state)'],
    toPayloads: [],
    summary: 'AI replies cite actual numbers, not guesses. Per-service chat here is grounded in the service\'s data.',
  },
  {
    from: 'vercel',
    to: 'dashboard',
    fromPayloads: ['Serves the React app'],
    toPayloads: [],
    summary: 'Vercel deployment is what users open in their browser.',
  },
  {
    from: 'supabase',
    to: 'dashboard',
    fromPayloads: ['Live data (leads, tasks, conversations, plays)', 'Realtime row updates'],
    toPayloads: [],
    summary: 'Every page reads from Supabase via Vercel server components.',
  },

  // Commerce + messaging → Supabase
  {
    from: 'shopify',
    to: 'supabase',
    fromPayloads: [
      'Products (titles, descriptions, meta, variants, prices, stock)',
      'Orders (line items, customer, fulfilment)',
      'Customers (profile, order history, consent)',
      'Abandoned checkouts (email, cart, value)',
      'Pages + blog posts',
      'Webhooks: order/created, customer/updated, cart/abandoned',
    ],
    toPayloads: [
      'Updated product meta titles + descriptions',
      'Updated page meta (bulk fix from SEO Health)',
      'New blog post drafts',
      'Draft orders from bike builder',
      '301 redirects',
      'JSON-LD schema injection',
    ],
    summary:
      'Two-way mirror. Shopify is master for transactional data; dashboard owns SEO + content edits and pushes them back.',
  },
  {
    from: 'klaviyo',
    to: 'supabase',
    fromPayloads: [
      'Subscriber profiles + segments',
      'Campaign performance (opens, clicks, revenue)',
      'Flow performance',
      'Unsubscribe + bounce events',
    ],
    toPayloads: [
      'Add/remove from lists on lead stage change',
      'Trigger custom events',
      'Schedule campaigns from /social',
      'Push AI-drafted email copy',
    ],
    summary: 'Subscribers and the lead pipeline are the same dataset. Newsletters scheduled from the dashboard appear on the social calendar.',
  },
  {
    from: 'whatsapp',
    to: 'supabase',
    fromPayloads: ['Inbound messages (via Klaviyo or Meta)', 'Delivery status'],
    toPayloads: ['Outbound templated broadcasts', 'Opt-in capture'],
    summary: 'Routes inbound WhatsApp into Conversations alongside Gmail. Templated broadcasts sent from dashboard.',
  },
  {
    from: 'email',
    to: 'supabase',
    fromPayloads: ['Threads tagged Evari/Leads', 'New-thread events', 'Label changes'],
    toPayloads: ['Outbound replies (via Gmail send API)', 'Label apply/remove', 'Archive'],
    summary: 'Two-way. Inbound becomes structured lead data; outbound replies appear in the customer\'s inbox as a normal thread.',
  },
  {
    from: 'booking',
    to: 'supabase',
    fromPayloads: ['Booking webhook (new, rescheduled, cancelled)', 'Event type metadata'],
    toPayloads: ['Availability sync', 'Cancel/reschedule from dashboard'],
    summary: 'Every booking creates a lead + fires Klaviyo event. Rehab funnel accelerator.',
  },

  // SEO → Supabase
  {
    from: 'gsc',
    to: 'supabase',
    fromPayloads: ['Query impressions + clicks + CTR + position', 'Sitemap errors', 'Index coverage'],
    toPayloads: [],
    summary: 'Free + always wire it. Feeds /keywords, /pages, /seo. Only covers OUR site — no competitor data.',
  },
  {
    from: 'ga4',
    to: 'supabase',
    fromPayloads: ['Sessions + users + conversions + sources', 'Realtime "who\'s on site"'],
    toPayloads: [],
    summary: 'Powers /traffic + briefing sparkline. Attributes leads to first-touch source.',
  },
  {
    from: 'pagespeed',
    to: 'supabase',
    fromPayloads: ['LCP + CLS + INP per URL'],
    toPayloads: [],
    summary: 'Flags slow pages on /seo + /pages. Free, should always be on.',
  },
  {
    from: 'gbp',
    to: 'supabase',
    fromPayloads: ['Reviews (read)', 'Insights (views, searches, calls, directions)'],
    toPayloads: ['Weekly posts', 'Review replies (AI-drafted)', 'Photo uploads'],
    summary: 'Local SEO + "near me" for medical/rehab discovery. Reviews become Conversations.',
  },
  {
    from: 'trustpilot',
    to: 'supabase',
    fromPayloads: ['New reviews', 'Review scores'],
    toPayloads: ['Review invites on invoice_paid event', 'Review replies (AI-drafted)'],
    summary: 'Star ratings in Google search results boost CTR 20-35%. Automated invite flow lifts count 3-5x.',
  },
  {
    from: 'semrush',
    to: 'supabase',
    fromPayloads: ['Keyword volumes + difficulty', 'Competitor SERP positions', 'Backlink discovery', 'Topic gap analysis'],
    toPayloads: [],
    summary: 'Read-only intelligence feed. Powers /keywords gap analysis + /pages backlink prospects.',
  },

  // Social → Supabase
  {
    from: 'linkedin',
    to: 'supabase',
    fromPayloads: ['Post engagement (impressions, clicks, reactions)', 'Company page stats'],
    toPayloads: ['Scheduled posts', 'AI-drafted captions'],
    summary: 'Reach clinicians + estate managers (core ICPs). Thought leadership → backlinks.',
  },
  {
    from: 'instagram',
    to: 'supabase',
    fromPayloads: ['Post insights (impressions, reach, engagement)', 'Story views'],
    toPayloads: ['Scheduled posts / stories / reels', 'AI-drafted captions'],
    summary: 'Consumer reach for premium ebike market. Same assets as TikTok (vertical video).',
  },
  {
    from: 'tiktok',
    to: 'supabase',
    fromPayloads: ['Post performance (views, likes, comments)', 'Follower stats'],
    toPayloads: ['Scheduled video + photo posts', 'AI-drafted captions'],
    summary: 'Short-form video discovery layer. Same vertical assets as IG Reels.',
  },
  {
    from: 'youtube',
    to: 'supabase',
    fromPayloads: ['Analytics (views, watch time, subs)', 'Comment moderation'],
    toPayloads: ['Scheduled uploads', 'AI-drafted titles + descriptions', 'Playlist organisation'],
    summary: 'Second-biggest search engine + Google ranks videos in SERPs. Customer stories + rehab protocol demos.',
  },
];

export function totalMonthlyGBP(nodes: WireframeNode[]): number {
  return nodes.reduce((sum, n) => sum + n.costGBP, 0);
}

export const TIER_META: Record<WireframeTier, { label: string; accent: string }> = {
  app: { label: 'App', accent: 'bg-evari-gold/30' },
  foundation: { label: 'Core', accent: 'bg-evari-gold/20' },
  commerce: { label: 'Commerce', accent: 'bg-evari-gold/10' },
  marketing: { label: 'Marketing', accent: 'bg-evari-gold/10' },
  seo: { label: 'SEO', accent: 'bg-evari-gold/10' },
  social: { label: 'Social', accent: 'bg-evari-gold/10' },
  email: { label: 'Email', accent: 'bg-evari-gold/10' },
  leads: { label: 'Leads', accent: 'bg-evari-gold/10' },
};

export type WireframeEdge = WireframeFlow;
export const WIREFRAME_EDGES = WIREFRAME_FLOWS;
