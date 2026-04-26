/**
 * Shared types for the internal marketing system. Mirror of the
 * dashboard_mkt_* Supabase tables but in TypeScript camelCase. Repo
 * helpers convert snake_case rows → these types via rowTo* mappers.
 */

export type ContactStatus = 'active' | 'unsubscribed' | 'suppressed';

export interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  company: string | null;
  status: ContactStatus;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactWithMeta extends Contact {
  groups: Group[];
  tags: Tag[];
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: string;
}

export interface MarketingEvent {
  id: string;
  contactId: string;
  type: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ─── Segmentation rule types ─────────────────────────────────────
//
// rules JSON on dashboard_mkt_segments uses this discriminated union.
// New filter kinds = new variant + a new branch in the engine. Keep
// the existing four stable so saved segments don't break.

export type SegmentCombinator = 'and' | 'or';

export type SegmentRule =
  | {
      type: 'group';
      op: 'in';
      groupIds: string[];
    }
  | {
      type: 'tag';
      op: 'in';
      tagIds: string[];
    }
  | {
      type: 'status';
      op: 'eq';
      status: ContactStatus;
    }
  | {
      type: 'event';
      op: 'occurred_in_last_days';
      eventType: string;
      days: number;
    };

export interface SegmentRuleSet {
  combinator: SegmentCombinator;
  rules: SegmentRule[];
}

export interface Segment {
  id: string;
  name: string;
  rules: SegmentRuleSet;
  createdAt: string;
  updatedAt: string;
}

export interface SegmentEvaluation {
  contactIds: string[];
  count: number;
}

// ─── Campaigns ───────────────────────────────────────────────────

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'failed';

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  content: string;
  status: CampaignStatus;
  segmentId: string | null;
  groupId: string | null;
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RecipientStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'suppressed';

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  contactId: string;
  status: RecipientStatus;
  messageId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface SendResult {
  ok: boolean;
  /** Number of recipients enqueued + processed. */
  attempted: number;
  /** Number of recipients the sender said it accepted. */
  sent: number;
  /** Number suppressed (in dashboard_mkt_suppressions or status≠active). */
  suppressed: number;
  /** Number that failed at the sender layer. */
  failed: number;
  error?: string;
}

// ─── Flows ───────────────────────────────────────────────────────

export type FlowTriggerType = 'event';

export interface Flow {
  id: string;
  name: string;
  triggerType: FlowTriggerType;
  /** For triggerType='event': the event.type value to listen for. */
  triggerValue: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type FlowStepConfig =
  | { type: 'delay'; hours?: number; days?: number; minutes?: number }
  | { type: 'email'; subject: string; html: string }
  | { type: 'condition'; eventType?: string; withinDays?: number };

export interface FlowStep {
  id: string;
  flowId: string;
  stepType: 'delay' | 'email' | 'condition';
  config: FlowStepConfig;
  order: number;
  createdAt: string;
}

export type FlowRunStatus =
  | 'pending'
  | 'waiting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface FlowRun {
  id: string;
  flowId: string;
  contactId: string;
  currentStepOrder: number;
  status: FlowRunStatus;
  wakeAt: string | null;
  triggerEventId: string | null;
  triggerEventType: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
