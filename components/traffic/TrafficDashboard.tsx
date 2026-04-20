'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  Users,
  UserPlus,
  MousePointerClick,
  BarChart3,
  Globe2,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  TrafficSnapshot,
  TrafficKpiTile,
  TrafficDay,
  TrafficCountryRow,
  TrafficCityRow,
  TrafficChannelRow,
  TrafficPageRow,
  TrafficSourceRow,
  TrafficLanguageRow,
  TrafficEventRow,
} from '@/lib/traffic/repository';

// -----------------------------------------------------------------------------
// Traffic dashboard — the graphic-heavy recreation of what Craig sees on GA4.
//
// Layout (top to bottom):
//   1. KPI strip (active users, new users, sessions, events) with 12-month
//      sparklines and 28d-vs-previous-28d % delta. This is the hero.
//   2. Big 12-month area chart (switchable metric) — our "sessions over time".
//   3. World panel — countries ranked list with flag emojis + horizontal bars,
//      plus a donut of the top 5. Substitutes for GA4's literal map.
//   4. Channels — donut of sessions by default channel group + table.
//   5. Pages & screens — horizontal bar of views by page title + detail table.
//   6. Cities + sources + languages + events — 4-up grid of smaller widgets.
//
// All widgets gracefully show an "awaiting data" state if their array is empty.
// -----------------------------------------------------------------------------

const CHART_PALETTE = [
  '#c69749', // evari gold
  '#d97757', // accent (raceborne orange)
  '#7ba8d9', // cool blue
  '#94b56f', // sage
  '#b77dc4', // lilac
  '#e0b44a', // mustard
  '#6fb3b3', // teal
  '#d48a8a', // rose
];

type TrendKey = 'sessions' | 'users' | 'newUsers' | 'events' | 'conversions';

const TREND_OPTIONS: Array<{ key: TrendKey; label: string }> = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'users', label: 'Active users' },
  { key: 'newUsers', label: 'New users' },
  { key: 'events', label: 'Events' },
  { key: 'conversions', label: 'Key events' },
];

interface Props {
  snapshot: TrafficSnapshot;
}

