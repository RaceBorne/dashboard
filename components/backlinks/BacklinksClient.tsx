'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Link2,
  Globe,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  BacklinksOverview,
  BacklinksSummary,
  BacklinkRow,
  ReferringDomainRow,
} from '@/lib/backlinks/repository';
import { EVARI_TARGETS } from '@/lib/backlinks/repository';

type TabKey = 'domains' | 'backlinks' | 'anchors';

export function BacklinksClient({ overview }: { overview: BacklinksOverview }) {
  const primaryTarget = EVARI_TARGETS[0];
  const legacyTarget = EVARI_TARGETS[1];

  // Default selected target is the new Evari domain, falling back to the first
  // summary we have data for.
  const defaultTarget =
    overview.summaries.find((s) => s.target === primaryTarget)?.target ??
    overview.summaries[0]?.target ??
    primaryTarget;

  const [selectedTarget, setSelectedTarget] = useState<string>(defaultTarget);
  const [tab, setTab] = useState<TabKey>('domains');
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const selectedSummary = useMemo(
    () => overview.summaries.find((s) => s.target === selectedTarget) ?? null,
    [overview.summaries, selectedTarget],
  );

  const migration = useMemo(() => {
    const newDomain = overview.summaries.find((s) => s.target === primaryTarget);
    const legacy = overview.summaries.find((s) => s.target === legacyTarget);
    if (!newDomain || !legacy) return null;
    return { newDomain, legacy };
  }, [overview.summaries, primaryTarget, legacyTarget]);

  async function runNow() {
    setRunning(true);
    setRunMsg(null);
    setRunError(null);
    try {
      const res = await fetch('/api/integrations/dataforseo/backlinks/ingest', {
        method: 'POST',
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rowsWritten?: number;
        costUsd?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setRunError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setRunMsg(
        `Wrote ${json.rowsWritten ?? 0} rows · cost $${(json.costUsd ?? 0).toFixed(4)}. Reload to see fresh data.`,
      );
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <SyncStatus overview={overview} />
        <div className="flex items-center gap-3">
          {runMsg && <span className="text-xs text-evari-success">{runMsg}</span>}
          {runError && <span className="text-xs text-evari-danger">{runError}</span>}
          <Button
            size="sm"
            variant="primary"
            onClick={runNow}
            disabled={running || !overview.connected}
            title={
              overview.connected
                ? 'Re-run DataForSEO backlinks ingest for all Evari targets'
                : 'DataForSEO not connected — set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD'
            }
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', running && 'animate-spin')} />
            {running ? 'Running…' : 'Run now'}
          </Button>
        </div>
      </div>

      {!overview.hasData ? (
        <EmptyState connected={overview.connected} />
      ) : (
        <>
          {/* Migration recovery — only shown if we have data for both new + legacy */}
          {migration && <MigrationCard newDomain={migration.newDomain} legacy={migration.legacy} />}

          {/* Target picker + summary tiles */}
          <div className="flex gap-1.5 flex-wrap">
            {overview.summaries.map((s) => (
              <TargetButton
                key={s.target}
                active={selectedTarget === s.target}
                onClick={() => setSelectedTarget(s.target)}
                target={s.target}
                isPrimary={s.target === primaryTarget}
              />
            ))}
          </div>

          {selectedSummary && <SummaryTiles summary={selectedSummary} />}

          {/* Tabs */}
          <div className="flex gap-1.5 border-b border-evari-surfaceSoft">
            <TabButton active={tab === 'domains'} onClick={() => setTab('domains')}>
              Top referring domains
            </TabButton>
            <TabButton active={tab === 'backlinks'} onClick={() => setTab('backlinks')}>
              Recent backlinks
            </TabButton>
            <TabButton active={tab === 'anchors'} onClick={() => setTab('anchors')}>
              Anchor text
            </TabButton>
          </div>

          {tab === 'domains' && (
            <DomainsTable
              rows={overview.topDomainsByTarget[selectedTarget] ?? []}
              target={selectedTarget}
            />
          )}
          {tab === 'backlinks' && (
            <BacklinksTable
              rows={overview.recentBacklinksByTarget[selectedTarget] ?? []}
              target={selectedTarget}
            />
          )}
          {tab === 'anchors' && selectedSummary && (
            <AnchorList summary={selectedSummary} />
          )}
        </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function SyncStatus({ overview }: { overview: BacklinksOverview }) {
  if (!overview.connected) {
    return (
      <div className="text-xs text-evari-dim">
        <Badge variant="warning" className="mr-2">DataForSEO</Badge>
        Not connected — set <code className="text-evari-gold">DATAFORSEO_LOGIN</code> and{' '}
        <code className="text-evari-gold">DATAFORSEO_PASSWORD</code>.
      </div>
    );
  }
  if (!overview.lastSync) {
    return (
      <div className="text-xs text-evari-dim">
        <Badge variant="muted" className="mr-2">Backlinks</Badge>
        Connected · awaiting first ingest
      </div>
    );
  }
  const last = overview.lastSync;
  const relative = relativeTime(last.ranAt);
  const cost = last.costUsd != null ? `$${last.costUsd.toFixed(4)}` : '—';
  return (
    <div className="text-xs text-evari-dim">
      <Badge variant={last.ok ? 'success' : 'critical'} className="mr-2">
        {last.ok ? 'Synced' : 'Failed'}
      </Badge>
      Last ingest {relative} · {last.rowsWritten} rows · {cost}
      {last.error && <span className="text-evari-danger ml-2">{last.error}</span>}
    </div>
  );
}

function MigrationCard({
  newDomain,
  legacy,
}: {
  newDomain: BacklinksSummary;
  legacy: BacklinksSummary;
}) {
  const bDelta = newDomain.backlinks - legacy.backlinks;
  const dDelta = newDomain.referringDomains - legacy.referringDomains;
  const rDelta = newDomain.rank - legacy.rank;
  const recoveryPct =
    legacy.referringDomains > 0
      ? Math.round((newDomain.referringDomains / legacy.referringDomains) * 100)
      : null;

  return (
    <Card className="border border-evari-accent/30 bg-gradient-to-br from-evari-surface to-evari-surface/60">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-evari-accent" />
            Migration recovery
          </CardTitle>
          <p className="text-xs text-evari-dim mt-1">
            Authority moving from the legacy domain to the new primary. Once 301s are in place
            the gap on the right should shrink.
          </p>
        </div>
        {recoveryPct != null && (
          <div className="text-right">
            <div className="text-3xl font-semibold tabular-nums text-evari-text">
              {recoveryPct}%
            </div>
            <div className="text-[10px] uppercase tracking-wider text-evari-dim">
              domains recovered
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MigrationStat
            label="Backlinks"
            legacy={legacy.backlinks}
            newV={newDomain.backlinks}
            delta={bDelta}
          />
          <MigrationStat
            label="Referring domains"
            legacy={legacy.referringDomains}
            newV={newDomain.referringDomains}
            delta={dDelta}
          />
          <MigrationStat
            label="DFS rank"
            legacy={legacy.rank}
            newV={newDomain.rank}
            delta={rDelta}
          />
          <MigrationStat
            label="Referring IPs"
            legacy={legacy.referringIps}
            newV={newDomain.referringIps}
            delta={newDomain.referringIps - legacy.referringIps}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MigrationStat({
  label,
  legacy,
  newV,
  delta,
}: {
  label: string;
  legacy: number;
  newV: number;
  delta: number;
}) {
  const good = delta >= 0;
  return (
    <div className="stat-tile flex-col items-start gap-1 py-3">
      <div className="text-[10px] uppercase tracking-wider text-evari-dim">{label}</div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <div className="flex items-baseline gap-1">
          <span className="text-xs text-evari-dim">evari.cc</span>
          <span className="text-xl font-semibold tabular-nums text-evari-text">
            {formatNum(newV)}
          </span>
        </div>
        <div className="flex items-baseline gap-1 text-evari-dimmer">
          <span className="text-xs">legacy</span>
          <span className="text-sm tabular-nums">{formatNum(legacy)}</span>
        </div>
      </div>
      <div
        className={cn(
          'text-[11px] font-medium tabular-nums',
          good ? 'text-evari-success' : 'text-evari-danger',
        )}
      >
        {good ? '+' : ''}
        {formatNum(delta)} gap {good ? 'closed' : 'remaining'}
      </div>
    </div>
  );
}

function TargetButton({
  active,
  onClick,
  target,
  isPrimary,
}: {
  active: boolean;
  onClick: () => void;
  target: string;
  isPrimary: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors',
        active
          ? 'bg-evari-accent text-white'
          : 'bg-evari-surface text-evari-text hover:bg-evari-surfaceSoft',
      )}
    >
      <Globe className="h-3.5 w-3.5" />
      <span className="font-medium">{target}</span>
      {isPrimary && (
        <span
          className={cn(
            'text-[9px] uppercase tracking-wider rounded px-1 py-0.5',
            active ? 'bg-white/20 text-white' : 'bg-evari-accent/15 text-evari-accent',
          )}
        >
          Primary
        </span>
      )}
    </button>
  );
}

function SummaryTiles({ summary }: { summary: BacklinksSummary }) {
  const nofollowPct =
    summary.backlinks > 0
      ? Math.round((summary.backlinksNofollow / summary.backlinks) * 100)
      : 0;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <SimpleTile
        label="Total backlinks"
        value={formatNum(summary.backlinks)}
        helper={`${formatNum(summary.backlinksNofollow)} nofollow (${nofollowPct}%)`}
      />
      <SimpleTile
        label="Referring domains"
        value={formatNum(summary.referringDomains)}
        helper={`${formatNum(summary.referringMainDomains)} root · ${formatNum(summary.referringIps)} IPs`}
      />
      <SimpleTile
        label="DFS rank"
        value={formatNum(summary.rank)}
        helper="0–1000 scale · higher is stronger"
      />
      <SimpleTile
        label="Top anchor"
        value={summary.anchorTop10[0]?.anchor ?? '—'}
        helper={
          summary.anchorTop10[0]
            ? `${formatNum(summary.anchorTop10[0].backlinks)} links`
            : 'No anchors yet'
        }
        valueSmall
      />
    </div>
  );
}

function SimpleTile({
  label,
  value,
  helper,
  valueSmall,
}: {
  label: string;
  value: string;
  helper?: string;
  valueSmall?: boolean;
}) {
  return (
    <div className="stat-tile flex-col items-start gap-1 py-4">
      <div className="text-[10px] uppercase tracking-wider text-evari-dim">{label}</div>
      <div
        className={cn(
          'font-semibold tabular-nums text-evari-text truncate w-full',
          valueSmall ? 'text-base' : 'text-2xl',
        )}
        title={value}
      >
        {value}
      </div>
      {helper && <div className="text-[11px] text-evari-dim leading-tight">{helper}</div>}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
        active
          ? 'border-evari-accent text-evari-text'
          : 'border-transparent text-evari-dim hover:text-evari-text',
      )}
    >
      {children}
    </button>
  );
}

function DomainsTable({ rows, target }: { rows: ReferringDomainRow[]; target: string }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-evari-dim">
          No referring domains for {target} yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-evari-dim border-b border-evari-surfaceSoft">
              <th className="text-left font-medium px-5 py-3">Domain</th>
              <th className="text-right font-medium px-3 py-3">Backlinks</th>
              <th className="text-right font-medium px-3 py-3">Rank</th>
              <th className="text-left font-medium px-3 py-3">First seen</th>
              <th className="text-right font-medium px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const live = !d.lastSeen;
              return (
                <tr
                  key={`${d.target}|${d.domainFrom}`}
                  className="border-b border-evari-surfaceSoft/50 last:border-0 hover:bg-evari-surfaceSoft/40"
                >
                  <td className="px-5 py-3">
                    <a
                      href={`https://${d.domainFrom}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-evari-text hover:text-evari-accent inline-flex items-center gap-1.5"
                    >
                      <span className="truncate max-w-[320px]">{d.domainFrom}</span>
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </a>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNum(d.backlinks)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {d.rank != null ? formatNum(d.rank) : '—'}
                  </td>
                  <td className="px-3 py-3 text-evari-dim">{formatDate(d.firstSeen)}</td>
                  <td className="px-5 py-3 text-right">
                    {live ? (
                      <Badge variant="success">Live</Badge>
                    ) : (
                      <Badge variant="muted">Lost</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function BacklinksTable({ rows, target }: { rows: BacklinkRow[]; target: string }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-evari-dim">
          No backlinks for {target} yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-evari-dim border-b border-evari-surfaceSoft">
              <th className="text-left font-medium px-5 py-3">From</th>
              <th className="text-left font-medium px-3 py-3">Anchor</th>
              <th className="text-left font-medium px-3 py-3">Landing</th>
              <th className="text-right font-medium px-3 py-3">DR</th>
              <th className="text-left font-medium px-3 py-3">Flags</th>
              <th className="text-right font-medium px-5 py-3">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr
                key={b.id}
                className="border-b border-evari-surfaceSoft/50 last:border-0 hover:bg-evari-surfaceSoft/40"
              >
                <td className="px-5 py-3">
                  <a
                    href={b.urlFrom}
                    target="_blank"
                    rel="noreferrer"
                    className="text-evari-text hover:text-evari-accent inline-flex items-center gap-1.5"
                    title={b.urlFrom}
                  >
                    <span className="truncate max-w-[240px]">{b.domainFrom}</span>
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </td>
                <td className="px-3 py-3 text-evari-dim truncate max-w-[200px]" title={b.anchor ?? ''}>
                  {b.anchor ? <span className="text-evari-text">{b.anchor}</span> : <em>no text</em>}
                </td>
                <td className="px-3 py-3 text-evari-dim truncate max-w-[240px]" title={b.urlTo}>
                  {prettyPath(b.urlTo)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-evari-dim">
                  {b.domainFromRank != null ? formatNum(b.domainFromRank) : '—'}
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-1">
                    {b.isNofollow && (
                      <Badge variant="muted" className="text-[10px]">
                        nofollow
                      </Badge>
                    )}
                    {b.isBroken && (
                      <Badge variant="critical" className="text-[10px]">
                        <ShieldAlert className="h-2.5 w-2.5 mr-0.5" />
                        broken
                      </Badge>
                    )}
                    {!b.isNofollow && !b.isBroken && (
                      <Badge variant="success" className="text-[10px]">
                        dofollow
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-right text-evari-dim">{formatDate(b.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AnchorList({ summary }: { summary: BacklinksSummary }) {
  if (summary.anchorTop10.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-evari-dim">
          No anchor text data for {summary.target} yet.
        </CardContent>
      </Card>
    );
  }
  const max = Math.max(...summary.anchorTop10.map((a) => a.backlinks), 1);
  return (
    <Card>
      <CardContent className="p-5 space-y-2">
        {summary.anchorTop10.map((a, i) => {
          const pct = (a.backlinks / max) * 100;
          return (
            <div key={`${a.anchor}|${i}`} className="space-y-1">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm text-evari-text truncate" title={a.anchor}>
                  {a.anchor || <em className="text-evari-dim">(empty anchor)</em>}
                </span>
                <span className="text-xs tabular-nums text-evari-dim flex-shrink-0">
                  {formatNum(a.backlinks)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-evari-surfaceSoft overflow-hidden">
                <div
                  className="h-full bg-evari-accent"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function EmptyState({ connected }: { connected: boolean }) {
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <Link2 className="h-10 w-10 mx-auto mb-4 text-evari-dimmer" />
        <div className="text-sm text-evari-text font-medium mb-1">
          {connected ? 'No backlink data yet' : 'DataForSEO not connected'}
        </div>
        <div className="text-xs text-evari-dim max-w-md mx-auto">
          {connected ? (
            <>
              Click <strong>Run now</strong> to pull the first ingest from DataForSEO. Covers
              every target in <code>EVARI_TARGETS</code>.
            </>
          ) : (
            <>
              Set <code className="text-evari-gold">DATAFORSEO_LOGIN</code> and{' '}
              <code className="text-evari-gold">DATAFORSEO_PASSWORD</code> in <code>.env.local</code>,
              then restart the dev server.
            </>
          )}
        </div>
        {!connected && (
          <div className="mt-4 text-xs text-evari-dim">
            <Link href="/wireframe" className="text-evari-accent hover:underline">
              See wireframe →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function formatNum(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString('en-GB');
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

function prettyPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ?? '') || '/';
  } catch {
    return url;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

