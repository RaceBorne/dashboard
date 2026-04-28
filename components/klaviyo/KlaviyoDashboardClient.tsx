'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from 'recharts';
import {
  RefreshCw,
  AlertCircle,
  Mail,
  Users,
  MousePointerClick,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  Percent,
  Send,
  Trophy,
  ThumbsDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Zap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  KlaviyoSnapshot,
  KlaviyoCampaignRow,
  KlaviyoFlowRow,
  KlaviyoAggregateKpi,
} from '@/lib/klaviyo/repository';

// -----------------------------------------------------------------------------
// Klaviyo dashboard
//
// Layout (top to bottom):
//   1. Hero 28d KPI strip with 90d sparklines (sends, recipients, open rate,
//      click rate, revenue, revenue-per-send).
//   2. Winners & losers — top-performing and worst-performing campaign
//      in the current window (side-by-side callout).
//   3. Filter + sort controls.
//   4. Campaign feed — chronological, newest-first. Each row is:
//        [ scaled iframe thumbnail of rendered email ] [ metadata + metric grid ]
//   5. Flows — compact table of automated sequences (welcome, abandoned cart).
//   6. Lists — top list/segment counts.
// -----------------------------------------------------------------------------

const TEAL_PALETTE = [
  '#2b7a78',
  '#3aafa9',
  '#6fb3b3',
  '#8fd3d0',
  '#1a5f5e',
  '#5eb5b5',
];

type DateFilter = 'all' | '30d' | '90d';
type SortKey = 'date' | 'open' | 'revenue';

interface Props {
  snapshot: KlaviyoSnapshot;
}

