'use client';

/**
 * SEO Health — History panel.
 *
 * Lives on the `/shopify/seo-health` page as the "History" tab in
 * Pane 2. Renders three things, stacked:
 *
 *   1. Hero stat strip  — current score, 30-day delta, issues closed
 *                         this week, average fix velocity.
 *   2. Score-over-time  — a filled area chart, one point per event.
 *   3. Event timeline   — the last 25 scans + fix batches as a list.
 *
 * Data comes from `GET /api/seo/history` which is an append-only log of
 * scan-complete and fix-batch events.
 */
import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Loader2, Check, ClipboardList, Search } from 'lucide-react';

// Wire colors by RGB tuples so they render identically in light + dark.
// These match the CSS custom props set in app/globals.css.
const COLOR_SUCCESS = 'rgb(126, 168, 88)'; // --evari-success
const COLOR_DIM = 'rgb(152, 152, 152)'; // --evari-dim on dark; overridden in light
const COLOR_DANGER = 'rgb(200, 82, 88)'; // --evari-danger

type Event = {
  id: number;
  recorded_at: string;
  event: 'scan' | 'fix';
  score: number;
  findings_total: number;
  findings_by_check: Record<string, number>;
  scanned_entities: { products: number; pages: number; articles: number } | null;
  delta: number | null;
};

interface Props {
  /** Optional current-scan snapshot — used only as a fallback hero when the
   *  history table is still empty (first ever page load). */
  fallbackScore?: number | null;
  fallbackFindingsTotal?: number | null;
}

export function SeoHealthHistoryPanel({
  fallbackScore,
  fallbackFindingsTotal,
}: Props) {
  const [events, setEvents] = React.useState<Event[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/seo/history', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { events: Event[] };
        if (!cancelled) setEvents(json.events);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading state — match the visual footprint of the loaded state so
  // there's no layout jump.
  if (events === null && error === null) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 text-evari-dim">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading history…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 text-evari-danger text-sm">
        Couldn&apos;t load history: {error}
      </div>
    );
  }

  const e = events ?? [];

  // Empty-state — table exists but no rows yet. Show a friendly prompt
  // that makes the next action obvious.
  if (e.length === 0) {
    return (
      <EmptyHistory
        currentScore={fallbackScore ?? null}
        currentFindings={fallbackFindingsTotal ?? null}
      />
    );
  }

  return <LoadedHistory events={e} />;
}

// ---------------------------------------------------------------------------
// Loaded state
// ---------------------------------------------------------------------------

