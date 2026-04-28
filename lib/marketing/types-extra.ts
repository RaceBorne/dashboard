/**
 * Augmented client-facing types — props that are convenient to share
 * across components but don't belong in the canonical types.ts (which
 * mirrors the DB schema).
 */

import type { Group } from './types';

export interface GroupWithCounts extends Group {
  memberCount: number;
  approvedCount: number;
  pendingCount: number;
  /** How many approved-or-pending members are on the suppression list. */
  suppressedCount: number;
  /** approvedCount minus the suppressed-among-approved subset.
   *  This is the actual 'will receive a send' number. */
  sendableCount: number;
}
