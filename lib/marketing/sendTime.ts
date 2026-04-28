/**
 * Send-time optimisation helpers.
 *
 * Reads dashboard_mkt_events for type='campaign_opened' over the last
 * 90 days and computes which hour-of-day (recipient local time
 * approximated as UTC for now) sees the most opens. Returns
 * { peakHour, openCountAtPeak, totalOpens, hourly[24] } so the UI can
 * show both the recommendation and the histogram.
 *
 * Returns null when there's not enough data (need >= 5 opens).
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export interface SendTimeRecommendation {
  peakHour: number;
  openCountAtPeak: number;
  totalOpens: number;
  hourly: number[];
}

const LOOKBACK_DAYS = 90;
const MIN_OPENS = 5;

export async function getSendTimeRecommendation(): Promise<SendTimeRecommendation | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
  const { data, error } = await sb
    .from('dashboard_mkt_events')
    .select('created_at')
    .eq('type', 'campaign_opened')
    .gte('created_at', since)
    .limit(5000);
  if (error) {
    console.error('[mkt.sendTime]', error);
    return null;
  }
  const rows = (data ?? []) as Array<{ created_at: string }>;
  if (rows.length < MIN_OPENS) return null;
  const hourly = new Array<number>(24).fill(0);
  for (const r of rows) {
    const h = new Date(r.created_at).getUTCHours();
    hourly[h]++;
  }
  let peakHour = 0;
  for (let i = 1; i < 24; i++) if (hourly[i] > hourly[peakHour]) peakHour = i;
  return {
    peakHour,
    openCountAtPeak: hourly[peakHour],
    totalOpens: rows.length,
    hourly,
  };
}
