// Shared domain types for the Evari Dashboard.
// Designed so the mock data layer and the eventual real data layer share a
// single contract — pages don't need to change when integrations are wired up.

export type LeadSource =
  | 'shopify_order'
  | 'shopify_abandoned'
  | 'contact_form'
  | 'instagram_dm'
  | 'linkedin_message'
  | 'phone'
  | 'in_person'
  | 'referral'
  | 'organic_search'
  | 'paid_search'
  | 'paid_social'
  | 'dealer_referral'
  | 'medical_partner'
  | 'event'
  | 'press'
  | 'existing_customer';

/** Coarse bucket for filtering — groups detailed sources into channels. */
export type LeadSourceCategory =
  | 'organic'    // SEO / direct
  | 'paid'       // Google or Meta ads
  | 'social'     // Organic social / DMs
  | 'referral'   // Word of mouth / existing customers
  | 'dealer'     // Bike shop referrals
  | 'medical'    // Health practitioners, clinics
  | 'event'      // Trade shows, demo days, rides
  | 'press'      // Journalist / magazine enquiries
  | 'in_person'  // Walk-in / showroom
  | 'commerce';  // Shopify order or abandoned cart

export type LeadStage =
  | 'new'
  | 'contacted'
  | 'discovery'
  | 'configuring'
  | 'quoted'
  | 'won'
  | 'lost'
  | 'cold';

export type LeadIntent = 'commute' | 'touring' | 'leisure' | 'cargo' | 'unknown';

export interface Lead {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  location?: string;        // e.g. "Lewes, UK"
  source: LeadSource;
  sourceCategory?: LeadSourceCategory;
  /** Free-text detail on where this lead came from — e.g. "Cycle King Dorchester" or "Dr Sarah Mitchell, Aurora Physio". */
  sourceDetail?: string;
  stage: LeadStage;
  intent: LeadIntent;
  productInterest?: string; // e.g. "Evari Tour"
  estimatedValue?: number;  // GBP
  firstSeenAt: string;      // ISO
  lastTouchAt: string;      // ISO
  nextActionAt?: string;    // ISO
  ownerName?: string;
  tags: string[];
  notes?: string;
  threadId?: string;        // links to a conversation thread
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string; // standard utm_campaign — unrelated to our Plays concept
  };
  activity: LeadActivity[];
}

/** Default mapping from detailed source → coarse category. */
export function sourceCategoryFor(source: LeadSource): LeadSourceCategory {
  switch (source) {
    case 'shopify_order':
    case 'shopify_abandoned':
      return 'commerce';
    case 'contact_form':
    case 'organic_search':
      return 'organic';
    case 'paid_search':
    case 'paid_social':
      return 'paid';
    case 'instagram_dm':
    case 'linkedin_message':
      return 'social';
    case 'phone':
      return 'organic';
    case 'in_person':
      return 'in_person';
    case 'referral':
    case 'existing_customer':
      return 'referral';
    case 'dealer_referral':
      return 'dealer';
    case 'medical_partner':
      return 'medical';
    case 'event':
      return 'event';
    case 'press':
      return 'press';
  }
}

export interface LeadActivity {
  id: string;
  type:
    | 'lead_created'
    | 'email_sent'
    | 'email_received'
    | 'call'
    | 'meeting'
    | 'note'
    | 'stage_change'
    | 'shopify_view'
    | 'shopify_add_to_cart'
    | 'shopify_checkout_started'
    | 'shopify_order_placed';
  at: string;               // ISO
  summary: string;
  meta?: Record<string, unknown>;
}

// -- Conversations / Email Viewer --------------------------------------------

export type ThreadParticipantRole = 'lead' | 'evari' | 'cc';

export interface ThreadParticipant {
  name: string;
  email: string;
  role: ThreadParticipantRole;
}