export function KlaviyoDashboardClient({ snapshot }: Props) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [sort, setSort] = useState<SortKey>('date');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const filteredCampaigns = useMemo(
    () => filterAndSortCampaigns(snapshot.campaigns, dateFilter, sort),
    [snapshot.campaigns, dateFilter, sort],
  );

  const { winner, loser } = useMemo(
    () => pickWinnerAndLoser(snapshot.campaigns),
    [snapshot.campaigns],
  );

  // Keep the preview pane synced with the filter/sort — if the current
  // selection drops out of the list, snap to the first visible campaign.
  useEffect(() => {
    if (filteredCampaigns.length === 0) {
      if (selectedCampaignId !== null) setSelectedCampaignId(null);
      return;
    }
    const stillVisible = filteredCampaigns.some((c) => c.id === selectedCampaignId);
    if (!stillVisible) {
      setSelectedCampaignId(filteredCampaigns[0]?.id ?? null);
    }
  }, [filteredCampaigns, selectedCampaignId]);

  const selectedIndex = filteredCampaigns.findIndex((c) => c.id === selectedCampaignId);
  const selectedCampaign: KlaviyoCampaignRow | null =
    selectedIndex >= 0 ? filteredCampaigns[selectedIndex]! : null;

  function gotoPrev() {
    if (filteredCampaigns.length === 0) return;
    const idx = selectedIndex < 0 ? 0 : Math.max(0, selectedIndex - 1);
    setSelectedCampaignId(filteredCampaigns[idx]!.id);
  }
  function gotoNext() {
    if (filteredCampaigns.length === 0) return;
    const idx =
      selectedIndex < 0
        ? 0
        : Math.min(filteredCampaigns.length - 1, selectedIndex + 1);
    setSelectedCampaignId(filteredCampaigns[idx]!.id);
  }

  async function runSync() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/klaviyo/ingest', {
        method: 'POST',
      });
      const body = await res.json().catch(() => ({ ok: false, error: 'Bad JSON' }));
      if (!res.ok || body.ok === false) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      startTransition(() => {
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
            <div className="text-lg font-medium text-evari-text">Klaviyo not connected</div>
            <div className="text-sm text-evari-dim max-w-md mx-auto">
              Set <code className="text-evari-gold">KLAVIYO_API_KEY</code> with read-only
              scopes on campaigns, flows, lists, metrics, and templates.
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
            <div className="text-lg font-medium text-evari-text">
              Workspace ready — awaiting first Klaviyo sync
            </div>
            <div className="text-sm text-evari-dim max-w-md mx-auto">
              Run the ingest to pull the last 50 campaigns, every active flow,
              all lists + segments, and 90 days of daily open/click/order metrics.
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
    <div className="p-6 space-y-3">
      {/* Frozen header: KPI strip (6 across, always) + compact filter/sync row.
           Both stay pinned to the top while the rest of the page scrolls. */}
      <div className="sticky top-0 z-20 bg-evari-ink -mx-6 px-6 pt-1 pb-2 space-y-2 border-b border-evari-edge/30">
        <KpiStrip kpis={snapshot.kpis} />

        {/* Compact one-line filter + sort + sync row (no Card wrapper). */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="uppercase tracking-wider text-evari-dimmer font-medium">Window</span>
          <FilterChip label="All" active={dateFilter === 'all'} onClick={() => setDateFilter('all')} />
          <FilterChip label="30d" active={dateFilter === '30d'} onClick={() => setDateFilter('30d')} />
          <FilterChip label="90d" active={dateFilter === '90d'} onClick={() => setDateFilter('90d')} />
          <span className="uppercase tracking-wider text-evari-dimmer font-medium ml-3">Sort</span>
          <FilterChip label="Date" active={sort === 'date'} onClick={() => setSort('date')} />
          <FilterChip label="Open" active={sort === 'open'} onClick={() => setSort('open')} />
          <FilterChip label="Revenue" active={sort === 'revenue'} onClick={() => setSort('revenue')} />
          <span className="text-evari-dim tabular-nums ml-2">
            {filteredCampaigns.length}/{snapshot.campaigns.length}
          </span>
          <div className="ml-auto flex items-center gap-3">
            {error ? <span className="text-evari-danger truncate max-w-[280px]">{error}</span> : null}
            <span className="text-evari-dimmer hidden md:inline">
              {snapshot.lastSyncedAt
                ? `Synced ${formatRelative(snapshot.lastSyncedAt)}`
                : 'Awaiting first sync'}
            </span>
            <Button variant="outline" size="sm" onClick={runSync} disabled={busy || pending}>
              <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
              {busy ? 'Syncing…' : 'Sync'}
            </Button>
          </div>
        </div>
      </div>

      {/* 3. Two-thirds + one-third split: metrics/list on the left, live preview on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: 2/3 — winners, compact list, flows, lists */}
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {winner && loser && winner.id !== loser.id ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <WinnerLoserCard campaign={winner} kind="winner" />
              <WinnerLoserCard campaign={loser} kind="loser" />
            </div>
          ) : null}

          {/* Campaign list — compact clickable rows, no big thumbnails here */}
          <Card>
            <CardContent className="p-0">
              {filteredCampaigns.length === 0 ? (
                <div className="p-8 text-center text-sm text-evari-dim">
                  No campaigns match this filter.
                </div>
              ) : (
                <div className="divide-y divide-evari-edge/40">
                  {filteredCampaigns.map((c) => (
                    <CampaignListItem
                      key={c.id}
                      campaign={c}
                      selected={c.id === selectedCampaignId}
                      onSelect={() => setSelectedCampaignId(c.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {snapshot.flows.length > 0 ? <FlowsCard flows={snapshot.flows} /> : null}

          {snapshot.lists.length > 0 ? (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-medium text-evari-text">Lists & segments</div>
                    <div className="text-xs text-evari-dim">
                      Sorted by profile count · top {snapshot.lists.length}
                    </div>
                  </div>
                  <Inbox className="h-4 w-4 text-evari-dimmer" />
                </div>
                <div className="divide-y divide-evari-edge/40">
                  {snapshot.lists.map((l) => (
                    <div
                      key={l.id}
                      className="py-2 flex items-center gap-3 text-sm"
                    >
                      <span
                        className={cn(
                          'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded',
                          l.type === 'segment'
                            ? 'bg-evari-surfaceSoft text-evari-dim'
                            : 'bg-evari-surfaceSoft text-evari-text',
                        )}
                      >
                        {l.type ?? 'list'}
                      </span>
                      <span className="flex-1 truncate text-evari-text">{l.name}</span>
                      <span className="tabular-nums text-evari-text">
                        {formatInt(l.profileCount)}
                      </span>
                    </div>
                  ))}
                </div>
                <PanelFooter>
                  Pulled from Klaviyo <code className="text-evari-dim">/lists</code> and{' '}
                  <code className="text-evari-dim">/segments</code>. Profile counts reflect the
                  moment of last sync.
                </PanelFooter>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* RIGHT: 1/3 — sticky newsletter preview with prev/next, full internal scroll.
             top offset clears the frozen KPI + filter header. */}
        <div className="lg:col-span-1 min-w-0">
          <div className="lg:sticky lg:top-[130px]">
            <NewsletterPreviewPane
              campaign={selectedCampaign}
              position={selectedIndex >= 0 ? selectedIndex + 1 : 0}
              total={filteredCampaigns.length}
              onPrev={gotoPrev}
              onNext={gotoNext}
              canPrev={selectedIndex > 0}
              canNext={selectedIndex >= 0 && selectedIndex < filteredCampaigns.length - 1}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Building blocks
// -----------------------------------------------------------------------------

function PanelFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-3 mt-3 text-[11px] text-evari-dimmer leading-snug border-t border-evari-edge/50">
      {children}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-xs px-2.5 py-1 rounded-md uppercase tracking-wider transition-colors',
        active
          ? 'bg-evari-surfaceSoft text-evari-text'
          : 'text-evari-dim hover:bg-evari-surfaceSoft/60 hover:text-evari-text',
      )}
    >
      {label}
    </button>
  );
}

function KpiStrip({ kpis }: { kpis: KlaviyoSnapshot['kpis'] }) {
  const tiles: Array<{ icon: React.ReactNode; kpi: KlaviyoAggregateKpi }> = [
    { icon: <Send className="h-3 w-3" />, kpi: kpis.sends28d },
    { icon: <Users className="h-3 w-3" />, kpi: kpis.recipients28d },
    { icon: <Eye className="h-3 w-3" />, kpi: kpis.avgOpenRate28d },
    { icon: <MousePointerClick className="h-3 w-3" />, kpi: kpis.avgClickRate28d },
    { icon: <DollarSign className="h-3 w-3" />, kpi: kpis.revenue28d },
    { icon: <Percent className="h-3 w-3" />, kpi: kpis.revenuePerSend28d },
  ];
  // Inline style locks this to 6 equal columns regardless of viewport or any
  // Tailwind purge quirks — this strip is small enough that it should ALWAYS
  // fit on a single row on any desktop screen. `minmax(0, 1fr)` lets children
  // shrink rather than forcing an overflow.
  return (
    <div
      className="grid gap-2 w-full"
      style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
    >
      {tiles.map(({ icon, kpi }) => (
        <KpiTile key={kpi.label} icon={icon} kpi={kpi} />
      ))}
    </div>
  );
}

function KpiTile({ icon, kpi }: { icon: React.ReactNode; kpi: KlaviyoAggregateKpi }) {
  const Trend =
    kpi.delta > 0 ? TrendingUp : kpi.delta < 0 ? TrendingDown : Minus;
  const trendColor =
    kpi.delta > 0
      ? 'text-evari-success'
      : kpi.delta < 0
        ? 'text-evari-danger'
        : 'text-evari-dimmer';
  return (
    <Card
      title={`vs ${formatKpiValue(kpi.previousValue, kpi.format)} prev 28d`}
      className="min-w-0 overflow-hidden"
    >
      <CardContent className="p-2.5 space-y-0.5">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-evari-dimmer font-medium truncate">
            <span className="text-evari-dimmer shrink-0">{icon}</span>
            <span className="truncate">{kpi.label}</span>
          </div>
          <span className={cn('flex items-center gap-0.5 text-[10px] tabular-nums shrink-0', trendColor)}>
            <Trend className="h-2.5 w-2.5" />
            {formatDeltaPct(kpi.deltaPct)}
          </span>
        </div>
        <div className="text-lg font-semibold tracking-tight text-evari-text tabular-nums leading-none">
          {formatKpiValue(kpi.value, kpi.format)}
        </div>
        <div className="h-5 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={kpi.trend} margin={{ top: 1, right: 1, left: 1, bottom: 1 }}>
              <defs>
                <linearGradient id={`spark-${kpi.label.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={TEAL_PALETTE[1]} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={TEAL_PALETTE[1]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={TEAL_PALETTE[0]}
                strokeWidth={1.5}
                fill={`url(#spark-${kpi.label.replace(/\s+/g, '')})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function WinnerLoserCard({
  campaign,
  kind,
}: {
  campaign: KlaviyoCampaignRow;
  kind: 'winner' | 'loser';
}) {
  const Icon = kind === 'winner' ? Trophy : ThumbsDown;
  const label = kind === 'winner' ? 'Top performer' : 'Needs work';
  const color = kind === 'winner' ? 'text-evari-success' : 'text-evari-warn';
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Icon className={cn('h-3.5 w-3.5', color)} />
            <div className="text-[10px] uppercase tracking-wider text-evari-dimmer font-medium">
              {label} · 28d
            </div>
          </div>
          <span className="text-[10px] text-evari-dimmer tabular-nums">
            {formatShortDate(campaign.sendTime)}
          </span>
        </div>
        <div className="text-xs font-medium text-evari-text truncate">{campaign.name}</div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <MiniStat label="Open" value={formatPercent(campaign.openRate)} />
          <MiniStat label="Click" value={formatPercent(campaign.clickRate)} />
          <MiniStat label="Revenue" value={formatCurrency(campaign.revenue)} />
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-panel bg-evari-surfaceSoft/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-evari-dimmer">{label}</div>
      <div className="text-sm font-medium text-evari-text tabular-nums">{value}</div>
    </div>
  );
}

function CampaignListItem({
  campaign,
  selected,
  onSelect,
}: {
  campaign: KlaviyoCampaignRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left px-5 py-5 flex items-center gap-5 transition-colors',
        selected
          ? 'bg-evari-surfaceSoft'
          : 'hover:bg-evari-surfaceSoft/60',
      )}
    >
      {/* Date column */}
      <div className="shrink-0 w-16 flex flex-col items-start">
        <div className="text-[10px] uppercase tracking-wider text-evari-dimmer font-medium">
          {formatShortDate(campaign.sendTime)}
        </div>
        <div className="text-[10px] text-evari-dimmer/80 tabular-nums mt-0.5">
          {formatShortTime(campaign.sendTime)}
        </div>
      </div>

      {/* Name + subject */}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="text-sm font-medium text-evari-text truncate">{campaign.name}</div>
        {campaign.subject ? (
          <div className="text-xs text-evari-dim truncate">{campaign.subject}</div>
        ) : null}
      </div>

      {/* Spacious stats on the right — larger gaps, clearer hierarchy */}
      <div className="hidden md:flex items-center gap-7 tabular-nums shrink-0">
        <InlineStat label="To" value={formatInt(campaign.recipients)} />
        <InlineStat label="Open" value={formatPercent(campaign.openRate)} />
        <InlineStat label="Click" value={formatPercent(campaign.clickRate)} />
        <InlineStat label="Revenue" value={formatCurrency(campaign.revenue)} hero />
      </div>

      <ChevronRight
        className={cn(
          'h-4 w-4 shrink-0 transition-opacity',
          selected ? 'text-evari-text opacity-100' : 'text-evari-dimmer opacity-60',
        )}
      />
    </button>
  );
}

function InlineStat({
  label,
  value,
  hero = false,
}: {
  label: string;
  value: string;
  hero?: boolean;
}) {
  return (
    <div className="flex flex-col items-end leading-tight min-w-[52px]">
      <span className="text-[10px] uppercase tracking-wider text-evari-dimmer font-medium">
        {label}
      </span>
      <span
        className={cn(
          'mt-1',
          hero ? 'text-sm font-semibold text-evari-text' : 'text-[13px] text-evari-dim',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function NewsletterPreviewPane({
  campaign,
  position,
  total,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  campaign: KlaviyoCampaignRow | null;
  position: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  // Live-rendered HTML for campaigns that weren't cached during ingest. We stash
  // the fetched HTML by campaign id so re-selecting a campaign in the same
  // session doesn't refetch — the API also persists to the DB so the next page
  // load gets it out of the box.
  const [liveHtml, setLiveHtml] = useState<Record<string, string>>({});
  const [renderBusy, setRenderBusy] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Reset the error when the user navigates to a different campaign.
  useEffect(() => {
    setRenderError(null);
  }, [campaign?.id]);

  const currentHtml = campaign
    ? liveHtml[campaign.id] ?? campaign.previewHtml ?? null
    : null;

  async function renderNow() {
    if (!campaign) return;
    setRenderBusy(true);
    setRenderError(null);
    try {
      const res = await fetch(`/api/integrations/klaviyo/render/${campaign.id}`, {
        method: 'POST',
      });
      const body = await res.json().catch(() => ({ ok: false, error: 'Bad JSON' }));
      if (!res.ok || body.ok === false) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setLiveHtml((prev) => ({ ...prev, [campaign.id]: body.html as string }));
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : String(err));
    } finally {
      setRenderBusy(false);
    }
  }

  // Preview pane bottoms-out 32px above the viewport bottom.
  // The sticky wrapper sits at top-[130px] (clearing the KPI + filter bar),
  // so the pane's total height is 100vh − 130px (start) − 32px (gap) = 100vh − 162px.
  const paneHeight = 'calc(100vh - 162px)';

  if (!campaign) {
    return (
      <Card style={{ height: paneHeight }}>
        <CardContent className="p-6 text-center space-y-2 h-full flex flex-col items-center justify-center">
          <Mail className="h-6 w-6 text-evari-dimmer mx-auto" />
          <div className="text-sm text-evari-text">No campaign selected</div>
          <div className="text-xs text-evari-dim">
            Pick a campaign from the list to preview it here.
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card style={{ height: paneHeight }}>
      <CardContent className="p-0 flex flex-col h-full min-h-0">
        {/* Header with prev/next — fixed height */}
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-evari-edge/40 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onPrev}
            disabled={!canPrev}
            aria-label="Previous campaign"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0 text-center">
            <div className="text-[10px] uppercase tracking-wider text-evari-dimmer tabular-nums">
              {position} of {total} · {formatShortDate(campaign.sendTime)}
            </div>
            <div className="text-xs font-medium text-evari-text truncate">
              {campaign.subject ?? campaign.name}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onNext}
            disabled={!canNext}
            aria-label="Next campaign"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Preview body — flex-1 to fill remaining height, iframe scrolls internally */}
        {currentHtml ? (
          <div className="bg-white flex-1 min-h-0">
            <iframe
              title={`preview-${campaign.id}`}
              srcDoc={wrapForPreview(currentHtml)}
              sandbox=""
              style={{
                width: '100%',
                height: '100%',
                border: 0,
                display: 'block',
              }}
            />
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-start text-center p-6 flex-1 min-h-0 overflow-y-auto"
            style={{
              background: `linear-gradient(135deg, ${TEAL_PALETTE[4]} 0%, ${TEAL_PALETTE[2]} 100%)`,
            }}
          >
            <div className="space-y-3 w-full max-w-sm pt-8">
              <Mail className="h-6 w-6 text-white/80 mx-auto" />
              <div className="text-[11px] uppercase tracking-wider text-white/60">
                {formatShortDate(campaign.sendTime)}
              </div>
              <div className="text-sm font-medium text-white">
                {campaign.subject ?? campaign.name}
              </div>
              <div className="text-[11px] text-white/70">
                No rendered HTML cached for this campaign yet.
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={renderNow}
                disabled={renderBusy}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', renderBusy && 'animate-spin')} />
                {renderBusy ? 'Rendering…' : 'Render now'}
              </Button>
              {renderError ? (
                <div className="text-left text-[12px] leading-relaxed text-white bg-black/40 rounded-md px-3 py-2.5 whitespace-pre-wrap break-words">
                  <div className="text-[10px] uppercase tracking-wider text-white/60 font-medium mb-1">
                    Klaviyo error
                  </div>
                  {renderError}
                  {/permission|scope/i.test(renderError) ? (
                    <div className="mt-3 pt-2 border-t border-white/20 text-[11px] text-white/80">
                      Fix: in Klaviyo, go to Account → Settings → API Keys,
                      edit your key, and tick the read scopes for{' '}
                      <strong className="text-white">templates</strong>,{' '}
                      <strong className="text-white">campaigns</strong>, and{' '}
                      <strong className="text-white">metrics</strong>.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Klaviyo's rendered HTML usually ships without viewport metadata, so we wrap
 * it in a minimal shell so wide tables don't overflow the 600px iframe.
 */
function wrapForPreview(html: string): string {
  if (/<html/i.test(html)) {
    return html;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:0;font-family:system-ui,sans-serif;}img{max-width:100%;height:auto;}</style></head><body>${html}</body></html>`;
}

function StatChip({
  label,
  value,
  sub,
  hero = false,
  dim = false,
}: {
  label: string;
  value: string;
  sub?: string;
  hero?: boolean;
  dim?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-panel px-2.5 py-1.5 bg-evari-surfaceSoft/50',
        hero && 'bg-evari-surfaceSoft',
        dim && 'bg-transparent border border-evari-edge/40',
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-evari-dimmer">{label}</div>
      <div
        className={cn(
          'text-sm font-medium tabular-nums',
          hero ? 'text-evari-text' : dim ? 'text-evari-dim' : 'text-evari-text',
        )}
      >
        {value}
      </div>
      {sub ? <div className="text-[10px] text-evari-dimmer tabular-nums">{sub}</div> : null}
    </div>
  );
}

function FlowsCard({ flows }: { flows: KlaviyoFlowRow[] }) {
  const live = flows.filter((f) => f.status?.toLowerCase() === 'live');
  const others = flows.filter((f) => f.status?.toLowerCase() !== 'live');
  const ordered = [...live, ...others];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-medium text-evari-text flex items-center gap-2">
              <Zap className="h-4 w-4 text-evari-dimmer" /> Automated flows
            </div>
            <div className="text-xs text-evari-dim">
              {live.length} live · {flows.length} total · 28d attribution
            </div>
          </div>
        </div>
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-evari-dimmer border-b border-evari-edge/40">
                <th className="py-2 px-2 font-medium">Flow</th>
                <th className="py-2 px-2 font-medium">Status</th>
                <th className="py-2 px-2 font-medium">Trigger</th>
                <th className="py-2 px-2 font-medium text-right">Recipients</th>
                <th className="py-2 px-2 font-medium text-right">Opens</th>
                <th className="py-2 px-2 font-medium text-right">Clicks</th>
                <th className="py-2 px-2 font-medium text-right">Orders</th>
                <th className="py-2 px-2 font-medium text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((f) => (
                <tr key={f.id} className="border-b border-evari-edge/20 last:border-b-0">
                  <td className="py-2 px-2 text-evari-text truncate max-w-[240px]">{f.name}</td>
                  <td className="py-2 px-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] uppercase',
                        f.status?.toLowerCase() === 'live'
                          ? 'text-evari-success'
                          : 'text-evari-dimmer',
                      )}
                    >
                      {f.status ?? '—'}
                    </Badge>
                  </td>
                  <td className="py-2 px-2 text-evari-dim text-xs">{f.triggerType ?? '—'}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-evari-text">
                    {formatInt(f.recipients28d)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-evari-dim">
                    {formatInt(f.opens28d)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-evari-dim">
                    {formatInt(f.clicks28d)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-evari-dim">
                    {formatInt(f.orders28d)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-evari-text">
                    {formatCurrency(f.revenue28d)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PanelFooter>
          Flow stats are last-28-days aggregates attributed via Klaviyo&apos;s Placed
          Order metric. Flows with no activity in the window still list so you
          can see which automations are quiet.
        </PanelFooter>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function filterAndSortCampaigns(
  campaigns: KlaviyoCampaignRow[],
  dateFilter: DateFilter,
  sort: SortKey,
): KlaviyoCampaignRow[] {
  let filtered = campaigns;
  if (dateFilter !== 'all') {
    const days = dateFilter === '30d' ? 30 : 90;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    filtered = campaigns.filter((c) => {
      if (!c.sendTime) return false;
      const t = Date.parse(c.sendTime);
      return Number.isFinite(t) && t >= cutoff;
    });
  }
  const copy = [...filtered];
  if (sort === 'date') {
    copy.sort((a, b) => Date.parse(b.sendTime ?? '') - Date.parse(a.sendTime ?? ''));
  } else if (sort === 'open') {
    copy.sort((a, b) => b.openRate - a.openRate);
  } else if (sort === 'revenue') {
    copy.sort((a, b) => b.revenue - a.revenue);
  }
  return copy;
}

/**
 * Winner = highest open rate in the current 28d window; loser = lowest
 * open rate among campaigns with at least 250 recipients (don't crown/blame a
 * test with 5 recipients).
 */
function pickWinnerAndLoser(campaigns: KlaviyoCampaignRow[]) {
  const cutoff = Date.now() - 28 * 24 * 60 * 60 * 1000;
  const eligible = campaigns.filter((c) => {
    if (!c.sendTime) return false;
    const t = Date.parse(c.sendTime);
    return Number.isFinite(t) && t >= cutoff && c.recipients >= 250;
  });
  if (eligible.length === 0) return { winner: null, loser: null };
  const byOpen = [...eligible].sort((a, b) => b.openRate - a.openRate);
  return { winner: byOpen[0] ?? null, loser: byOpen[byOpen.length - 1] ?? null };
}

function formatInt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-GB');
}

function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return '0%';
  return `${(n * 100).toFixed(1)}%`;
}

function formatCurrency(n: number): string {
  if (!Number.isFinite(n)) return '£0';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDeltaPct(pct: number): string {
  if (!Number.isFinite(pct) || pct === 0) return '—';
  const pctDisplay = Math.abs(pct * 100);
  const prefix = pct > 0 ? '+' : '−';
  return `${prefix}${pctDisplay.toFixed(pctDisplay >= 10 ? 0 : 1)}%`;
}

function formatKpiValue(value: number, format: KlaviyoAggregateKpi['format']): string {
  if (format === 'currency') return formatCurrency(value);
  if (format === 'percent') return formatPercent(value);
  return formatInt(value);
}

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatShortTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatLongDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const deltaMs = Date.now() - d.getTime();
  const mins = Math.round(deltaMs / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
