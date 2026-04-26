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
  /** Ad-hoc recipient list (emails) when audience is a custom selection. */
  recipientEmails: string[] | null;
  /** Phase 14 visual design — when set, supersedes the legacy `content` HTML at send time. */
  emailDesign: EmailDesign | null;
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

// ─── Domain auth ─────────────────────────────────────────────────

export interface MktDomain {
  id: string;
  domainName: string;
  verified: boolean;
  spfRecord: string | null;
  dkimSelector: string | null;
  dkimRecord: string | null;
  dmarcRecord: string | null;
  postmarkId: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DomainCheckStatus = 'verified' | 'mismatch' | 'missing' | 'error' | 'pending';

export interface DomainRecordCheck {
  /** 'spf' | 'dkim' | 'dmarc' */
  kind: 'spf' | 'dkim' | 'dmarc';
  /** DNS host that should hold the record. */
  host: string;
  /** Expected TXT value. */
  expected: string;
  /** TXT records actually present at host. */
  found: string[];
  status: DomainCheckStatus;
  /** Optional human-readable note (mismatch reason, lookup error). */
  note?: string;
}

export interface DomainStatus {
  domain: MktDomain;
  checks: DomainRecordCheck[];
  /** True only when every check is 'verified'. */
  fullyVerified: boolean;
}

// ─── Suppression ─────────────────────────────────────────────────

export interface Suppression {
  id: string;
  email: string;
  reason: string | null;
  source: string | null;
  campaignId: string | null;
  contactId: string | null;
  addedAt: string;
}

// ─── Brand kit ───────────────────────────────────────────────────

export interface BrandColors {
  primary: string;
  accent: string;
  text: string;
  bg: string;
  link: string;
  buttonBg: string;
  buttonText: string;
  muted: string;
}

export interface BrandFonts {
  heading: string;
  body: string;
}


export interface CustomFont {
  name: string;
  weight: number;
  style: 'normal' | 'italic';
  url: string;
  filename: string;
  format: 'woff2' | 'woff' | 'truetype' | 'opentype';
  uploadedAt: string;
}

export interface MarketingBrand {
  id: 'singleton';
  companyName: string | null;
  companyAddress: string | null;
  replyToEmail: string | null;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  colors: BrandColors;
  fonts: BrandFonts;
  /** Resolved signature — what actually goes into outbound email. If
   *  signatureOverride is null this is the rendered DEFAULT_SIGNATURE_HTML
   *  using the first outreach sender's metadata; otherwise it equals
   *  signatureOverride. */
  customFonts: CustomFont[];
  footerDesign: FooterDesign | null;
  signatureDesign: SignatureDesign | null;
  signatureHtml: string | null;
  /** Raw value of dashboard_mkt_brand.signature_html. Null = use the
   *  rendered default. UI binds the editor to this. */
  signatureOverride: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Asset library ───────────────────────────────────────────────

export type AssetKind = 'image' | 'gif' | 'logo' | 'video_thumb' | 'other';

export interface MktAsset {
  id: string;
  kind: AssetKind;
  filename: string;
  storageKey: string;
  url: string;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  tags: string[];
  altText: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Footer designer (block-based) ───────────────────────────────
//
// The footer is a vertical list of blocks. Each block is one of the
// types below; each carries its own props. The renderer walks the
// list in order. Reordering / adding / removing happens in the UI
// via @dnd-kit and the live preview + sender both call the same
// renderFooter() against this shape.

export type FooterAlignment = 'left' | 'center' | 'right';

export interface FooterSocial {
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  website?: string;
}

/**
 * Common per-block knobs. paddingTopPx / paddingBottomPx replace the
 * need for explicit spacer blocks between every item — each block can
 * push itself away from its neighbours via the two sliders in the
 * editor. Optional + default 0 for back-compat with rows saved before
 * Phase 13.6.
 */
type FooterBlockBase = {
  id: string;
  paddingTopPx?: number;
  paddingBottomPx?: number;
};

export type FooterBlock =
  | (FooterBlockBase & {
      type: 'logo';
      alignment: FooterAlignment;
      maxWidthPx: number;     // controls the rendered width (height auto-scales)
      /** Override URL — defaults to brand.logoLightUrl when blank. */
      srcOverride?: string | null;
    })
  | (FooterBlockBase & {
      type: 'text';
      alignment: FooterAlignment;
      html: string;           // HTML allowed (e.g. confidentiality notice with <strong>)
      fontFamily: string;     // family name; falls back to brand.fonts.body in the cascade
      fontSizePx: number;
      color: string;          // hex
      lineHeight: number;     // unitless multiplier
    })
  | (FooterBlockBase & {
      type: 'spacer';
      heightPx: number;
    })
  | (FooterBlockBase & {
      type: 'divider';
      color: string;
      thicknessPx: number;
      marginYPx: number;
    })
  | (FooterBlockBase & {
      type: 'address';
      alignment: FooterAlignment;  // brand.companyName + brand.companyAddress
      color: string;
    })
  | (FooterBlockBase & {
      type: 'social';
      alignment: FooterAlignment;
      color: string;
      social: FooterSocial;
    })
  | (FooterBlockBase & {
      type: 'unsubscribe';
      alignment: FooterAlignment;
      label: string;            // 'Unsubscribe from these emails' by default
      color: string;
    });

export interface FooterDesign {
  background: string;
  paddingPx: number;
  borderTop: boolean;
  borderColor: string;
  blocks: FooterBlock[];
}

function nid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Sensible starting footer — branded logo, signature, address, divider, unsubscribe. */
export const DEFAULT_FOOTER_DESIGN: FooterDesign = {
  background: '#ffffff',
  paddingPx: 32,
  borderTop: true,
  borderColor: '#e5e5e5',
  blocks: [
    { id: nid(), type: 'logo',      alignment: 'center', maxWidthPx: 140, paddingBottomPx: 16 },
    { id: nid(), type: 'address',   alignment: 'center', color: '#666666', paddingBottomPx: 16 },
    { id: nid(), type: 'divider',   color: '#e5e5e5', thicknessPx: 1, marginYPx: 16 },
    { id: nid(), type: 'unsubscribe', alignment: 'center', label: 'Unsubscribe from these emails', color: '#666666' },
  ],
};



// ─── Signature designer (block-based subset) ─────────────────────
//
// Signatures are a smaller block list — text / logo / spacer / line.
// Address / social / unsubscribe make sense in the FOOTER, not in
// a signature, so the signature builder restricts itself.

export type SignatureBlock = Extract<FooterBlock,
  { type: 'text' | 'logo' | 'spacer' | 'divider' }
>;

export interface SignatureDesign {
  background: string;
  paddingPx: number;
  blocks: SignatureBlock[];
}

function _sid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Default signature block list — reproduces the existing
 * DEFAULT_SIGNATURE_HTML rendering byte-for-byte (Evari wordmark, name
 * + role, contact, divider, confidentiality notice). New brand kits
 * land on this so the live preview already looks like the current
 * email signature; the user then edits per-block.
 */
export const DEFAULT_SIGNATURE_DESIGN: SignatureDesign = {
  background: 'transparent',
  paddingPx: 0,
  blocks: [
    { id: _sid(), type: 'spacer', heightPx: 32 },
    { id: _sid(), type: 'text', alignment: 'left',
      html: 'Craig McDonald',
      fontFamily: '', fontSizePx: 13, color: '#111111', lineHeight: 1.4 },
    { id: _sid(), type: 'text', alignment: 'left',
      html: 'CEO & Head of Design',
      fontFamily: '', fontSizePx: 10, color: '#6b6b6b', lineHeight: 1.4 },
    { id: _sid(), type: 'spacer', heightPx: 24 },
    { id: _sid(), type: 'logo', alignment: 'left',
      maxWidthPx: 120 },
    { id: _sid(), type: 'spacer', heightPx: 24 },
    { id: _sid(), type: 'text', alignment: 'left',
      html: 'UK (M) +44 (0)7720 288398',
      fontFamily: '', fontSizePx: 13, color: '#111111', lineHeight: 1.4 },
    { id: _sid(), type: 'text', alignment: 'left',
      html: '<a href="https://evari.cc" style="color:#111111;text-decoration:none;">evari.cc</a>',
      fontFamily: '', fontSizePx: 13, color: '#111111', lineHeight: 1.4 },
    { id: _sid(), type: 'spacer', heightPx: 16 },
    { id: _sid(), type: 'divider', color: '#cccccc', thicknessPx: 1, marginYPx: 0 },
    { id: _sid(), type: 'spacer', heightPx: 16 },
    { id: _sid(), type: 'text', alignment: 'left',
      html: '<strong>Confidentiality Notice:</strong>',
      fontFamily: '', fontSizePx: 10, color: '#555555', lineHeight: 1.55 },
    { id: _sid(), type: 'spacer', heightPx: 6 },
    { id: _sid(), type: 'text', alignment: 'left',
      html: 'This message is confidential and intended solely for the individual or organisation to whom it is addressed. It may contain privileged or sensitive information. If you are not the intended recipient, please do not copy, distribute, or act upon its contents.',
      fontFamily: '', fontSizePx: 10, color: '#666666', lineHeight: 1.55 },
    { id: _sid(), type: 'spacer', heightPx: 8 },
    { id: _sid(), type: 'text', alignment: 'left',
      html: 'If you have received this message in error, kindly notify the sender at the email address provided above.',
      fontFamily: '', fontSizePx: 10, color: '#666666', lineHeight: 1.55 },
  ],
};

// ─── Phase 14: Email design (block-based newsletter builder) ──────

export type EmailAlignment = 'left' | 'center' | 'right';

type EmailBlockBase = {
  id: string;
  paddingTopPx?: number;
  paddingBottomPx?: number;
};

export type EmailBlock =
  | (EmailBlockBase & {
      type: 'heading';
      level: 1 | 2 | 3;
      html: string;
      alignment: EmailAlignment;
      color: string;
      fontFamily: string;
      /** Optional override for size; when omitted falls back to a per-level default. */
      fontSizePx?: number;
      /** Letter-spacing in em (e.g. -0.01 = tight, 0.05 = loose). */
      letterSpacingEm?: number;
      fontWeight?: number;
    })
  | (EmailBlockBase & {
      type: 'text';
      html: string;
      alignment: EmailAlignment;
      fontSizePx: number;
      lineHeight: number;
      color: string;
      fontFamily: string;
      /** Letter-spacing in em (e.g. -0.01 = tight, 0.05 = loose). */
      letterSpacingEm?: number;
      fontWeight?: number;
    })
  | (EmailBlockBase & {
      type: 'image';
      src: string;
      alt: string;
      maxWidthPx: number;
      alignment: EmailAlignment;
      linkUrl?: string;
    })
  | (EmailBlockBase & {
      type: 'button';
      label: string;
      url: string;
      alignment: EmailAlignment;
      backgroundColor: string;
      textColor: string;
      borderRadiusPx: number;
      paddingXPx: number;
      paddingYPx: number;
    })
  | (EmailBlockBase & {
      type: 'divider';
      color: string;
      thicknessPx: number;
      marginYPx: number;
    })
  | (EmailBlockBase & {
      type: 'spacer';
      heightPx: number;
    })
  | (EmailBlockBase & {
      type: 'html';
      html: string;
    })
  // ─── Phase 14C: extended block library ───────────────────────
  | (EmailBlockBase & {
      type: 'split';
      // Image + text side-by-side at 50/50.
      imageSrc: string;
      imageAlt: string;
      imagePosition: 'left' | 'right';
      html: string;
      fontSizePx: number;
      lineHeight: number;
      color: string;
      buttonLabel?: string;
      buttonUrl?: string;
    })
  | (EmailBlockBase & {
      type: 'headerBar';
      logoUrl: string;       // empty → brand light logo
      tagline: string;
      linkUrl: string;
      backgroundColor: string;
      textColor: string;
    })
  | (EmailBlockBase & {
      type: 'card';          // 'Drop shadow' tile in the toolbar — wraps content in a shadowed card.
      html: string;
      backgroundColor: string;
      borderRadiusPx: number;
      shadow: 'sm' | 'md' | 'lg';
      paddingPx: number;
    })
  | (EmailBlockBase & {
      type: 'social';
      // Klaviyo-style row of icon links. Empty URLs are skipped at render time.
      items: { platform: 'instagram' | 'twitter' | 'linkedin' | 'facebook' | 'tiktok' | 'youtube' | 'website'; url: string }[];
      alignment: EmailAlignment;
      iconColor: string;
    })
  | (EmailBlockBase & {
      type: 'coupon';
      code: string;
      title: string;
      subtitle: string;
      expiry: string;        // ISO date or free text
      backgroundColor: string;
      textColor: string;
      borderColor: string;
    })
  | (EmailBlockBase & {
      type: 'table';
      // Simple key/value table (label + value rows) — most common shape in marketing emails.
      rows: { label: string; value: string }[];
      headerLabel: string;
      headerValue: string;
      borderColor: string;
      stripeColor: string;   // for zebra rows
    })
  | (EmailBlockBase & {
      type: 'review';
      quote: string;
      author: string;
      role: string;          // 'CEO at Acme' etc
      rating: number;        // 0..5
      backgroundColor: string;
    })
  | (EmailBlockBase & {
      type: 'video';
      thumbnailSrc: string;
      videoUrl: string;
      alt: string;
      maxWidthPx: number;
      alignment: EmailAlignment;
    })
  | (EmailBlockBase & {
      type: 'product';
      imageSrc: string;
      imageAlt: string;
      title: string;
      price: string;          // free text — '£500' / 'From £450'
      description: string;
      buttonLabel: string;
      buttonUrl: string;
      backgroundColor: string;
    })
  | (EmailBlockBase & {
      type: 'section';
      // Children rendered ON TOP of the section background. Empty array =
      // empty section showing just the bg + a 'Drop blocks here' state.
      blocks: EmailBlock[];
      // Optional fallback HTML for legacy section rows that haven't been
      // migrated to the children array yet.
      html?: string;
      backgroundColor: string;
      backgroundImage?: string;       // URL or asset library id
      backgroundSize?: 'cover' | 'contain' | 'auto' | 'original' | 'fit' | 'fill' | 'tile';
      backgroundPosition?: string;    // 'center', 'top', 'bottom left', etc
      paddingPx: number;
      borderRadiusPx: number;
      /** Default text colour applied to descendants (so light text on a
       *  dark photo background just works without per-child overrides). */
      contentColor?: string;
      /** Forces a tall hero feel when set. */
      minHeightPx?: number;
    });

export interface EmailDesign {
  /** Outer canvas background — what the wrapper table renders behind the content. */
  background: string;
  /** Width of the content column in px (typical: 600). */
  widthPx: number;
  /** Outer padding around the content column. */
  paddingPx: number;
  blocks: EmailBlock[];
}

function _eid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const DEFAULT_EMAIL_DESIGN: EmailDesign = {
  background: '#f4f4f5',
  widthPx: 600,
  paddingPx: 24,
  blocks: [
    { id: _eid(), type: 'heading', level: 1, html: 'Hello {{firstName}}', alignment: 'left', color: '#111111', fontFamily: '', paddingBottomPx: 12 },
    { id: _eid(), type: 'text',    html: 'Write your message here. The visual designer renders email-safe HTML at send time — same renderer at preview + send.', alignment: 'left', fontSizePx: 16, lineHeight: 1.55, color: '#333333', fontFamily: '', paddingBottomPx: 16 },
    { id: _eid(), type: 'button',  label: 'Read more', url: 'https://evari.cc', alignment: 'left', backgroundColor: '#1a1a1a', textColor: '#ffffff', borderRadiusPx: 4, paddingXPx: 24, paddingYPx: 12, paddingBottomPx: 24 },
    { id: _eid(), type: 'divider', color: '#e5e5e5', thicknessPx: 1, marginYPx: 16 },
  ],
};