export interface ThreadMessage {
  id: string;
  from: ThreadParticipant;
  to: ThreadParticipant[];
  cc?: ThreadParticipant[];
  sentAt: string;
  bodyMarkdown: string;
  isFromEvari: boolean;
}

export interface Thread {
  id: string;
  subject: string;
  leadId?: string;
  status: 'open' | 'awaiting_us' | 'awaiting_lead' | 'closed';
  labels: string[];
  participants: ThreadParticipant[];
  lastMessageAt: string;
  unread: boolean;
  messages: ThreadMessage[];
}

// -- Gmail ingest (separate from the mocked Conversations viewer) ------------
//
// Lightweight thread summary written nightly by /api/integrations/google/gmail/ingest.
// The full Conversations viewer uses `Thread` above — `GmailThreadSummary` is
// just enough context for the briefing + strategy chats to reference real
// customer conversations.

export type GmailCategory = 'support' | 'outbound' | 'klaviyo-reply' | 'other';

export interface GmailThreadSummary {
  threadId: string;
  subject: string;
  snippet: string;
  /** Best-guess category, inferred from labels + participant heuristics. */
  category: GmailCategory;
  /** Email addresses of everyone on the thread (de-duped, lowercased). */
  participants: string[];
  /** ISO timestamp of the most recent message. */
  lastMessageAt: string;
  /** Raw Gmail label IDs for the thread's most recent message. */
  labels: string[];
  /** Gmail permalink so Craig can open the thread in Gmail directly. */
  gmailUrl: string;
}

// -- Traffic / Analytics -----------------------------------------------------

export interface TrafficDay {
  date: string;        // YYYY-MM-DD
  sessions: number;
  users: number;
  bounceRate: number;  // 0..1
  avgDurationSec: number;
  conversions: number; // checkouts started / contact form submissions
}

export interface TrafficSourceRow {
  source: string;
  medium: string;
  sessions: number;
  conversions: number;
  conversionRate: number;
}

export interface LandingPageRow {
  path: string;
  sessions: number;
  bounceRate: number;
  conversions: number;
  avgPositionGSC?: number;
  impressionsGSC?: number;
  clicksGSC?: number;
  ctrGSC?: number;
}

// -- SEO Health --------------------------------------------------------------

export type AuditSeverity = 'critical' | 'warning' | 'info' | 'pass';

export interface AuditFinding {
  id: string;
  title: string;
  description: string;
  severity: AuditSeverity;
  category:
    | 'crawlability'
    | 'on_page'
    | 'performance'
    | 'metadata'
    | 'structured_data'
    | 'content'
    | 'links'
    | 'images';
  affectedUrls: string[];
  detectedAt: string;
  autoFixAvailable: boolean;
  recommendation: string;
}

// -- Pages -------------------------------------------------------------------

export interface PageRecord {
  id: string;
  path: string;
  title: string;
  metaTitle?: string;
  metaDescription?: string;
  type: 'home' | 'product' | 'collection' | 'blog' | 'page';
  shopifyId?: string;
  lastEditedAt: string;
  wordCount: number;
  organicSessions30d: number;
  conversions30d: number;
  primaryKeyword?: string;
  issues: AuditSeverity[];
}

// -- Keywords ----------------------------------------------------------------

export interface KeywordRow {
  id: string;
  query: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  positionDelta7d: number;
  url?: string;
  intent: 'transactional' | 'informational' | 'navigational' | 'commercial';
  priority: 'high' | 'medium' | 'low';
}

// -- Social ------------------------------------------------------------------

export type SocialPlatform =
  | 'linkedin'
  | 'instagram'
  | 'tiktok'
  | 'shopify_blog'
  | 'newsletter';
export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

export interface SocialPost {
  id: string;
  platform: SocialPlatform;
  status: PostStatus;
  scheduledFor?: string;
  publishedAt?: string;
  caption: string;
  mediaUrls: string[];
  hashtags: string[];
  link?: string;
  metrics?: {
    impressions: number;
    engagements: number;
    clicks: number;
    saves?: number;
    shares?: number;
  };
}

