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
  | 'organic_search';

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
    campaign?: string;
  };
  activity: LeadActivity[];
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

export type SocialPlatform = 'linkedin' | 'instagram' | 'tiktok';
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
  | 'database';

export interface IntegrationStatus {
  key: IntegrationKey;
  label: string;
  category: 'ai' | 'commerce' | 'seo' | 'leads' | 'social' | 'storage';
  connected: boolean;
  envVarsRequired: string[];
  envVarsMissing: string[];
  docsUrl: string;
  notes?: string;
}
