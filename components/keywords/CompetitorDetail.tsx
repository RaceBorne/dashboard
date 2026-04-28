'use client';

import { useMemo, useState } from 'react';
import {
  List,
  Trophy,
  GitCompareArrows,
  Link2,
  Gauge,
  Globe,
  ExternalLink,
  RefreshCw,
  Trash2,
  Plus,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { cn } from '@/lib/utils';
import type {
  KeywordList,
  KeywordMember,
  KeywordWorkspace,
} from '@/lib/keywords/workspace';

// -----------------------------------------------------------------------------
// CompetitorDetail — the right-hand panel when a competitor list is active.
//
// Four tabs:
//   1. All keywords        → every keyword the competitor ranks for
//   2. Keywords they win   → positions where they're top 10 and we aren't
//   3. Backlink profile    → rank / backlinks / referring domains / anchors
//   4. Traffic + pages     → estimated monthly traffic + top ranking pages
//
// All data comes from the KeywordWorkspace — no extra fetches.
// -----------------------------------------------------------------------------

type TabKey = 'all' | 'keywords' | 'backlinks' | 'traffic';

interface Props {
  list: KeywordList;
  members: KeywordMember[];
  workspace: KeywordWorkspace;
  busy: boolean;
  onAddKeyword: () => void;
  onRunIngest: () => void;
  onDeleteList: () => void;
}

export function CompetitorDetail({
  list,
  members,
  workspace,
  busy,
  onAddKeyword,
  onRunIngest,
  onDeleteList,
}: Props) {
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');

  const target = (list.targetDomain ?? '').toLowerCase();
  const backlinks = target ? workspace.backlinksByDomain[target] ?? null : null;
  const referring = target ? workspace.referringDomainsByDomain[target] ?? [] : [];
  const topPages = target ? workspace.topPagesByDomain[target] ?? [] : [];

  const keywordsTheyWin = useMemo(
    () =>
      members
        .filter(
          (m) =>
            m.theirPosition != null &&
            m.theirPosition <= 10 &&
            (m.ourPosition == null || m.ourPosition > 10),
        )
        .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)),
    [members],
  );

  const overlap = useMemo(
    () =>
      members
        .filter((m) => m.ourPosition != null && m.theirPosition != null)
        .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)),
    [members],
  );

  // Traffic estimate: sum of (search_volume × positional CTR) over every
  // keyword the competitor ranks for.
  const trafficStats = useMemo(() => estimateTraffic(members), [members]);

  return (
    <div className="flex-1 min-w-0 px-4 pt-6 pb-10 space-y-5 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-lg font-medium text-evari-text truncate">{list.label}</h2>
            <Badge variant="accent">{list.targetDomain}</Badge>
            {list.targetDomain ? (
              <a
                href={`https://${list.targetDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-evari-dimmer hover:text-evari-text"
                aria-label={`Visit ${list.targetDomain}`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
          {list.notes ? (
            <p className="mt-1 text-xs text-evari-dim max-w-2xl">{list.notes}</p>
          ) : null}
          <p className="mt-0.5 text-[11px] text-evari-dimmer">
            {list.lastSyncedAt
              ? `Last synced ${relativeTime(list.lastSyncedAt)} · $${(list.lastSyncCostUsd ?? 0).toFixed(3)}`
              : 'Not synced yet — run ingest to pull ranked keywords.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={onAddKeyword} disabled={busy}>
            <Plus className="h-3.5 w-3.5" /> Add keyword
          </Button>
          <Button variant="primary" size="sm" onClick={onRunIngest} disabled={busy}>
            <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
            Pull ranked keywords
          </Button>
          <Button variant="ghost" size="sm" onClick={onDeleteList} disabled={busy}>
            <Trash2 className="h-3.5 w-3.5" />
            Retire
          </Button>
        </div>
      </div>

      {/* Headline stat tiles — live here so they're always visible regardless
          of the active tab. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<Trophy className="h-4 w-4" />}
          iconTone="text-evari-gold"
          value={keywordsTheyWin.length.toLocaleString('en-GB')}
          unit="keywords they win"
          helper={`of ${members.length} tracked`}
        />
        <StatTile
          icon={<GitCompareArrows className="h-4 w-4" />}
          iconTone="text-evari-accent"
          value={overlap.length.toLocaleString('en-GB')}
          unit="overlap"
          helper={
            overlap.length > 0
              ? `${countWeBeat(overlap)} where we lead`
              : 'No overlap yet'
          }
        />
        <StatTile
          icon={<Link2 className="h-4 w-4" />}
          iconTone="text-evari-accent"
          value={
            backlinks
              ? (backlinks.referringDomains || 0).toLocaleString('en-GB')
              : '—'
          }
          unit="ref domains"
          helper={
            backlinks
              ? `${(backlinks.backlinks || 0).toLocaleString('en-GB')} total links`
              : 'No backlinks data yet'
          }
        />
        <StatTile
          icon={<Gauge className="h-4 w-4" />}
          iconTone="text-evari-success"
          value={Math.round(trafficStats.estMonthly).toLocaleString('en-GB')}
          unit="est. traffic/mo"
          helper={`Across ${trafficStats.rankingKeywords} ranking keywords`}
        />
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-evari-surfaceSoft">
        <TabButton
          active={tab === 'all'}
          onClick={() => setTab('all')}
          icon={<List className="h-3.5 w-3.5" />}
          label="All keywords"
          count={members.length}
        />
        <TabButton
          active={tab === 'keywords'}
          onClick={() => setTab('keywords')}
          icon={<Trophy className="h-3.5 w-3.5" />}
          label="Keywords they win"
          count={keywordsTheyWin.length}
        />
        <TabButton
          active={tab === 'backlinks'}
          onClick={() => setTab('backlinks')}
          icon={<Link2 className="h-3.5 w-3.5" />}
          label="Backlink profile"
          count={backlinks ? backlinks.referringDomains : null}
        />
        <TabButton
          active={tab === 'traffic'}
          onClick={() => setTab('traffic')}
          icon={<Gauge className="h-3.5 w-3.5" />}
          label="Traffic + pages"
          count={topPages.length}
        />
      </div>

      {/* Tab contents */}
      {tab === 'all' ? (
        <AllKeywordsTab
          members={members}
          target={target}
          search={search}
          setSearch={setSearch}
        />
      ) : tab === 'keywords' ? (
        <KeywordsTheyWinTab rows={keywordsTheyWin} />
      ) : tab === 'backlinks' ? (
        <BacklinksTab
          summary={backlinks}
          referring={referring}
          target={target}
        />
      ) : (
        <TrafficTab
          stats={trafficStats}
          topPages={topPages}
          target={target}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tab: All keywords. The raw dump — every keyword the competitor ranks for
// in the tracked locale, sorted by position (best first), with a search box.
// -----------------------------------------------------------------------------

function AllKeywordsTab({
  members,
  target,
  search,
  setSearch,
}: {
  members: KeywordMember[];
  target: string;
  search: string;
  setSearch: (s: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? members.filter((m) => m.keyword.includes(q))
      : members;
    // Sort by their position (best first), nulls last, then by volume desc.
    return [...base].sort((a, b) => {
      const ap = a.theirPosition ?? Number.POSITIVE_INFINITY;
      const bp = b.theirPosition ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      return (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
    });
  }, [members, search]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-sm">
            Every keyword {target || 'this domain'} ranks for
          </CardTitle>
          <p className="text-xs text-evari-dimmer">
            {filtered.length.toLocaleString('en-GB')} of{' '}
            {members.length.toLocaleString('en-GB')} shown. Sorted by their
            position.
          </p>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter keywords…"
          className="h-8 w-48 rounded-panel bg-evari-surface border border-evari-surfaceSoft px-2.5 text-xs text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:ring-1 focus:ring-evari-accent"
        />
      </CardHeader>
      <CardContent className="px-0">
        {members.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-evari-dim">
            No keywords synced yet. Click <span className="font-medium">Pull
            ranked keywords</span> above to fetch up to 200 of their top
            organic keywords.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm table-fixed">
              <colgroup>
                <col className="w-12" /> {/* Their rank */}
                <col className="w-12" /> {/* Us */}
                <col /> {/* Keyword + URL (flex) */}
                <col className="w-20" /> {/* Volume */}
                <col className="w-12" /> {/* KD */}
                <col className="w-16" /> {/* CPC */}
                <col className="w-16" /> {/* Comp */}
                <col className="w-24" /> {/* Intent */}
                <col className="w-20" /> {/* Est. traffic */}
              </colgroup>
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.1em] text-evari-dimmer border-b border-evari-surfaceSoft">
                  <th className="text-right font-medium px-2 py-2">Them</th>
                  <th className="text-right font-medium px-2 py-2">Us</th>
                  <th className="text-left font-medium px-3 py-2">Keyword / page</th>
                  <th className="text-right font-medium px-2 py-2">Volume</th>
                  <th className="text-right font-medium px-2 py-2">KD</th>
                  <th className="text-right font-medium px-2 py-2">CPC</th>
                  <th className="text-right font-medium px-2 py-2" title="Paid search competition (0–1)">Comp</th>
                  <th className="text-left font-medium px-2 py-2">Intent</th>
                  <th className="text-right font-medium px-2 py-2 pr-4" title="Estimated monthly visits = volume × CTR at their position">Est. traffic</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const estTraffic =
                    m.theirPosition != null && m.searchVolume != null
                      ? m.searchVolume * ctrFor(m.theirPosition)
                      : null;
                  return (
                    <tr
                      key={m.keyword}
                      className="border-b border-evari-surface/40 hover:bg-evari-surface/30 align-top"
                    >
                      <td className="px-2 py-2 text-right tabular-nums">
                        <PositionCell pos={m.theirPosition} />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        <PositionCell pos={m.ourPosition} />
                      </td>
                      <td className="px-3 py-2 min-w-0">
                        <div
                          className="font-medium text-evari-text truncate"
                          title={m.theirTitle || m.keyword}
                        >
                          {m.keyword}
                        </div>
                        {m.theirUrl ? (
                          <a
                            href={m.theirUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 flex items-center gap-1 text-[11px] text-evari-dimmer hover:text-evari-accent truncate"
                            title={m.theirUrl}
                          >
                            <span className="truncate">{prettyPath(m.theirUrl)}</span>
                            <ExternalLink className="h-2.5 w-2.5 opacity-60 shrink-0" />
                          </a>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-evari-dim">
                        {m.searchVolume != null
                          ? m.searchVolume.toLocaleString('en-GB')
                          : '—'}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-2 text-right tabular-nums',
                          kdTone(m.keywordDifficulty),
                        )}
                      >
                        {m.keywordDifficulty ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-evari-dim">
                        {m.cpc != null ? `£${m.cpc.toFixed(2)}` : '—'}
                      </td>
                      <td className={cn('px-2 py-2 text-right tabular-nums', compTone(m.competition))}>
                        {m.competition != null ? m.competition.toFixed(2) : '—'}
                      </td>
                      <td className="px-2 py-2">
                        {m.searchIntent ? (
                          <Badge variant="outline" className="text-[10px]">
                            {m.searchIntent}
                          </Badge>
                        ) : (
                          <span className="text-evari-dimmer text-xs">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 pr-4 text-right tabular-nums text-evari-text">
                        {estTraffic != null
                          ? Math.round(estTraffic).toLocaleString('en-GB')
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function compTone(comp: number | null): string {
  if (comp == null) return 'text-evari-dim';
  if (comp < 0.33) return 'text-evari-success';
  if (comp < 0.66) return 'text-evari-gold';
  return 'text-evari-danger';
}

function prettyPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? u.host : u.pathname + (u.search || '');
  } catch {
    return url;
  }
}

// -----------------------------------------------------------------------------
// Tab: Keywords they win.
// -----------------------------------------------------------------------------

function KeywordsTheyWinTab({ rows }: { rows: KeywordMember[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          Keywords they rank top-10 and we don&apos;t
        </CardTitle>
        <p className="text-xs text-evari-dimmer">
          Sorted by monthly search volume. These are the gaps most worth closing.
        </p>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <EmptyPanel message="No gaps to show yet. Run the ranked-keywords sync to populate." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.1em] text-evari-dimmer border-b border-evari-surfaceSoft">
                  <th className="text-left font-medium px-5 py-2">Keyword</th>
                  <th className="text-right font-medium px-3 py-2">Volume</th>
                  <th className="text-right font-medium px-3 py-2">KD</th>
                  <th className="text-right font-medium px-3 py-2">CPC</th>
                  <th className="text-left font-medium px-3 py-2">Intent</th>
                  <th className="text-right font-medium px-3 py-2">Their rank</th>
                  <th className="text-right font-medium px-3 py-2 pr-5">Our rank</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr
                    key={m.keyword}
                    className="border-b border-evari-surface/40 hover:bg-evari-surface/30"
                  >
                    <td className="px-5 py-2">
                      <span className="font-medium text-evari-text">{m.keyword}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-evari-dim">
                      {m.searchVolume != null
                        ? m.searchVolume.toLocaleString('en-GB')
                        : '—'}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right tabular-nums',
                        kdTone(m.keywordDifficulty),
                      )}
                    >
                      {m.keywordDifficulty ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-evari-dim">
                      {m.cpc != null ? `£${m.cpc.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {m.searchIntent ? (
                        <Badge variant="outline" className="text-[10px]">
                          {m.searchIntent}
                        </Badge>
                      ) : (
                        <span className="text-evari-dimmer text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <PositionCell pos={m.theirPosition} />
                    </td>
                    <td className="px-3 py-2 pr-5 text-right tabular-nums">
                      <PositionCell pos={m.ourPosition} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Tab: Backlink profile.
// -----------------------------------------------------------------------------

export function BacklinksTab({
  summary,
  referring,
  target,
}: {
  summary: ReturnType<() => KeywordWorkspace['backlinksByDomain'][string]> | null;
  referring: KeywordWorkspace['referringDomainsByDomain'][string];
  target: string;
}) {
  if (!summary) {
    return (
      <Card>
        <CardContent className="py-10">
          <EmptyPanel
            message={
              target
                ? `No backlink data yet for ${target}. Run the DataForSEO backlinks sync to populate.`
                : 'No target domain set on this list.'
            }
          />
        </CardContent>
      </Card>
    );
  }

  const anchors = summary.anchorTop10 ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<Gauge className="h-4 w-4" />}
          iconTone="text-evari-accent"
          value={summary.rank.toLocaleString('en-GB')}
          unit="rank"
          helper="DataForSEO domain rank"
        />
        <StatTile
          icon={<Link2 className="h-4 w-4" />}
          iconTone="text-evari-gold"
          value={summary.backlinks.toLocaleString('en-GB')}
          unit="backlinks"
          helper="Total inbound links"
        />
        <StatTile
          icon={<Globe className="h-4 w-4" />}
          iconTone="text-evari-accent"
          value={summary.referringDomains.toLocaleString('en-GB')}
          unit="ref domains"
          helper={`${summary.referringMainDomains.toLocaleString('en-GB')} root domains`}
        />
        <StatTile
          icon={<Link2 className="h-4 w-4" />}
          iconTone="text-evari-dim"
          value={
            summary.backlinks > 0 && summary.referringDomains > 0
              ? (summary.backlinks / summary.referringDomains).toFixed(1)
              : '—'
          }
          unit="links/domain"
          helper="Mean backlinks per referring domain"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top anchor texts</CardTitle>
            <p className="text-xs text-evari-dimmer">
              How the web is describing them.
            </p>
          </CardHeader>
          <CardContent className="h-72">
            {anchors.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={anchors.slice(0, 10).map((a) => ({
                    name: a.anchor.length > 22 ? a.anchor.slice(0, 22) + '…' : a.anchor,
                    value: a.backlinks,
                  }))}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    hide
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    width={130}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--evari-surface, #141414)',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" fill="#D4A017" radius={[0, 4, 4, 0]}>
                    {anchors.slice(0, 10).map((_, idx) => (
                      <Cell
                        key={idx}
                        fill={idx === 0 ? '#D4A017' : '#D4A017CC'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyPanel message="No anchor text data available." />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Top referring domains{' '}
              <span className="text-evari-dimmer text-xs">({referring.length})</span>
            </CardTitle>
            <p className="text-xs text-evari-dimmer">
              Ranked by DataForSEO domain rank. Up to 20 shown.
            </p>
          </CardHeader>
          <CardContent className="px-0">
            {referring.length === 0 ? (
              <EmptyPanel message="No referring domain data yet." />
            ) : (
              <div className="overflow-y-auto max-h-[18rem]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-evari-surface">
                    <tr className="text-[11px] uppercase tracking-[0.1em] text-evari-dimmer border-b border-evari-surfaceSoft">
                      <th className="text-left font-medium px-5 py-2">Domain</th>
                      <th className="text-right font-medium px-3 py-2">Rank</th>
                      <th className="text-right font-medium px-3 py-2 pr-5">Backlinks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referring.map((r) => (
                      <tr
                        key={`${r.target}|${r.domainFrom}`}
                        className="border-b border-evari-surface/40 hover:bg-evari-surface/30"
                      >
                        <td className="px-5 py-2">
                          <a
                            href={`https://${r.domainFrom}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-evari-text hover:text-evari-accent"
                          >
                            {r.domainFrom}
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </a>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-evari-dim">
                          {r.rank != null ? r.rank.toLocaleString('en-GB') : '—'}
                        </td>
                        <td className="px-3 py-2 pr-5 text-right tabular-nums text-evari-text">
                          {r.backlinks.toLocaleString('en-GB')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {summary.fetchedAt ? (
        <p className="text-[11px] text-evari-dimmer">
          Backlinks fetched {relativeTime(summary.fetchedAt)} ago.
        </p>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tab: Traffic estimate + top pages.
// -----------------------------------------------------------------------------

export function TrafficTab({
  stats,
  topPages,
  target,
}: {
  stats: TrafficEstimate;
  topPages: KeywordWorkspace['topPagesByDomain'][string];
  target: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<Gauge className="h-4 w-4" />}
          iconTone="text-evari-success"
          value={Math.round(stats.estMonthly).toLocaleString('en-GB')}
          unit="est. visits/mo"
          helper="Across all tracked keywords"
        />
        <StatTile
          icon={<Trophy className="h-4 w-4" />}
          iconTone="text-evari-gold"
          value={stats.top3.toLocaleString('en-GB')}
          unit="top-3"
          helper="Positions 1–3"
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4" />}
          iconTone="text-evari-accent"
          value={stats.top10.toLocaleString('en-GB')}
          unit="top-10"
          helper="Positions 1–10"
        />
        <StatTile
          icon={<GitCompareArrows className="h-4 w-4" />}
          iconTone="text-evari-dim"
          value={stats.rankingKeywords.toLocaleString('en-GB')}
          unit="ranking kw"
          helper={
            stats.avgPosition != null
              ? `Avg #${stats.avgPosition.toFixed(1)}`
              : 'No ranks yet'
          }
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Top ranking pages{' '}
            <span className="text-evari-dimmer text-xs">({topPages.length})</span>
          </CardTitle>
          <p className="text-xs text-evari-dimmer">
            Pages on {target || 'this domain'} ranking for tracked keywords, sorted
            by keyword coverage + monthly volume.
          </p>
        </CardHeader>
        <CardContent className="px-0">
          {topPages.length === 0 ? (
            <EmptyPanel message="No ranking pages yet — sync their ranked keywords to see their top-performing URLs." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.1em] text-evari-dimmer border-b border-evari-surfaceSoft">
                    <th className="text-left font-medium px-5 py-2">URL</th>
                    <th className="text-right font-medium px-3 py-2">Keywords</th>
                    <th className="text-right font-medium px-3 py-2">Total volume</th>
                    <th className="text-right font-medium px-3 py-2 pr-5">Avg rank</th>
                  </tr>
                </thead>
                <tbody>
                  {topPages.map((p) => (
                    <tr
                      key={p.url}
                      className="border-b border-evari-surface/40 hover:bg-evari-surface/30"
                    >
                      <td className="px-5 py-2">
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-evari-text hover:text-evari-accent max-w-[28rem]"
                        >
                          <span className="truncate">{prettyUrl(p.url)}</span>
                          <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
                        </a>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-evari-text">
                        {p.keywordCount}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-evari-dim">
                        {p.totalVolume.toLocaleString('en-GB')}
                      </td>
                      <td className="px-3 py-2 pr-5 text-right tabular-nums">
                        <PositionCell pos={Math.round(p.avgPosition)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers.
// -----------------------------------------------------------------------------

export interface TrafficEstimate {
  estMonthly: number;
  rankingKeywords: number;
  top3: number;
  top10: number;
  avgPosition: number | null;
}

// Rough positional CTR curve (AWR / Advanced Web Ranking 2024 organic CTR study,
// averaged across desktop + mobile UK). Drops off hard after pos 10.
const CTR_CURVE: Record<number, number> = {
  1: 0.304,
  2: 0.154,
  3: 0.099,
  4: 0.068,
  5: 0.05,
  6: 0.039,
  7: 0.031,
  8: 0.025,
  9: 0.021,
  10: 0.019,
};

function ctrFor(pos: number): number {
  if (pos <= 10) return CTR_CURVE[Math.max(1, Math.round(pos))] ?? 0.019;
  if (pos <= 20) return 0.01;
  if (pos <= 50) return 0.003;
  return 0.0005;
}

function estimateTraffic(members: KeywordMember[]): TrafficEstimate {
  let est = 0;
  let ranking = 0;
  let top3 = 0;
  let top10 = 0;
  let posSum = 0;
  let posCount = 0;
  for (const m of members) {
    const pos = m.theirPosition;
    if (pos == null) continue;
    ranking += 1;
    posSum += pos;
    posCount += 1;
    if (pos <= 3) top3 += 1;
    if (pos <= 10) top10 += 1;
    const vol = m.searchVolume ?? 0;
    est += vol * ctrFor(pos);
  }
  return {
    estMonthly: est,
    rankingKeywords: ranking,
    top3,
    top10,
    avgPosition: posCount > 0 ? posSum / posCount : null,
  };
}

function countWeBeat(rows: KeywordMember[]): number {
  return rows.filter(
    (m) => (m.ourPosition ?? 999) < (m.theirPosition ?? 999),
  ).length;
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname + (u.search || '');
  } catch {
    return url;
  }
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return `${Math.floor(diff / 60_000)}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function kdTone(kd: number | null): string {
  if (kd == null) return 'text-evari-dim';
  if (kd < 30) return 'text-evari-success';
  if (kd < 60) return 'text-evari-gold';
  return 'text-evari-danger';
}

// -----------------------------------------------------------------------------
// Tiny presentational helpers.
// -----------------------------------------------------------------------------

export function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number | null;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px',
        active
          ? 'border-evari-accent text-evari-text'
          : 'border-transparent text-evari-dim hover:text-evari-text',
      )}
    >
      {icon}
      <span>{label}</span>
      {count != null ? (
        <span
          className={cn(
            'inline-flex items-center justify-center h-4 min-w-[18px] px-1 text-[10px] tabular-nums rounded-full',
            active
              ? 'bg-evari-accent/20 text-evari-accent'
              : 'bg-evari-surfaceSoft text-evari-dimmer',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function PositionCell({ pos }: { pos: number | null }) {
  if (pos == null) return <span className="text-evari-dimmer">—</span>;
  const tone =
    pos <= 3
      ? 'text-evari-success font-semibold'
      : pos <= 10
        ? 'text-evari-gold'
        : pos <= 30
          ? 'text-evari-text'
          : 'text-evari-dim';
  return <span className={tone}>#{pos}</span>;
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="px-5 py-10 text-center text-sm text-evari-dim">{message}</div>
  );
}