// -- Briefing ----------------------------------------------------------------

export interface BriefingMetric {
  label: string;
  value: string;
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
  helper?: string;
}

export interface BriefingAnomaly {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  link?: { label: string; href: string };
}

export interface BriefingPayload {
  generatedAt: string;
  metrics: BriefingMetric[];
  anomalies: BriefingAnomaly[];
  contextForAI: string; // structured input fed to Claude when generating prose
}

// -- Plays (strategic workbooks) -----------------------------------------

export type PlayStage =
  | 'idea'
  | 'researching'
  | 'building'
  | 'ready'
  | 'live'
  | 'retired';

export interface PlayChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: string; // ISO
  /** Flagged by the user as worth keeping / acting on. */
  pinned?: boolean;
}

export interface PlayResearchNote {
  id: string;
  title: string;
  body: string;
  sourceUrl?: string;
  at: string;
  tags?: string[];
}

export interface PlayTarget {
  id: string;
  name: string;
  org?: string;
  role?: string;
  email?: string;
  phone?: string;
  channel?: 'email' | 'linkedin' | 'phone' | 'whatsapp' | 'in_person';
  /** 'new' → first outreach pending, 'contacted' → sent, 'replied' → reply received, etc. */
  status: 'new' | 'contacted' | 'replied' | 'meeting' | 'won' | 'declined';
  notes?: string;
}

export interface PlayMessageTemplate {
  id: string;
  channel: 'email' | 'linkedin' | 'whatsapp' | 'sms';
  subject?: string;
  body: string;
  sequenceStep?: number; // for multi-step sequences
}

export interface PlayActivityEvent {
  id: string;
  at: string;
  summary: string;
  type: 'created' | 'stage_change' | 'note' | 'chat' | 'target_added' | 'message_sent' | 'task_linked';
}

export interface Play {
  id: string;
  title: string;
  brief: string;                  // one-paragraph "why"
  stage: PlayStage;
  createdAt: string;
  updatedAt: string;
  ownerName?: string;
  tags: string[];
  pinned?: boolean;

  research: PlayResearchNote[];
  targets: PlayTarget[];
  messaging: PlayMessageTemplate[];
  chat: PlayChatMessage[];
  activity: PlayActivityEvent[];

  /** Task ids on the main to-do list that belong to this play. */
  taskIds?: string[];

  /** When live: Klaviyo play/flow IDs, Shopify page handles, etc. */
  links?: { label: string; url: string }[];

  /** Metrics, once live. */
  metrics?: {
    sent?: number;
    opened?: number;
    replied?: number;
    meetings?: number;
    won?: number;
    revenue?: number;
  };

  /**
   * Strategy authoring output — produced in the "idea" stage, typically via
   * the AI chat panel. Drives the scrape + outreach engine once the play
   * goes live.
   */
  strategy?: PlayStrategy;

  /** Scrape brief the outreach agent follows. */
  scrapeBrief?: ScrapeBrief;

  /** Which configured OutreachSender this Play sends from. */
  senderId?: string;

  /** Follow-up cadence config for this Play. */
  cadence?: OutreachCadence;

  /** Email template used for the first-touch outreach (with {{slots}}). */
  emailTemplate?: OutreachTemplate;
}

// -- Play strategy + scrape brief --------------------------------------------

export interface PlayStrategy {
  /** One-sentence "why now" thesis for this play. */
  hypothesis: string;
  /** Market/sector label, e.g. "UK private knee-surgery clinics". */
  sector: string;
  /** The job title we actually email, not the famous one. */
  targetPersona: string;
  /** 1-3 message angles to test with prospects. */
  messagingAngles: string[];
  /** Volume target — e.g. 20 new prospects/week. */
  weeklyTarget?: number;
  /** How we know the play worked (reply rate, meetings, etc.). */
  successMetrics: string[];
  /** Why we would *not* contact someone who otherwise matches. */
  disqualifiers?: string[];
}