function LoadedHistory({ events }: { events: Event[] }) {
  const latest = events[events.length - 1];
  const earliest = events[0];

  // "30-day delta" — score now vs. the oldest point inside the last 30
  // days. If history is shorter than 30 days, fall back to earliest.
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const baselineForDelta =
    events.find((ev) => new Date(ev.recorded_at).getTime() >= thirtyDaysAgo) ??
    earliest;
  const scoreDelta = latest.score - baselineForDelta.score;

  // "Issues closed this week" — sum of |delta| over fix events in last 7d
  // (delta is stored negative on fix events, so absolute it).
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const resolvedThisWeek = events
    .filter(
      (ev) =>
        ev.event === 'fix' &&
        ev.delta !== null &&
        new Date(ev.recorded_at).getTime() >= sevenDaysAgo,
    )
    .reduce((sum, ev) => sum + Math.abs(ev.delta ?? 0), 0);

  // Fix velocity — fixes per active day over the history window (days
  // that actually had activity, not calendar days). More honest than
  // "per calendar day" when you don't work on this every day.
  const fixEvents = events.filter((ev) => ev.event === 'fix');
  const fixCount = fixEvents.reduce(
    (sum, ev) => sum + Math.abs(ev.delta ?? 0),
    0,
  );
  const uniqueFixDays = new Set(
    fixEvents.map((ev) => ev.recorded_at.slice(0, 10)),
  ).size;
  const avgFixesPerDay =
    uniqueFixDays > 0 ? fixCount / uniqueFixDays : null;

  // Chart data: one point per event, label shows date + time for the
  // tooltip, but axis tick shows just the short form.
  const chartData = events.map((ev) => ({
    t: ev.recorded_at,
    score: ev.score,
    findings: ev.findings_total,
    event: ev.event,
    delta: ev.delta,
  }));

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      <HeroStrip
        currentScore={latest.score}
        scoreDelta={scoreDelta}
        resolvedThisWeek={resolvedThisWeek}
        avgFixesPerDay={avgFixesPerDay}
        totalEvents={events.length}
      />

      <ChartCard title="Score over time">
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
            >
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={COLOR_SUCCESS}
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="100%"
                    stopColor={COLOR_SUCCESS}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="rgb(var(--evari-edge) / 0.35)"
                strokeDasharray="2 4"
              />
              <XAxis
                dataKey="t"
                stroke={COLOR_DIM}
                tick={{ fontSize: 10, fill: COLOR_DIM }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: string) => formatTickDate(v)}
                minTickGap={24}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                stroke={COLOR_DIM}
                tick={{ fontSize: 10, fill: COLOR_DIM }}
                tickLine={false}
                axisLine={false}
                width={28}
              />
              <Tooltip
                cursor={{
                  stroke: 'rgb(var(--evari-edge))',
                  strokeWidth: 1,
                  strokeDasharray: '3 3',
                }}
                content={<ScoreTooltip />}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke={COLOR_SUCCESS}
                strokeWidth={2}
                fill="url(#scoreGrad)"
                dot={{ r: 2.5, fill: COLOR_SUCCESS, strokeWidth: 0 }}
                activeDot={{ r: 4, fill: COLOR_SUCCESS, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <EventTimeline events={events.slice().reverse().slice(0, 25)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero strip
// ---------------------------------------------------------------------------

function HeroStrip({
  currentScore,
  scoreDelta,
  resolvedThisWeek,
  avgFixesPerDay,
  totalEvents,
}: {
  currentScore: number;
  scoreDelta: number;
  resolvedThisWeek: number;
  avgFixesPerDay: number | null;
  totalEvents: number;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatTile
        label="Current score"
        value={`${currentScore}`}
        suffix="/100"
        tone={currentScore >= 90 ? 'success' : currentScore >= 60 ? 'warn' : 'danger'}
      />
      <StatTile
        label="30-day change"
        value={
          scoreDelta === 0
            ? '±0'
            : scoreDelta > 0
              ? `+${scoreDelta}`
              : `${scoreDelta}`
        }
        suffix="pts"
        tone={scoreDelta > 0 ? 'success' : scoreDelta < 0 ? 'danger' : 'neutral'}
      />
      <StatTile
        label="Resolved this week"
        value={`${resolvedThisWeek}`}
        suffix={resolvedThisWeek === 1 ? 'issue' : 'issues'}
        tone="neutral"
      />
      <StatTile
        label="Fix velocity"
        value={avgFixesPerDay ? avgFixesPerDay.toFixed(1) : '—'}
        suffix={avgFixesPerDay ? '/ active day' : `${totalEvents} events logged`}
        tone="neutral"
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone: 'success' | 'warn' | 'danger' | 'neutral';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-evari-success'
      : tone === 'warn'
        ? 'text-evari-warn'
        : tone === 'danger'
          ? 'text-evari-danger'
          : 'text-evari-text';
  return (
    <div className="rounded-lg bg-evari-carbon border border-evari-edge/40 px-3 py-3">
      <div className="text-[10px] uppercase tracking-wide text-evari-dimmer">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-2xl font-semibold tabular-nums ${toneClass}`}>
          {value}
        </span>
        {suffix && (
          <span className="text-[11px] text-evari-dim tabular-nums">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart card + tooltip
// ---------------------------------------------------------------------------

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-evari-carbon border border-evari-edge/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-evari-dimmer mb-2 px-1">
        {title}
      </div>
      {children}
    </div>
  );
}

interface TooltipPayload {
  payload: {
    t: string;
    score: number;
    findings: number;
    event: 'scan' | 'fix';
    delta: number | null;
  };
}

function ScoreTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-panel border border-evari-edge bg-evari-surface px-3 py-2 text-[11px] shadow-lg">
      <div className="text-evari-dim tabular-nums">
        {formatFullDate(p.t)}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            p.event === 'scan' ? 'bg-evari-dim' : 'bg-evari-success'
          }`}
        />
        <span className="text-evari-text font-medium capitalize">{p.event}</span>
        {p.delta && p.delta !== 0 && (
          <span
            className={p.delta < 0 ? 'text-evari-success' : 'text-evari-danger'}
          >
            {p.delta > 0 ? '+' : ''}
            {p.delta} issues
          </span>
        )}
      </div>
      <div className="mt-1 text-evari-text tabular-nums">
        Score <span className="font-semibold">{p.score}</span>
        <span className="text-evari-dim"> · {p.findings} open</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event timeline
// ---------------------------------------------------------------------------

function EventTimeline({ events }: { events: Event[] }) {
  return (
    <div className="rounded-lg bg-evari-carbon border border-evari-edge/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-evari-dimmer mb-2 px-1">
        Recent activity
      </div>
      <ul className="space-y-1">
        {events.map((ev) => (
          <li
            key={ev.id}
            className="flex items-center gap-3 py-1.5 px-1 rounded hover:bg-evari-surfaceSoft/40 transition-colors"
          >
            <span
              className={`inline-flex items-center justify-center h-6 w-6 rounded-full ${
                ev.event === 'scan'
                  ? 'bg-evari-surfaceSoft text-evari-dim'
                  : 'bg-evari-success/15 text-evari-success'
              }`}
            >
              {ev.event === 'scan' ? (
                <Search className="h-3 w-3" />
              ) : (
                <Check className="h-3 w-3" />
              )}
            </span>
            <div className="flex-1 min-w-0 text-[12px] flex items-center gap-2">
              <span className="text-evari-text capitalize font-medium">
                {ev.event}
              </span>
              {ev.event === 'fix' && ev.delta !== null && (
                <span className="text-evari-success tabular-nums">
                  {ev.delta > 0 ? '+' : ''}
                  {ev.delta} issues
                </span>
              )}
              {ev.event === 'scan' && ev.scanned_entities && (
                <span className="text-evari-dim tabular-nums">
                  {ev.scanned_entities.products +
                    ev.scanned_entities.pages +
                    ev.scanned_entities.articles}{' '}
                  entities scanned
                </span>
              )}
            </div>
            <div className="text-[11px] text-evari-dim tabular-nums">
              score{' '}
              <span className="text-evari-text font-medium">{ev.score}</span>
            </div>
            <div className="text-[11px] text-evari-dimmer tabular-nums w-[90px] text-right">
              {formatRelative(ev.recorded_at)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyHistory({
  currentScore,
  currentFindings,
}: {
  currentScore: number | null;
  currentFindings: number | null;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16">
      <div className="h-10 w-10 rounded-full bg-evari-surfaceSoft flex items-center justify-center mb-3">
        <ClipboardList className="h-4 w-4 text-evari-dim" />
      </div>
      <div className="text-sm font-medium text-evari-text">
        History starts here
      </div>
      <div className="mt-1 text-[12px] text-evari-dim max-w-[360px] leading-relaxed">
        Every scan and every batch of fixes will pin a data point.
        Your first rescan seeds the chart, and each fix after that
        draws a downward step as findings close.
      </div>
      {currentScore !== null && (
        <div className="mt-5 text-[11px] text-evari-dimmer uppercase tracking-wide">
          Right now · score{' '}
          <span className="text-evari-text tabular-nums">{currentScore}</span>
          {currentFindings !== null && (
            <>
              {' · '}
              <span className="text-evari-text tabular-nums">
                {currentFindings}
              </span>{' '}
              open
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small formatters
// ---------------------------------------------------------------------------

/** "20 Apr" or "20 Apr 13:42" depending on whether the window spans >1 day. */
function formatTickDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso.slice(5, 10);
  }
}

function formatFullDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const min = 60_000;
    const hour = 60 * min;
    const day = 24 * hour;
    if (diff < 60_000) return 'just now';
    if (diff < hour) return `${Math.floor(diff / min)}m ago`;
    if (diff < day) return `${Math.floor(diff / hour)}h ago`;
    if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}
