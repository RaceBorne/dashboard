import { createSupabaseAdmin } from '@/lib/supabase/admin';

export interface PSISnapshot {
  url: string;
  strategy: 'mobile' | 'desktop';
  snapshotDate: string;
  performanceScore: number; // 0-1
  lcpSec: number;
  clsScore: number;
  inpMs: number;
  fcpSec: number;
  ttfbSec: number;
  siSec: number;
  tbtMs: number;
  fetchedAt: string;
}

export interface PSITarget {
  url: string;
  label: string | null;
  priority: number;
}

export interface PerformanceOverview {
  targets: PSITarget[];
  latest: PSISnapshot[]; // one row per (url, strategy) — the most recent snapshot
  history: PSISnapshot[]; // up to 30 days of snapshots across all targets
  hasData: boolean;
  connected: boolean;
}

function rowToSnapshot(row: Record<string, unknown>): PSISnapshot {
  return {
    url: String(row.url),
    strategy: row.strategy === 'desktop' ? 'desktop' : 'mobile',
    snapshotDate: String(row.snapshot_date).slice(0, 10),
    performanceScore: Number(row.performance_score) || 0,
    lcpSec: Number(row.lcp_sec) || 0,
    clsScore: Number(row.cls_score) || 0,
    inpMs: Number(row.inp_ms) || 0,
    fcpSec: Number(row.fcp_sec) || 0,
    ttfbSec: Number(row.ttfb_sec) || 0,
    siSec: Number(row.si_sec) || 0,
    tbtMs: Number(row.tbt_ms) || 0,
    fetchedAt: String(row.fetched_at),
  };
}

export async function getPerformanceOverview(): Promise<PerformanceOverview> {
  const supa = createSupabaseAdmin();
  const connected = Boolean(process.env.PAGESPEED_API_KEY);
  if (!supa) {
    return { targets: [], latest: [], history: [], hasData: false, connected };
  }

  const [targetsRes, historyRes] = await Promise.all([
    supa
      .from('dashboard_psi_targets')
      .select('url, label, priority')
      .order('priority', { ascending: true }),
    supa
      .from('dashboard_psi_snapshots')
      .select(
        'url, strategy, snapshot_date, performance_score, lcp_sec, cls_score, inp_ms, fcp_sec, ttfb_sec, si_sec, tbt_ms, fetched_at',
      )
      .gte('snapshot_date', daysAgoISO(30))
      .order('snapshot_date', { ascending: false }),
  ]);

  const targets: PSITarget[] =
    targetsRes.data?.map((r) => ({
      url: r.url as string,
      label: (r.label as string | null) ?? null,
      priority: r.priority as number,
    })) ?? [];

  const history: PSISnapshot[] = (historyRes.data ?? []).map(rowToSnapshot);

  // Latest: pick the most-recent snapshot per (url, strategy). History is
  // already sorted descending, so the first occurrence wins.
  const latestMap = new Map<string, PSISnapshot>();
  for (const snap of history) {
    const key = `${snap.url}|${snap.strategy}`;
    if (!latestMap.has(key)) latestMap.set(key, snap);
  }
  const latest = Array.from(latestMap.values());

  return {
    targets,
    latest,
    history,
    hasData: latest.length > 0,
    connected,
  };
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