export interface ScrapeBrief {
  /**
   * Seed URLs the agent starts from — directories, listing pages, CQC
   * registers, Google Maps searches, etc.
   */
  seedSources: Array<{
    label: string;
    url: string;
    /** Optional hint to the agent about what's on this page. */
    notes?: string;
  }>;
  /** Which enrichment fields the agent must capture per record. */
  harvestFields: Array<
    | 'org'
    | 'website'
    | 'address'
    | 'decisionMakerName'
    | 'decisionMakerRole'
    | 'decisionMakerEmail'
    | 'linkedin'
    | 'evidenceSnippet'
  >;
  /** Free-text rules, e.g. "Only clinics doing >50 knee ops/year". */
  inclusionRules?: string[];
  /** Free-text rules, e.g. "Skip NHS trusts". */
  exclusionRules?: string[];
  /** Last time the agent ran for this play. */
  lastRunAt?: string;
}

export interface OutreachCadence {
  /** Number of touches in the sequence. */
  totalTouches: number;
  /** Day offset from first send for each touch (first is always 0). */
  daysBetween: number[];
  /** Whether each send needs human approval. */
  approvalPolicy: 'every_send' | 'first_only' | 'spot_check';
}

export interface OutreachTemplate {
  subject: string;
  body: string;
  /**
   * The slot keys the template uses, e.g. ['firstName','org','evidence'].
   * Drives what the AI personaliser fills in per-prospect.
   */
  slots: string[];
  updatedAt: string;
}

// -- Outreach senders (Gmail mailboxes we send from) -------------------------

export interface OutreachSender {
  id: string;
  /** Full email address, e.g. craig.mcdonald@evari.cc. */
  email: string;
  /** Friendly "From" name, e.g. "Craig McDonald". */
  displayName: string;
  /** Job title to render below the name in the signature. */
  role?: string;
  /**
   * Signature HTML — may reference {{logoUrl}}, {{displayName}},
   * {{role}}, {{email}}. Rendered at send time.
   */
  signatureHtml: string;
  /** Optional company logo (data URL or external URL) used in signatures. */
  logoUrl?: string;
  /** When false, the sender is hidden from new Play pickers. */
  isActive: boolean;
  /** The Play picker uses this when no explicit senderId on the play. */
  isDefault?: boolean;
  /**
   * Whether a Google OAuth refresh token has been saved for this sender.
   * The token itself lives in env / secure storage, never in this payload.
   */
  oauthConnected: boolean;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
  lastSentAt?: string;
}

// -- Suppression list (compliance: unsubscribes, bounces, DNC) ---------------

export interface SuppressionEntry {
  id: string;
  email: string;
  reason: 'unsubscribed' | 'hard_bounce' | 'complaint' | 'manual_dnc';
  at: string;
  /** Scope: if playId is set, suppression only applies to that play. */
  playId?: string;
  notes?: string;
}

// -- Prospects (testing layer between Plays and Leads) -------------------

export type ProspectStatus =
  | 'pending'            // not yet contacted
  | 'sent'               // outreach sent, awaiting response
  | 'bounced'            // delivery failed
  | 'no_reply'           // 14+ days, no response
  | 'replied_positive'
  | 'replied_neutral'
  | 'replied_negative'
  | 'qualified'          // ready to promote to Lead
  | 'archived';          // dropped from pipeline

