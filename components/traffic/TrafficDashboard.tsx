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
  Plus,
  Smartphone,
  Monitor,
  Tablet,
  Languages,
  Activity,
  MapPin,
  UserCircle2,
  Clock,
  CalendarRange,
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
  TrafficDeviceRow,
  TrafficDemographicRow,
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

// All chart accents use shades of teal — the Traffic page deliberately stays
// off-brand from the gold/orange elsewhere so charts read as "data, not UI".
const CHART_PALETTE = [
  '#2b7a78', // deep teal
  '#3aafa9', // mid teal
  '#6fb3b3', // mint teal
  '#8fd3d0', // pale teal
  '#1a5f5e', // forest teal
  '#5eb5b5', // sea teal
  '#87c5c3', // foam teal
  '#4a9896', // slate teal
];

type TrendKey = 'sessions' | 'users' | 'newUsers' | 'events' | 'conversions';

const TREND_OPTIONS: Array<{ key: TrendKey; label: string }> = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'users', label: 'Active users' },
  { key: 'newUsers', label: 'New users' },
  { key: 'events', label: 'Events' },
  { key: 'conversions', label: 'Key events' },
];

// Preset zoom windows for the 12-month trend card. Each step has a minimum
// points-shown equal to its days value (if we have fewer rows we just show
// everything we've got).
const TREND_WINDOWS = [28, 90, 180, 365] as const;
type TrendWindow = (typeof TREND_WINDOWS)[number];

function windowLabel(n: TrendWindow): string {
  return n === 28 ? '28 days' : n === 90 ? '90 days' : n === 180 ? '180 days' : '12 months';
}

// Small footer used under every panel to explain where the number came from.
function PanelFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-2 text-[11px] text-evari-dimmer leading-snug border-t border-evari-edge/50">
      {children}
    </div>
  );
}

interface Props {
  snapshot: TrafficSnapshot;
}

