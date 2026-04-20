/**
 * SEO Health history — append-only log of scans + apply-batches.
 *
 * Every scan completion and every successful fix-batch writes one row to
 * `dashboard_seo_health_history`. The `/shopify/seo-health` page reads
 * these rows to chart score over time and show a fix-event timeline.
 *
 * Writes are fire-and-forget (`void` the promise) — history is a
 * nice-to-have; a logging failure must never break a scan or a fix.
 */
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { ScanResult } from './types';

export type SeoHealthEvent = 'scan' | 'fix';

export interface SeoHistoryRow {
  id: number;
  recorded_at: string;
  event: SeoHealthEvent;
  score: number;
  findings_total: number;
  findings_by_check: Record<string, number>;
  scanned_entities: { products: number; pages: number; articles: number } | null;
  delta: number | null;
}

/**
 * Count findings by check id, e.g. {title-missing: 8, meta-length: 2}.
 * Used to power the stacked-area / per-check breakdowns in the UI.
 */
function tallyByCheck(scan: ScanResult): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of scan.findings) {
    out[f.check.id] = (out[f.check.id] ?? 0) + 1;
  }
  return out;
}

async function insertHistoryRow(row: {
  event: SeoHealthEvent;
  score: number;
  findings_total: number;
  findings_by_check: Record<string, number>;
  scanned_entities?: ScanResult['scanned'] | null;
  delta?: number | null;
}): Promise<void> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.from('dashboard_seo_health_history').insert({
    event: row.event,
    score: row.score,
    findings_total: row.findings_total,
    findings_by_check: row.findings_by_check,
    scanned_entities: row.scanned_entities ?? null,
    delta: row.delta ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[seo/history] insert failed:', error.message);
  }
}

/**
 * Record a scan-complete event. Delta is computed as the difference
 * vs. the most recent prior row (null if this is the first row).
 */
export async function recordScanEvent(scan: ScanResult): Promise<void> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return;
  const { data: prev } = await supabase
    .from('dashboard_seo_health_history')
    .select('findings_total')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const delta =
    prev && typeof prev.findings_total === 'number'
      ? scan.findings.length - prev.findings_total
      : null;
  await insertHistoryRow({
    event: 'scan',
    score: scan.score,
    findings_total: scan.findings.length,
    findings_by_check: tallyByCheck(scan),
    scanned_entities: scan.scanned,
    delta,
  });
}

/**
 * Record a fix-batch event — called once per apply POST, AFTER the
 * cache mutation, so `scan` already reflects the removals.
 * `fixesApplied` is the count of findings that landed in this batch
 * (positive integer). Delta is stored as the negative of that so the
 * chart draws fixes as downward steps.
 */
export async function recordFixEvent(
  scan: ScanResult,
  fixesApplied: number,
): Promise<void> {
  if (fixesApplied <= 0) return;
  await insertHistoryRow({
    event: 'fix',
    score: scan.score,
    findings_total: scan.findings.length,
    findings_by_check: tallyByCheck(scan),
    scanned_entities: null,
    delta: -fixesApplied,
  });
}

/**
 * Read the most recent `limit` events, oldest-first, for chart rendering.
 */
export async function getHistory(limit = 180): Promise<SeoHistoryRow[]> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('dashboard_seo_health_history')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  // Flip to chronological for chart consumption.
  return (data as SeoHistoryRow[]).slice().reverse();
}