export interface ProspectSignal {
  emailValid?: boolean;
  opened?: boolean;
  clicked?: boolean;
  replied?: boolean;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface ProspectOutreach {
  id: string;
  at: string;               // ISO
  channel: 'email' | 'linkedin' | 'phone' | 'whatsapp';
  subject?: string;
  body?: string;
  status: 'sent' | 'bounced' | 'opened' | 'replied';
  replyExcerpt?: string;
}

export interface Prospect {
  id: string;
  name: string;
  org?: string;
  role?: string;
  email?: string;
  phone?: string;
  channel: 'email' | 'linkedin' | 'phone' | 'whatsapp';
  status: ProspectStatus;
  playId?: string;    // play this prospect came from
  sourceDetail?: string;  // inherited from play / target
  createdAt: string;
  lastTouchAt?: string;
  qualityScore?: number;   // 0-100 — derived from signals
  signals?: ProspectSignal;
  outreach: ProspectOutreach[];
  notes?: string;
}

// -- Tasks (the Evari to-do list) --------------------------------------------

export type TaskCategory =
  | 'seo'
  | 'shopify'
  | 'lead-gen'
  | 'social'
  | 'content'
  | 'medical-rehab'
  | 'conversations'
  | 'commerce'
  | 'infra'
  | 'ai-automation'
  | 'general';

export type TaskStatus =
  | 'proposed'     // came out of a discussion, not yet scheduled
  | 'planned'      // has a date, not started
  | 'in-progress'
  | 'done'
  | 'blocked';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskSource = 'manual' | 'discussion' | 'auto';

export interface Task {
  id: string;
  title: string;
  description?: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;        // YYYY-MM-DD
  createdAt: string;       // ISO
  updatedAt: string;       // ISO
  source: TaskSource;
  wishlistRef?: string;    // e.g. "11.C" — links back to WISHLIST.md section
  notes?: string;
  /** User-defined list membership, separate from the fixed categories. */
  listId?: string;
}

export interface CustomList {
  id: string;
  name: string;
}

// -- Users + permissions -----------------------------------------------------

export type UserRole = 'super_admin' | 'member';

/** Broad access groups — mirror the sidebar groupings so tick-boxes are one per group. */
export type PermissionScope =
  | 'all'        // full access — auto-granted for super admins
  | 'today'      // Briefing + To-do
  | 'pipeline'   // Plays, Prospects, Leads, Conversations
  | 'web'        // Traffic, SEO Health, Pages, Keywords
  | 'broadcast'  // Social & blogs
  | 'system';    // Connections, Settings, Users

export type UserStatus = 'active' | 'pending' | 'suspended';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  /** For members only — what groups they can see. Super admins implicitly have all. */
  scopes: PermissionScope[];
  status: UserStatus;
  invitedAt: string;
  lastSeenAt?: string;
  /** Avatar seed (initials derived from fullName if absent). */
  avatarColor?: string;
}

// -- Integration status (Settings page) --------------------------------------

export type IntegrationKey =
  | 'ai_gateway'
  | 'shopify'
  | 'gsc'
  | 'ga4'
  | 'gmail'
  | 'pagespeed'
  | 'linkedin'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'klaviyo'
  | 'whatsapp'
  | 'google_business_profile'
  | 'booking'
  | 'trustpilot'
  | 'vercel'
  | 'github'
  | 'database';

export interface IntegrationCapability {
  /** Scope / API slice name (e.g. "read_products", "Admin Orders API") */
  name: string;
  /** One-line description of what it unlocks in the dashboard. */
  description: string;
}

/**
 * Category mirrors the wireframe diagram's `cluster` ids exactly, so the
 * list view on /wireframe and the boxes on the diagram always group by
 * the same taxonomy. Add a new cluster to `CLUSTERS` in lib/wireframe.ts
 * and it will automatically be a valid category here.
 */
export type IntegrationCategory = 'core' | 'outreach' | 'seo' | 'social';

export interface IntegrationStatus {
  /** Wireframe node id — single source of truth for both the diagram and list. */
  key: string;
  label: string;
  category: IntegrationCategory;
  connected: boolean;
  envVarsRequired: string[];
  envVarsMissing: string[];
  docsUrl: string;
  notes?: string;
  /** Longer synopsis of what this connection makes possible. */
  synopsis?: string;
  /** Individual scopes / sub-APIs that come with this connection. */
  capabilities?: IntegrationCapability[];
}