export function TrafficDashboard({ snapshot }: Props) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trendKey, setTrendKey] = useState<TrendKey>('sessions');
  const [trendWindow, setTrendWindow] = useState<TrendWindow>(365);

  // Zoom stepping through TREND_WINDOWS. In = fewer days (more detail).
  const windowIdx = TREND_WINDOWS.indexOf(trendWindow);
  const canZoomIn = windowIdx > 0;
  const canZoomOut = windowIdx < TREND_WINDOWS.length - 1;
  const trimmedTrend = useMemo(
    () => snapshot.trend365.slice(Math.max(0, snapshot.trend365.length - trendWindow)),
    [snapshot.trend365, trendWindow],
  );

  // ─── Hero panels: last 24h + this week ────────────────────────────────────
  // GA4's daily export usually lands one day late (today is incomplete), so
  // "last 24h" = the most recent complete day and "this week" = the trailing
  // 7 complete days. Each panel shows delta vs the equivalent prior block.
  const heroDay = useMemo(() => buildHeroDayUsers(snapshot.trend365), [snapshot.trend365]);
  const heroWeek = useMemo(() => buildHeroWeekUsers(snapshot.trend365), [snapshot.trend365]);

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
      <div className="p-6">
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
      <div className="p-6">
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
    <div className="p-6 space-y-5">
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

      {/* Hero — last 24 hrs + this week. These are the panels Craig actually
          glances at first thing each morning; the 28d KPI strip below is the
          "are we trending the right way" backdrop. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <HeroUsersPanel
          tile={heroDay}
          title="Users · last 24 hrs"
          subtitle={heroDay.windowLabel}
          icon={<Clock className="h-4 w-4" />}
          color={CHART_PALETTE[0]}
          previousLabel="vs prior 24 hrs"
          footer="Most recent complete day from the GA4 daily export. GA4 finalises a day a few hours after midnight UTC, so this is normally yesterday."
        />
        <HeroUsersPanel
          tile={heroWeek}
          title="Users · this week"
          subtitle={heroWeek.windowLabel}
          icon={<CalendarRange className="h-4 w-4" />}
          color={CHART_PALETTE[1]}
          previousLabel="vs prior 7 days"
          footer="Trailing 7 complete days, summed. Compared against the 7 days immediately before that block."
        />
      </div>

      {/* 1. KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTileCard
          tile={snapshot.kpi.activeUsers}
          icon={<Users className="h-4 w-4" />}
          color={CHART_PALETTE[0]}
          description="Unique people who visited the site in the last 28 days (GA4 totalUsers)."
        />
        <KpiTileCard
          tile={snapshot.kpi.newUsers}
          icon={<UserPlus className="h-4 w-4" />}
          color={CHART_PALETTE[1]}
          description="First-ever visit within the window — the cookie / User-ID has never been seen before."
        />
        <KpiTileCard
          tile={snapshot.kpi.sessions}
          icon={<MousePointerClick className="h-4 w-4" />}
          color={CHART_PALETTE[2]}
          description="Visits — grouped runs of activity that end after 30 min idle (GA4 sessions)."
        />
        <KpiTileCard
          tile={snapshot.kpi.events}
          icon={<BarChart3 className="h-4 w-4" />}
          color={CHART_PALETTE[3]}
          description="Total tracked interactions: page_view, click, scroll, form_submit and the rest."
        />
      </div>

      {/* 2. 12-month trend */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-evari-text">
                {windowLabel(trendWindow)} trend
              </div>
              <div className="text-xs text-evari-dim">
                Zoom in/out with +/- · switch metric to compare shapes
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Zoom stepper */}
              <div className="flex items-center rounded-md border border-evari-edge bg-evari-surfaceSoft overflow-hidden">
                <button
                  onClick={() => canZoomOut && setTrendWindow(TREND_WINDOWS[windowIdx + 1])}
                  disabled={!canZoomOut}
                  title="Zoom out"
                  className={cn(
                    'p-1.5 transition-colors',
                    canZoomOut
                      ? 'text-evari-text hover:bg-evari-mute'
                      : 'text-evari-dimmer cursor-not-allowed opacity-50',
                  )}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <div className="px-2 text-[10px] uppercase tracking-[0.1em] text-evari-dim font-medium border-x border-evari-edge min-w-[64px] text-center py-1">
                  {windowLabel(trendWindow)}
                </div>
                <button
                  onClick={() => canZoomIn && setTrendWindow(TREND_WINDOWS[windowIdx - 1])}
                  disabled={!canZoomIn}
                  title="Zoom in"
                  className={cn(
                    'p-1.5 transition-colors',
                    canZoomIn
                      ? 'text-evari-text hover:bg-evari-mute'
                      : 'text-evari-dimmer cursor-not-allowed opacity-50',
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* Metric switcher */}
              <div className="flex items-center gap-1 flex-wrap">
                {TREND_OPTIONS.map((opt) => {
                  const active = trendKey === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setTrendKey(opt.key)}
                      className={cn(
                        'text-[10px] uppercase tracking-[0.1em] px-2.5 py-1 rounded-md transition-colors font-medium',
                        active
                          ? 'text-white'
                          : 'bg-evari-surfaceSoft text-evari-dim hover:text-evari-text hover:bg-evari-mute',
                      )}
                      style={active ? { background: CHART_PALETTE[0] } : undefined}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <TrendArea trend={trimmedTrend} metric={trendKey} />
          <PanelFooter>
            GA4 daily export · one point per day for the selected window.
            Missing days appear as gaps rather than zeros. Zoom levels are{' '}
            {TREND_WINDOWS.map(windowLabel).join(' → ')}.
          </PanelFooter>
        </CardContent>
      </Card>

      {/* 3. World + country */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-5">
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium text-evari-text flex items-center gap-1.5">
                  <Globe2 className="h-4 w-4" style={{ color: CHART_PALETTE[1] }} />
                  Users by country
                </div>
                <div className="text-xs text-evari-dim">Top 12 · last 28 days</div>
              </div>
              <Badge variant="muted">
                {snapshot.countries.length} countries
              </Badge>
            </div>
            <CountryBars rows={snapshot.countries.slice(0, 12)} />
            <PanelFooter>
              GA4 country dimension · deduped from (country, region) rows so each country
              is counted once. Ordered by sessions; bar width is relative to the leader.
            </PanelFooter>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <div className="text-sm font-medium text-evari-text">Share of sessions</div>
              <div className="text-xs text-evari-dim">Top 5 countries + rest</div>
            </div>
            <CountryDonut rows={snapshot.countries} />
            <PanelFooter>
              Slices = each country&apos;s share of total sessions (last 28d). Countries
              outside the top 5 are rolled up into a single &quot;Other&quot; slice.
            </PanelFooter>
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
          <PanelFooter>
            GA4&apos;s default channel grouping — Direct, Organic Search, Paid Social, Referral,
            etc. Each session is bucketed once using the source/medium/campaign rules GA4 applies
            at ingest. Engaged = sessions ≥ 10s, with 2+ pageviews or a key event.
          </PanelFooter>
        </CardContent>
      </Card>

      {/* 5. Devices + Demographics — each card hides itself entirely when the
          underlying data is missing, so we don't render half-empty placeholders.
          Devices is universal (deviceCategory), Demographics needs Google
          Signals. */}
      {(() => {
        const hasDevices = snapshot.devices.some((d) => d.sessions > 0);
        const hasDemographics = snapshot.demographics.some(
          (d) => d.users > 0 && (d.gender !== 'unknown' || d.ageBracket !== 'unknown'),
        );
        if (!hasDevices && !hasDemographics) return null;
        return (
          <div
            className={cn(
              'grid grid-cols-1 gap-5',
              hasDevices && hasDemographics ? 'lg:grid-cols-2' : 'lg:grid-cols-1',
            )}
          >
            {hasDevices ? (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-evari-text flex items-center gap-1.5">
                        <Smartphone
                          className="h-4 w-4"
                          style={{ color: CHART_PALETTE[0] }}
                        />
                        Mobile vs desktop
                      </div>
                      <div className="text-xs text-evari-dim">
                        Device category breakdown · last 28 days
                      </div>
                    </div>
                  </div>
                  <DevicesPanel rows={snapshot.devices} />
                  <PanelFooter>
                    GA4 deviceCategory dimension — mobile / desktop / tablet.
                    Sessions counted once per device per user. Useful for deciding
                    where to prioritise responsive work and ad creative.
                  </PanelFooter>
                </CardContent>
              </Card>
            ) : null}

            {hasDemographics ? (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-evari-text flex items-center gap-1.5">
                        <UserCircle2
                          className="h-4 w-4"
                          style={{ color: CHART_PALETTE[1] }}
                        />
                        Demographics
                      </div>
                      <div className="text-xs text-evari-dim">
                        Gender + age · last 28 days
                      </div>
                    </div>
                  </div>
                  <DemographicsPanel rows={snapshot.demographics} />
                  <PanelFooter>
                    GA4 userGender + userAgeBracket dimensions. Requires Google
                    Signals enabled on the property; without Signals this panel
                    is hidden entirely.
                  </PanelFooter>
                </CardContent>
              </Card>
            ) : null}
          </div>
        );
      })()}

      {/* 6. Pages & screens */}
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
          <PanelFooter>
            GA4 screenPageViews per pageTitle — counts every view (not deduped per session).
            The Y-axis auto-widens to fit the longest title so nothing truncates.
          </PanelFooter>
        </CardContent>
      </Card>

      {/* 7. Cities + sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-evari-text flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" style={{ color: CHART_PALETTE[0] }} />
                  Cities, grouped by country
                </div>
                <div className="text-xs text-evari-dim">
                  Highest-density cities in each top country · last 28 days
                </div>
              </div>
            </div>
            <CitiesByCountry rows={snapshot.cities} />
            <PanelFooter>
              GA4 city + country dimensions · grouped by country (flag) with cities listed
              in descending user order. Useful for spotting where the density of your
              customers / viewers is concentrated within each country.
            </PanelFooter>
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
            <PanelFooter>
              Raw source / medium pairs (e.g. google / organic, instagram / social). CVR =
              conversions ÷ sessions for that pair. Unlike channels, this does not group
              across campaigns — each referrer stands alone.
            </PanelFooter>
          </CardContent>
        </Card>
      </div>

      {/* 8. Languages + events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-evari-text flex items-center gap-1.5">
                  <Languages className="h-4 w-4" style={{ color: CHART_PALETTE[2] }} />
                  Active users by language
                </div>
                <div className="text-xs text-evari-dim">Top 10 · last 28 days</div>
              </div>
            </div>
            <LanguageBars rows={snapshot.languages.slice(0, 10)} />
            <PanelFooter>
              GA4 language dimension — pulled from the visitor&apos;s browser locale (not
              guessed from IP). Regional variants (en-gb, en-us) are rolled under the same
              label where the region tag is unambiguous.
            </PanelFooter>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-evari-text flex items-center gap-1.5">
                  <Activity className="h-4 w-4" style={{ color: CHART_PALETTE[3] }} />
                  Key events
                </div>
                <div className="text-xs text-evari-dim">All events · last 28 days</div>
              </div>
            </div>
            <EventsPanel rows={snapshot.events} />
            <PanelFooter>
              GA4 event_count per event_name, ordered by volume. Events marked as
              &quot;key events&quot; in GA4 count as conversions in KPI deltas above;
              pageless events like scroll / session_start are still included here.
            </PanelFooter>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Hero "users" panels — last 24 hrs + this week. These read the trend365
// array (sorted ascending) and synthesise a TrafficKpiTile-shaped object so
// they can lean on the existing Sparkline + delta visuals without a new
// data layer trip.
// -----------------------------------------------------------------------------
interface HeroTile {
  value: number;
  previousValue: number;
  deltaPct: number;
  trend: TrafficSparkPoint[];
  windowLabel: string;
}

type TrafficSparkPoint = { day: string; value: number };

function buildHeroDayUsers(trend: TrafficDay[]): HeroTile {
  if (trend.length === 0) {
    return { value: 0, previousValue: 0, deltaPct: 0, trend: [], windowLabel: '—' };
  }
  const last = trend[trend.length - 1];
  const prev = trend.length >= 2 ? trend[trend.length - 2] : null;
  const value = last?.users ?? 0;
  const previousValue = prev?.users ?? 0;
  const delta = value - previousValue;
  const deltaPct = previousValue > 0 ? delta / previousValue : 0;
  // Sparkline: last 14 days of daily users, so the most-recent-day big
  // number always has visual context.
  const sparkRows = trend.slice(Math.max(0, trend.length - 14));
  const sparkTrend: TrafficSparkPoint[] = sparkRows.map((d) => ({ day: d.day, value: d.users }));
  return {
    value,
    previousValue,
    deltaPct,
    trend: sparkTrend,
    windowLabel: last ? formatDayLabel(last.day) : '—',
  };
}

function buildHeroWeekUsers(trend: TrafficDay[]): HeroTile {
  if (trend.length === 0) {
    return { value: 0, previousValue: 0, deltaPct: 0, trend: [], windowLabel: '—' };
  }
  const week = trend.slice(Math.max(0, trend.length - 7));
  const prevWeek = trend.slice(Math.max(0, trend.length - 14), Math.max(0, trend.length - 7));
  const value = week.reduce((s, d) => s + d.users, 0);
  const previousValue = prevWeek.reduce((s, d) => s + d.users, 0);
  const delta = value - previousValue;
  const deltaPct = previousValue > 0 ? delta / previousValue : 0;
  // Sparkline: last 12 weeks of weekly user totals if we have enough days,
  // otherwise fall back to whatever daily data we have.
  const sparkTrend: TrafficSparkPoint[] = bucketIntoWeeks(trend, 12);
  const startDay = week[0]?.day;
  const endDay = week[week.length - 1]?.day;
  const windowLabel =
    startDay && endDay
      ? `${formatDayLabel(startDay)} → ${formatDayLabel(endDay)}`
      : '—';
  return { value, previousValue, deltaPct, trend: sparkTrend, windowLabel };
}

// Group the trailing N weeks of trend rows into Sunday-anchored 7-day buckets
// keyed by the bucket's last day. We work backwards from the most recent day
// so the most recent bucket is always exactly 7 days regardless of which
// weekday GA4 last reported.
function bucketIntoWeeks(trend: TrafficDay[], weeks: number): TrafficSparkPoint[] {
  if (trend.length === 0) return [];
  const out: TrafficSparkPoint[] = [];
  let end = trend.length;
  for (let i = 0; i < weeks; i++) {
    const start = Math.max(0, end - 7);
    if (start === end) break;
    const slice = trend.slice(start, end);
    const sum = slice.reduce((s, d) => s + d.users, 0);
    const lastDay = slice[slice.length - 1]?.day ?? '';
    out.push({ day: lastDay, value: sum });
    end = start;
    if (start === 0) break;
  }
  return out.reverse();
}

function formatDayLabel(day: string): string {
  if (!day || day.length < 10) return day;
  const d = new Date(day + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function HeroUsersPanel({
  tile,
  title,
  subtitle,
  icon,
  color,
  previousLabel,
  footer,
}: {
  tile: HeroTile;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  previousLabel: string;
  footer: string;
}) {
  const arrow =
    tile.deltaPct > 0 ? TrendingUp : tile.deltaPct < 0 ? TrendingDown : Minus;
  const Arrow = arrow;
  const tone =
    tile.deltaPct > 0
      ? 'text-evari-success'
      : tile.deltaPct < 0
        ? 'text-evari-danger'
        : 'text-evari-dimmer';

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
              <span style={{ color }}>{icon}</span>
              {title}
            </div>
            <div className="text-xs text-evari-dim mt-0.5 truncate">{subtitle}</div>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-mono tabular-nums px-1.5 py-0.5 rounded-md bg-evari-surfaceSoft',
              tone,
            )}
          >
            <Arrow className="h-3.5 w-3.5" />
            {formatPct(tile.deltaPct)}
          </span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-4xl font-medium tracking-tight text-evari-text font-mono tabular-nums leading-none">
              {formatNumber(tile.value)}
            </div>
            <div className="text-[11px] text-evari-dimmer mt-1">
              {previousLabel}: {formatNumber(tile.previousValue)}
            </div>
          </div>
          <div className="h-12 w-40 -mb-1">
            <Sparkline data={tile.trend} color={color} />
          </div>
        </div>
        <PanelFooter>{footer}</PanelFooter>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// KPI tile — big number, delta chip, sparkline.
// -----------------------------------------------------------------------------
function KpiTileCard({
  tile,
  icon,
  color,
  description,
}: {
  tile: TrafficKpiTile;
  icon: React.ReactNode;
  color: string;
  description?: string;
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
        {description ? (
          <div className="text-[10px] text-evari-dimmer leading-snug pt-1 border-t border-evari-edge/50">
            {description}
          </div>
        ) : null}
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

  // Label column needs to fit the longest page title on a single line, so
  // we size the YAxis width off the actual data + a roughly-measured char
  // width at the rendered font size (11px). Capped so we don't starve the
  // bars on very narrow cards.
  const longest = data.reduce((n, d) => Math.max(n, d.title.length), 0);
  const labelWidth = Math.min(560, Math.max(240, Math.round(longest * 6.4) + 16));

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
            width={labelWidth}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: 'rgba(0, 0, 0, 0.03)' }}
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
            cursor={{ fill: 'rgba(0, 0, 0, 0.03)' }}
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
// Devices — horizontal stack bar + numeric legend.
// -----------------------------------------------------------------------------
function DevicesPanel({ rows }: { rows: TrafficDeviceRow[] }) {
  if (rows.length === 0) return <EmptyChart note="No device data yet." />;

  const total = rows.reduce((sum, r) => sum + r.sessions, 0) || 1;
  const iconFor = (device: string) => {
    const d = device.toLowerCase();
    if (d === 'mobile') return <Smartphone className="h-4 w-4" />;
    if (d === 'tablet') return <Tablet className="h-4 w-4" />;
    if (d === 'desktop') return <Monitor className="h-4 w-4" />;
    return <Monitor className="h-4 w-4" />;
  };

  return (
    <div className="space-y-3">
      {/* Stacked bar — one segment per device */}
      <div className="h-3 w-full rounded-full bg-evari-surfaceSoft overflow-hidden flex">
        {rows.map((r, idx) => {
          const share = r.sessions / total;
          return (
            <div
              key={r.device}
              style={{
                width: `${share * 100}%`,
                background: CHART_PALETTE[idx % CHART_PALETTE.length],
              }}
              title={`${r.device}: ${formatPct(share)} (${formatNumber(r.sessions)} sessions)`}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {rows.slice(0, 3).map((r, idx) => {
          const share = r.sessions / total;
          return (
            <div
              key={r.device}
              className="rounded-lg border border-evari-edge/60 bg-evari-surfaceSoft/30 p-2.5 flex items-center gap-2.5"
            >
              <div
                className="h-8 w-8 rounded-md flex items-center justify-center text-white shrink-0"
                style={{ background: CHART_PALETTE[idx % CHART_PALETTE.length] }}
              >
                {iconFor(r.device)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] uppercase tracking-[0.1em] text-evari-dimmer font-medium">
                  {r.device}
                </div>
                <div className="text-sm text-evari-text font-mono tabular-nums leading-tight">
                  {formatPct(share)}
                </div>
                <div className="text-[10px] text-evari-dimmer">
                  {formatNumber(r.sessions)} sessions · {formatNumber(r.users)} users
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Demographics — gender donut + age bars. Hides when all-empty.
// -----------------------------------------------------------------------------
function DemographicsPanel({ rows }: { rows: TrafficDemographicRow[] }) {
  const totals = useMemo(() => {
    const byGender = new Map<string, number>();
    const byAge = new Map<string, number>();
    for (const r of rows) {
      byGender.set(r.gender, (byGender.get(r.gender) ?? 0) + r.users);
      byAge.set(r.ageBracket, (byAge.get(r.ageBracket) ?? 0) + r.users);
    }
    return { byGender, byAge };
  }, [rows]);

  const hasSignal = rows.some(
    (r) => r.users > 0 && (r.gender !== 'unknown' || r.ageBracket !== 'unknown'),
  );

  if (!hasSignal) {
    return (
      <div className="h-[200px] flex flex-col items-center justify-center text-center gap-2 px-4">
        <UserCircle2 className="h-6 w-6 text-evari-dimmer" />
        <div className="text-xs text-evari-dim max-w-xs">
          Demographics will appear once Google Signals has enough data. Enable Signals in
          GA4 → Admin → Data collection for gender + age breakdowns.
        </div>
      </div>
    );
  }

  const genderData = Array.from(totals.byGender.entries())
    .filter(([g]) => g !== 'unknown')
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const genderTotal = genderData.reduce((s, d) => s + d.value, 0) || 1;

  // Canonical age order for stable rendering even if GA4 returns them jumbled.
  const AGE_ORDER = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const ageData = AGE_ORDER.map((name) => ({
    name,
    value: totals.byAge.get(name) ?? 0,
  }));
  const ageMax = Math.max(1, ...ageData.map((d) => d.value));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4 items-center">
      {/* Gender donut */}
      <div>
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={genderData}
                innerRadius={42}
                outerRadius={70}
                dataKey="value"
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {genderData.map((_, idx) => (
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
        <div className="space-y-1 pt-1">
          {genderData.map((d, idx) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block h-2 w-2 rounded-full shrink-0"
                style={{ background: CHART_PALETTE[idx % CHART_PALETTE.length] }}
              />
              <span className="text-evari-text flex-1 capitalize">{d.name}</span>
              <span className="font-mono tabular-nums text-evari-dim">
                {formatPct(d.value / genderTotal)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Age bars */}
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium pb-0.5">
          Users by age
        </div>
        {ageData.map((d, idx) => {
          const pct = Math.max(0.02, d.value / ageMax);
          return (
            <div key={d.name} className="flex items-center gap-3">
              <div className="w-14 text-xs text-evari-text shrink-0 font-mono tabular-nums">
                {d.name}
              </div>
              <div className="flex-1 h-2 rounded-full bg-evari-surfaceSoft overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct * 100}%`,
                    background: CHART_PALETTE[(idx + 2) % CHART_PALETTE.length],
                  }}
                />
              </div>
              <div className="w-16 text-right font-mono tabular-nums text-xs text-evari-text">
                {formatNumber(d.value)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Cities grouped by country — flag header + top cities as nested progress bars.
// -----------------------------------------------------------------------------
function CitiesByCountry({ rows }: { rows: TrafficCityRow[] }) {
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { country: string; countryCode: string; total: number; cities: TrafficCityRow[] }
    >();
    for (const r of rows) {
      const key = r.countryCode || r.country || '(unknown)';
      const prev = map.get(key);
      if (prev) {
        prev.total += r.users;
        prev.cities.push(r);
      } else {
        map.set(key, {
          country: r.country || '(unknown)',
          countryCode: r.countryCode,
          total: r.users,
          cities: [r],
        });
      }
    }
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        cities: g.cities.sort((a, b) => b.users - a.users).slice(0, 4),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [rows]);

  if (groups.length === 0) return <EmptyChart note="No city data yet." />;

  const globalMax = Math.max(1, ...groups.flatMap((g) => g.cities.map((c) => c.users)));

  return (
    <div className="space-y-3">
      {groups.map((g, gIdx) => {
        const barColor = CHART_PALETTE[gIdx % CHART_PALETTE.length];
        return (
          <div key={g.country} className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-base leading-none">{flagEmoji(g.countryCode)}</span>
              <span className="text-evari-text font-medium">{g.country}</span>
              <span className="text-evari-dimmer">·</span>
              <span className="text-evari-dim font-mono tabular-nums">
                {formatNumber(g.total)} users
              </span>
            </div>
            <div className="pl-7 space-y-1">
              {g.cities.map((c) => {
                const pct = Math.max(0.02, c.users / globalMax);
                return (
                  <div key={`${g.countryCode}-${c.city}`} className="flex items-center gap-2">
                    <div className="w-28 text-[11px] text-evari-text truncate shrink-0">
                      {c.city || '(unknown)'}
                    </div>
                    <div className="flex-1 h-1.5 rounded-full bg-evari-surfaceSoft overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct * 100}%`, background: barColor }}
                      />
                    </div>
                    <div className="w-14 text-right text-[11px] font-mono tabular-nums text-evari-dim">
                      {formatNumber(c.users)}
                    </div>
                  </div>
                );
              })}
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