export function TrafficDashboard({ snapshot }: Props) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trendKey, setTrendKey] = useState<TrendKey>('sessions');

  async function runSync() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/google/ga4/ingest', {
        method: 'POST',
      });
      const body = await res.json().catch(() => ({ ok: false, error: 'Bad JSON' }));
      if (!res.ok || body.ok === false) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      startTransition(() => {
        // Re-fetch the page data by reloading — getTrafficSnapshot is server-only.
        window.location.reload();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot.connected) {
    return (
      <div className="p-6 max-w-[1400px]">
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-evari-warn mx-auto" />
            <div className="text-lg font-medium text-evari-text">GA4 not connected</div>
            <div className="text-sm text-evari-dim max-w-md mx-auto">
              Set <code className="text-evari-gold">GA4_PROPERTY_ID</code> and the
              shared Google OAuth credentials to start pulling analytics.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!snapshot.hasData) {
    return (
      <div className="p-6 max-w-[1400px]">
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-evari-warn mx-auto" />
            <div className="text-lg font-medium text-evari-text">Workspace ready — awaiting first sync</div>
            <div className="text-sm text-evari-dim max-w-md mx-auto">
              Run the GA4 ingest to pull 365 days of sessions plus every breakdown
              (channels, cities, languages, events, pages, countries).
            </div>
            <Button variant="primary" onClick={runSync} disabled={busy}>
              <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
              {busy ? 'Syncing…' : 'Sync now'}
            </Button>
            {error ? (
              <div className="text-xs text-evari-danger max-w-md mx-auto pt-2">{error}</div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] space-y-5">
      {/* Header row — sync state + refresh */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
            GA4 · {snapshot.windowStart} → {snapshot.windowEnd}
          </div>
          <div className="text-xs text-evari-dim mt-0.5">
            Last synced{' '}
            {snapshot.lastSyncedAt ? (
              <span className="text-evari-text">{relativeTime(snapshot.lastSyncedAt)}</span>
            ) : (
              <span className="text-evari-warn">never</span>
            )}
            {' · '}
            Compared against the previous 28 days
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={runSync} disabled={busy || pending}>
            <RefreshCw className={cn('h-3.5 w-3.5', (busy || pending) && 'animate-spin')} />
            {busy ? 'Syncing…' : 'Refresh GA4'}
          </Button>
        </div>
      </div>

      {error ? (
        <Card>
          <CardContent className="p-3 text-xs text-evari-danger bg-evari-danger/10">
            Sync failed: {error}
          </CardContent>
        </Card>
      ) : null}

      {/* 1. KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTileCard tile={snapshot.kpi.activeUsers} icon={<Users className="h-4 w-4" />} color={CHART_PALETTE[0]} />
        <KpiTileCard tile={snapshot.kpi.newUsers} icon={<UserPlus className="h-4 w-4" />} color={CHART_PALETTE[2]} />
        <KpiTileCard tile={snapshot.kpi.sessions} icon={<MousePointerClick className="h-4 w-4" />} color={CHART_PALETTE[1]} />
        <KpiTileCard tile={snapshot.kpi.events} icon={<BarChart3 className="h-4 w-4" />} color={CHART_PALETTE[3]} />
      </div>

      {/* 2. 12-month trend */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-evari-text">12-month trend</div>
              <div className="text-xs text-evari-dim">
                Rolling 365d · switch metric to compare shapes
              </div>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {TREND_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setTrendKey(opt.key)}
                  className={cn(
                    'text-[10px] uppercase tracking-[0.1em] px-2.5 py-1 rounded-md transition-colors font-medium',
                    trendKey === opt.key
                      ? 'bg-evari-gold text-evari-goldInk'
                      : 'bg-evari-surfaceSoft text-evari-dim hover:text-evari-text hover:bg-evari-mute',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <TrendArea trend={snapshot.trend365} metric={trendKey} />
        </CardContent>
      </Card>

      {/* 3. World + country */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-5">
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium text-evari-text flex items-center gap-1.5">
                  <Globe2 className="h-4 w-4 text-evari-accent" />
                  Users by country
                </div>
                <div className="text-xs text-evari-dim">Top 12 · last 28 days</div>
              </div>
              <Badge variant="muted">
                {snapshot.countries.length} countries
              </Badge>
            </div>
            <CountryBars rows={snapshot.countries.slice(0, 12)} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <div className="text-sm font-medium text-evari-text">Share of sessions</div>
              <div className="text-xs text-evari-dim">Top 5 countries + rest</div>
            </div>
            <CountryDonut rows={snapshot.countries} />
          </CardContent>
        </Card>
      </div>

      {/* 4. Channels */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-medium text-evari-text">Sessions by default channel group</div>
              <div className="text-xs text-evari-dim">Where visits originated · last 28 days</div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-center">
            <ChannelDonut rows={snapshot.channels} />
            <ChannelTable rows={snapshot.channels} />
          </div>
        </CardContent>
      </Card>

      {/* 5. Pages & screens */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-medium text-evari-text">Views by page title</div>
              <div className="text-xs text-evari-dim">Top 10 · last 28 days</div>
            </div>
            <Badge variant="muted">{snapshot.pages.length} pages</Badge>
          </div>
          <PagesBars rows={snapshot.pages.slice(0, 10)} />
        </CardContent>
      </Card>

      {/* 6. Cities + sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-evari-text">Active users by town / city</div>
                <div className="text-xs text-evari-dim">Top 12 · last 28 days</div>
              </div>
            </div>
            <CityTable rows={snapshot.cities.slice(0, 12)} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-evari-text">Source / medium</div>
                <div className="text-xs text-evari-dim">Top 12 · last 28 days</div>
              </div>
            </div>
            <SourceTable rows={snapshot.sources.slice(0, 12)} />
          </CardContent>
        </Card>
      </div>

      {/* 7. Languages + events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-evari-text">Active users by language</div>
                <div className="text-xs text-evari-dim">Top 10 · last 28 days</div>
              </div>
            </div>
            <LanguageBars rows={snapshot.languages.slice(0, 10)} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-evari-text">Key events</div>
                <div className="text-xs text-evari-dim">All events · last 28 days</div>
              </div>
            </div>
            <EventsPanel rows={snapshot.events} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// KPI tile — big number, delta chip, sparkline.
// -----------------------------------------------------------------------------
function KpiTileCard({
  tile,
  icon,
  color,
}: {
  tile: TrafficKpiTile;
  icon: React.ReactNode;
  color: string;
}) {
  const arrow = tile.deltaPct > 0 ? TrendingUp : tile.deltaPct < 0 ? TrendingDown : Minus;
  const Arrow = arrow;
  const tone =
    tile.deltaPct > 0
      ? 'text-evari-success'
      : tile.deltaPct < 0
        ? 'text-evari-danger'
        : 'text-evari-dimmer';

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
            <span className="text-evari-dim">{icon}</span>
            {tile.label}
          </div>
          <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-mono tabular-nums', tone)}>
            <Arrow className="h-3 w-3" />
            {formatPct(tile.deltaPct)}
          </span>
        </div>
        <div className="text-2xl font-medium tracking-tight text-evari-text font-mono tabular-nums">
          {formatNumber(tile.value)}
        </div>
        <div className="text-[11px] text-evari-dimmer">
          vs {formatNumber(tile.previousValue)} previous 28d
        </div>
        <div className="h-10 -mx-1">
          <Sparkline data={tile.trend} color={color} />
        </div>
      </CardContent>
    </Card>
  );
}

function Sparkline({ data, color }: { data: Array<{ day: string; value: number }>; color: string }) {
  if (!data || data.length === 0) return <div className="h-full" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.25}
          fill={`url(#spark-${color})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// -----------------------------------------------------------------------------
// Trend area — big 12-month chart, metric selector.
// -----------------------------------------------------------------------------
function TrendArea({ trend, metric }: { trend: TrafficDay[]; metric: TrendKey }) {
  const chartData = useMemo(
    () =>
      trend.map((d) => ({
        day: d.day,
        value: d[metric as keyof TrafficDay] as number,
      })),
    [trend, metric],
  );

  if (chartData.length === 0) return <EmptyChart note="No historical data yet." />;

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_PALETTE[0]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={CHART_PALETTE[0]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="day"
            stroke="rgb(var(--evari-dimmer))"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={Math.max(0, Math.floor(chartData.length / 6))}
            tickFormatter={(v: string) => formatMonthTick(v)}
          />
          <YAxis
            stroke="rgb(var(--evari-dimmer))"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => formatCompact(v)}
          />
          <Tooltip
            cursor={{ stroke: 'rgb(var(--evari-dim))', strokeWidth: 1 }}
            contentStyle={{
              background: 'rgb(var(--evari-surface))',
              border: '1px solid rgb(var(--evari-edge))',
              borderRadius: 8,
              fontSize: 12,
              padding: '8px 10px',
            }}
            labelStyle={{ color: 'rgb(var(--evari-dim))', fontSize: 10 }}
            formatter={(v: number) => formatNumber(v)}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={CHART_PALETTE[0]}
            strokeWidth={1.75}
            fill="url(#trendGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Country bars — flag emoji + horizontal progress + number.
// -----------------------------------------------------------------------------
function CountryBars({ rows }: { rows: TrafficCountryRow[] }) {
  if (rows.length === 0) return <EmptyChart note="No country data yet." />;
  const max = rows[0]?.users ?? 1;
  return (
    <div className="space-y-1.5">
      {rows.map((r, idx) => {
        const pct = Math.max(0.02, r.users / max);
        const flag = flagEmoji(r.countryCode);
        return (
          <div key={r.countryCode || r.country} className="flex items-center gap-3">
            <div className="flex items-center gap-2 w-40 shrink-0">
              <span className="text-base leading-none">{flag}</span>
              <span className="text-xs text-evari-text truncate">{r.country}</span>
            </div>
            <div className="flex-1 h-2 rounded-full bg-evari-surfaceSoft overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct * 100}%`,
                  background: `linear-gradient(90deg, ${CHART_PALETTE[idx % CHART_PALETTE.length]}, ${CHART_PALETTE[idx % CHART_PALETTE.length]}CC)`,
                }}
              />
            </div>
            <div className="w-20 text-right font-mono tabular-nums text-xs text-evari-text">
              {formatNumber(r.users)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CountryDonut({ rows }: { rows: TrafficCountryRow[] }) {
  const data = useMemo(() => {
    if (rows.length === 0) return [];
    const top5 = rows.slice(0, 5).map((r) => ({ name: r.country, value: r.sessions }));
    const rest = rows.slice(5).reduce((sum, r) => sum + r.sessions, 0);
    if (rest > 0) top5.push({ name: 'Other', value: rest });
    return top5;
  }, [rows]);

  if (data.length === 0) return <EmptyChart note="No country data yet." />;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex items-center gap-4">
      <div className="h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius={55}
              outerRadius={85}
              dataKey="value"
              paddingAngle={1.5}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((_, idx) => (
                <Cell key={idx} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'rgb(var(--evari-surface))',
                border: '1px solid rgb(var(--evari-edge))',
                borderRadius: 8,
                fontSize: 12,
                padding: '6px 10px',
              }}
              formatter={(v: number) => formatNumber(v)}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-1.5 text-xs min-w-0">
        {data.map((d, idx) => (
          <div key={d.name} className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ background: CHART_PALETTE[idx % CHART_PALETTE.length] }}
            />
            <span className="text-evari-text truncate flex-1">{d.name}</span>
            <span className="font-mono tabular-nums text-evari-dim">
              {formatPct(d.value / (total || 1))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Channel donut + table.
// -----------------------------------------------------------------------------
function ChannelDonut({ rows }: { rows: TrafficChannelRow[] }) {
  const data = rows.map((r) => ({ name: r.channel, value: r.sessions }));
  if (data.length === 0)
    return (
      <div className="h-[220px] flex items-center justify-center">
        <EmptyChart note="No channel data yet." />
      </div>
    );

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            innerRadius={58}
            outerRadius={92}
            dataKey="value"
            paddingAngle={1.5}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((_, idx) => (
              <Cell key={idx} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'rgb(var(--evari-surface))',
              border: '1px solid rgb(var(--evari-edge))',
              borderRadius: 8,
              fontSize: 12,
              padding: '6px 10px',
            }}
            formatter={(v: number) => formatNumber(v)}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChannelTable({ rows }: { rows: TrafficChannelRow[] }) {
  if (rows.length === 0) return null;
  const maxSessions = rows[0]?.sessions ?? 1;
  const totalSessions = rows.reduce((s, r) => s + r.sessions, 0) || 1;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
            <th className="text-left py-1.5 pr-3">Channel</th>
            <th className="text-right py-1.5 px-2">Sessions</th>
            <th className="text-right py-1.5 px-2">Users</th>
            <th className="text-right py-1.5 px-2">Engaged</th>
            <th className="text-right py-1.5 pl-2">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const share = r.sessions / totalSessions;
            return (
              <tr key={r.channel} className="text-evari-text">
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: CHART_PALETTE[idx % CHART_PALETTE.length] }}
                    />
                    <span className="text-xs">{r.channel}</span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-evari-surfaceSoft overflow-hidden w-32">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(2, (r.sessions / maxSessions) * 100)}%`,
                        background: CHART_PALETTE[idx % CHART_PALETTE.length],
                      }}
                    />
                  </div>
                </td>
                <td className="text-right font-mono tabular-nums py-2 px-2">{formatNumber(r.sessions)}</td>
                <td className="text-right font-mono tabular-nums py-2 px-2 text-evari-dim">{formatNumber(r.users)}</td>
                <td className="text-right font-mono tabular-nums py-2 px-2 text-evari-dim">{formatNumber(r.engagedSessions)}</td>
                <td className="text-right font-mono tabular-nums py-2 pl-2 text-evari-text">{formatPct(share)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Pages — horizontal bar chart of views by page title.
// -----------------------------------------------------------------------------
function PagesBars({ rows }: { rows: TrafficPageRow[] }) {
  if (rows.length === 0) return <EmptyChart note="No page data yet." />;

  const data = rows.map((r) => ({
    title: r.pageTitle || r.pagePath,
    path: r.pagePath,
    views: r.views,
    sessions: r.sessions,
    users: r.users,
  }));

  return (
    <div className="h-[380px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 40, left: 6, bottom: 0 }}
        >
          <XAxis
            type="number"
            hide
            tickFormatter={(v: number) => formatCompact(v)}
          />
          <YAxis
            type="category"
            dataKey="title"
            stroke="rgb(var(--evari-dimmer))"
            tick={{ fontSize: 11, fill: 'rgb(var(--evari-text))' }}
            tickLine={false}
            axisLine={false}
            width={280}
            tickFormatter={(v: string) => truncate(v, 40)}
          />
          <Tooltip
            cursor={{ fill: 'rgb(var(--evari-surfaceSoft))' }}
            contentStyle={{
              background: 'rgb(var(--evari-surface))',
              border: '1px solid rgb(var(--evari-edge))',
              borderRadius: 8,
              fontSize: 12,
              padding: '8px 10px',
            }}
            labelStyle={{ color: 'rgb(var(--evari-text))', fontSize: 11, marginBottom: 4 }}
            formatter={(v: number, name: string) => [formatNumber(v), name]}
          />
          <Bar dataKey="views" fill={CHART_PALETTE[0]} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// -----------------------------------------------------------------------------
// City table with country flags.
// -----------------------------------------------------------------------------
function CityTable({ rows }: { rows: TrafficCityRow[] }) {
  if (rows.length === 0) return <EmptyChart note="No city data yet." />;
  const max = rows[0]?.users ?? 1;

  return (
    <div className="space-y-1">
      {rows.map((r, idx) => {
        const pct = Math.max(0.03, r.users / max);
        return (
          <div key={`${r.city}-${r.countryCode}`} className="flex items-center gap-3 py-1.5">
            <span className="text-base shrink-0 w-5 text-center">{flagEmoji(r.countryCode)}</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-evari-text truncate">{r.city || '(unknown)'}</div>
              <div className="mt-1 h-1 rounded-full bg-evari-surfaceSoft overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct * 100}%`,
                    background: CHART_PALETTE[idx % CHART_PALETTE.length],
                  }}
                />
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono tabular-nums text-xs text-evari-text">
                {formatNumber(r.users)}
              </div>
              <div className="text-[10px] text-evari-dimmer">{r.country}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Source / medium table.
// -----------------------------------------------------------------------------
function SourceTable({ rows }: { rows: TrafficSourceRow[] }) {
  if (rows.length === 0) return <EmptyChart note="No source data yet." />;
  const max = rows[0]?.sessions ?? 1;
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium pb-1.5">
        <div>Source / medium</div>
        <div className="text-right">Sessions</div>
        <div className="text-right">CVR</div>
      </div>
      <div className="space-y-1">
        {rows.map((r, idx) => {
          const pct = Math.max(0.03, r.sessions / max);
          return (
            <div key={r.source + '/' + r.medium} className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center py-1.5">
              <div className="min-w-0">
                <div className="text-xs text-evari-text truncate">
                  <span className="font-medium">{r.source}</span>
                  <span className="text-evari-dim"> / {r.medium}</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-evari-surfaceSoft overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct * 100}%`,
                      background: CHART_PALETTE[idx % CHART_PALETTE.length],
                    }}
                  />
                </div>
              </div>
              <div className="font-mono tabular-nums text-xs text-evari-text text-right">
                {formatNumber(r.sessions)}
              </div>
              <div className="font-mono tabular-nums text-xs text-evari-dim text-right">
                {r.conversionRate > 0 ? formatPct(r.conversionRate) : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Language horizontal bar.
// -----------------------------------------------------------------------------
function LanguageBars({ rows }: { rows: TrafficLanguageRow[] }) {
  if (rows.length === 0) return <EmptyChart note="No language data yet." />;

  const data = rows.map((r) => ({
    language: r.language || '(not set)',
    users: r.users,
  }));

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 32, left: 6, bottom: 0 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="language"
            stroke="rgb(var(--evari-dimmer))"
            tick={{ fontSize: 11, fill: 'rgb(var(--evari-text))' }}
            tickLine={false}
            axisLine={false}
            width={120}
            tickFormatter={(v: string) => prettyLanguage(v)}
          />
          <Tooltip
            cursor={{ fill: 'rgb(var(--evari-surfaceSoft))' }}
            contentStyle={{
              background: 'rgb(var(--evari-surface))',
              border: '1px solid rgb(var(--evari-edge))',
              borderRadius: 8,
              fontSize: 12,
              padding: '6px 10px',
            }}
            formatter={(v: number) => formatNumber(v)}
          />
          <Bar dataKey="users" fill={CHART_PALETTE[2]} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Events — list with progress bar + donut alternative when < 7 events.
// -----------------------------------------------------------------------------
function EventsPanel({ rows }: { rows: TrafficEventRow[] }) {
  if (rows.length === 0) return <EmptyChart note="No events yet." />;

  const max = rows[0]?.eventCount ?? 1;
  const total = rows.reduce((s, r) => s + r.eventCount, 0) || 1;

  return (
    <div className="space-y-1.5">
      {rows.slice(0, 10).map((r, idx) => {
        const pct = Math.max(0.03, r.eventCount / max);
        const sharePct = r.eventCount / total;
        return (
          <div key={r.eventName} className="flex items-center gap-3 py-1">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ background: CHART_PALETTE[idx % CHART_PALETTE.length] }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-evari-text font-mono truncate">{r.eventName}</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-evari-surfaceSoft overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct * 100}%`,
                    background: CHART_PALETTE[idx % CHART_PALETTE.length],
                  }}
                />
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono tabular-nums text-xs text-evari-text">
                {formatNumber(r.eventCount)}
              </div>
              <div className="text-[10px] text-evari-dimmer">{formatPct(sharePct)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Shared helpers.
// -----------------------------------------------------------------------------
function EmptyChart({ note }: { note: string }) {
  return (
    <div className="h-[140px] w-full flex items-center justify-center text-xs text-evari-dimmer">
      {note}
    </div>
  );
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString();
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(1)}%`;
}

function formatMonthTick(day: string): string {
  if (!day || day.length < 10) return day;
  const d = new Date(day + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function prettyLanguage(code: string): string {
  if (!code) return '(not set)';
  const parts = code.split('-');
  const base = parts[0]?.toLowerCase() ?? '';
  const lookup: Record<string, string> = {
    en: 'English',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    it: 'Italian',
    nl: 'Dutch',
    pt: 'Portuguese',
    pl: 'Polish',
    sv: 'Swedish',
    da: 'Danish',
    nb: 'Norwegian',
    no: 'Norwegian',
    fi: 'Finnish',
    cs: 'Czech',
    ja: 'Japanese',
    zh: 'Chinese',
    ko: 'Korean',
    ru: 'Russian',
    tr: 'Turkish',
    ar: 'Arabic',
    hi: 'Hindi',
  };
  const name = lookup[base];
  if (!name) return code;
  if (parts[1]) return `${name} (${parts[1].toUpperCase()})`;
  return name;
}

// Convert an ISO 3166-1 alpha-2 country code to its flag emoji. Falls back to
// a globe when the code is empty / unknown.
function flagEmoji(cc: string): string {
  if (!cc || cc.length !== 2) return '🌐';
  const A = 0x1f1e6; // regional indicator A
  const upper = cc.toUpperCase();
  const codePoints = [...upper].map((c) => A + (c.charCodeAt(0) - 65));
  if (codePoints.some((cp) => cp < 0x1f1e6 || cp > 0x1f1ff)) return '🌐';
  return String.fromCodePoint(...codePoints);
}
