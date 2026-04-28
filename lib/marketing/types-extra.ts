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
}
