/**
 * Shared types for the SEO Health scanner + fix engine.
 *
 * The scanner produces a flat list of `ScanFinding` records — one per
 * (entity, check) pair that's broken. The fix engine maps each
 * finding's `check.id` onto a strategy: safe-auto, review or manual.
 */

export type CheckSeverity = 'A' | 'B' | 'C';
export type EntityType = 'product' | 'page' | 'article';
export type FixMode = 'safe-auto' | 'review' | 'manual';

export interface ScanEntityRef {
  type: EntityType;
  id: string;
  handle: string;
  title: string;
  /** Storefront URL — used for breadcrumb links + the SERP preview. */
  url: string;
}

export interface CheckMeta {
  id: string;
  title: string;
  description: string;
  severity: CheckSeverity;
  fix: FixMode;
}

export interface ScanFinding {
  /** Stable id: `${entityType}:${entityId}:${checkId}` */
  id: string;
  entity: ScanEntityRef;
  check: CheckMeta;
  /** Human-readable description of what's wrong on this entity. */
  detail: string;
  /**
   * Optional payload to feed the fix engine (e.g. existing title length,
   * old handle for redirect, image id for alt-text). Shape is
   * check-specific; consumers should narrow when they handle the fix.
   */
  context?: Record<string, unknown>;
}

export interface ScanCounts {
  products: number;
  pages: number;
  articles: number;
}

export interface ScanResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  scanned: ScanCounts;
  /** 0–100 weighted health score derived from finding severity. */
  score: number;
  findings: ScanFinding[];
  /**
   * Non-fatal warnings from the scan — e.g. one entity type failed but
   * others succeeded. Surface these in the UI so the user understands
   * the scan was partial and knows what's missing.
   */
  warnings?: string[];
}

export interface UndoEntry {
  /** uuid-ish, stable across the request lifecycle. */
  id: string;
  appliedAt: string;
  finding: ScanFinding;
  /** Snapshot of fields BEFORE the fix was applied — used to roll back. */
  before: Record<string, unknown>;
  /** Fields AFTER the fix — for display in the timeline. */
  after: Record<string, unknown>;
  /** Free-form summary of what changed. */
  summary: string;
}
