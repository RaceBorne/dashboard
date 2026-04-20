'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  RefreshCw,
  Trash2,
  Globe,
  User,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  Target,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  KeywordList,
  KeywordMember,
  KeywordWorkspace,
} from '@/lib/keywords/workspace';
import { CompetitorGrid } from './CompetitorGrid';

// -----------------------------------------------------------------------------
// Interactive Keywords workspace: lists + members + charts + inline CRUD.
// -----------------------------------------------------------------------------

interface Props {
  workspace: KeywordWorkspace;
}

type LeaderboardMode = 'all' | 'we-beat-them' | 'they-beat-us' | 'missing';

export function KeywordsWorkspaceClient({ workspace }: Props) {
  const router = useRouter();
  const [activeListId, setActiveListId] = useState<number | null>(
    workspace.lists[0]?.id ?? null,
  );
  const [busy, startTransition] = useTransition();
  const [mode, setMode] = useState<LeaderboardMode>('all');
  const [addKwOpen, setAddKwOpen] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeList = workspace.lists.find((l) => l.id === activeListId) ?? null;
  const members = activeListId != null ? workspace.membersByList[activeListId] ?? [] : [];

  // Competitor lists get a richer filter set (we/they/missing). Own lists
  // show just "all".
  const filteredMembers = useMemo(() => {
    if (!activeList || activeList.kind === 'own') return members;
    switch (mode) {
      case 'we-beat-them':
        return members.filter(
          (m) =>
            m.ourPosition != null &&
            m.theirPosition != null &&
            m.ourPosition < m.theirPosition,
        );
      case 'they-beat-us':
        return members.filter(
          (m) =>
            m.theirPosition != null &&
            (m.ourPosition == null || m.ourPosition > m.theirPosition),
        );
      case 'missing':
        return members.filter((m) => m.ourPosition == null);
      default:
        return members;
    }
  }, [members, mode, activeList]);

  async function refresh() {
    router.refresh();
  }

  async function runIngest(list: KeywordList) {
    if (!list.targetDomain) {
      setError('Can only ingest ranked-keywords for competitor lists with a target domain.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const url = new URL(
        '/api/integrations/dataforseo/ranked-keywords/ingest',
        window.location.origin,
      );
      url.searchParams.set('target', list.targetDomain!);
      url.searchParams.set('listId', String(list.id));
      url.searchParams.set('limit', '200');
      url.searchParams.set('locationCode', String(list.locationCode));
      url.searchParams.set('languageCode', list.languageCode);
      const res = await fetch(url.toString(), { method: 'POST' });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error || 'Ingest failed');
        return;
      }
      refresh();
    });
  }

  async function syncAllCompetitors() {
    setError(null);
    startTransition(async () => {
      const res = await fetch('/api/keywords/sync-competitors?limit=200', { method: 'POST' });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        syncedLists?: number;
        failedLists?: number;
        totalRowsWritten?: number;
        totalCostUsd?: number;
        results?: Array<{ ok: boolean; label: string; error?: string }>;
      };
      if (!data.ok) {
        setError(data.error || 'Sync failed');
        return;
      }
      if (data.failedLists && data.failedLists > 0) {
        const firstFail = data.results?.find((r) => !r.ok);
        setError(
          `${data.syncedLists} synced, ${data.failedLists} failed (e.g. ${firstFail?.label}: ${firstFail?.error}).`,
        );
      }
      refresh();
    });
  }

  async function removeMember(listId: number, keyword: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/keywords/lists/${listId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: [keyword] }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error || 'Remove failed');
        return;
      }
      refresh();
    });
  }

  async function deleteList(list: KeywordList) {
    if (list.slug === 'our-keywords') {
      setError('The "Our keywords" list is the default and cannot be removed.');
      return;
    }
    if (!confirm(`Retire "${list.label}"? Its keywords stay on file but the list is hidden.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/keywords/lists/${list.id}`, { method: 'DELETE' });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error || 'Delete failed');
        return;
      }
      // Move active tab if the current one was deleted.
      if (activeListId === list.id) {
        const remaining = workspace.lists.filter((l) => l.id !== list.id);
        setActiveListId(remaining[0]?.id ?? null);
      }
      refresh();
    });
  }

  if (workspace.lists.length === 0) {
    return (
      <div className="px-6 pt-6 pb-10">
        <Card className="p-10 text-center">
          <CardTitle className="mb-2">No keyword lists yet</CardTitle>
          <p className="text-sm text-evari-dim mb-4">
            Start with your own keywords. Once DataForSEO has ingested some SERP data,
            the seed list is populated automatically.
          </p>
          <Button variant="primary" onClick={() => setNewListOpen(true)}>
            <Plus className="h-4 w-4" /> New list
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-6 pt-6 pb-10 space-y-5">
      {error ? (
        <div className="rounded-md bg-evari-danger/10 text-evari-danger text-sm px-4 py-3 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <CompetitorGrid
        lists={workspace.lists}
        activeListId={activeListId}
        onSelect={setActiveListId}
        onAddCompetitor={() => setNewListOpen(true)}
        busy={busy}
        onSyncOne={runIngest}
        onSyncAll={syncAllCompetitors}
      />

      <ListTabs
        lists={workspace.lists}
        activeListId={activeListId}
        onSelect={setActiveListId}
        onNew={() => setNewListOpen(true)}
      />

      {activeList ? (
        <ListActiveView
          list={activeList}
          members={members}
          filteredMembers={filteredMembers}
          mode={mode}
          setMode={setMode}
          busy={busy}
          onAddKeyword={() => setAddKwOpen(true)}
          onRunIngest={() => runIngest(activeList)}
          onRemoveMember={(kw) => removeMember(activeList.id, kw)}
          onDeleteList={() => deleteList(activeList)}
        />
      ) : null}

      <AddKeywordDialog
        open={addKwOpen}
        onOpenChange={setAddKwOpen}
        list={activeList}
        onDone={refresh}
      />
      <NewListDialog
        open={newListOpen}
        onOpenChange={setNewListOpen}
        onDone={(listId) => {
          setActiveListId(listId);
          refresh();
        }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tabs across the top — one per list.
// -----------------------------------------------------------------------------

function ListTabs({
  lists,
  activeListId,
  onSelect,
  onNew,
}: {
  lists: KeywordList[];
  activeListId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {lists.map((l) => {
        const active = l.id === activeListId;
        const Icon = l.kind === 'own' ? User : Globe;
        return (
          <button
            key={l.id}
            onClick={() => onSelect(l.id)}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap',
              active
                ? 'bg-evari-surfaceSoft text-evari-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                : 'bg-transparent text-evari-dim hover:bg-evari-surface hover:text-evari-text',
            )}
          >
            <Icon className={cn('h-3.5 w-3.5', l.kind === 'own' ? 'text-evari-gold' : 'text-evari-accent')} />
            <span>{l.label}</span>
            <span
              className={cn(
                'inline-flex items-center justify-center h-4 min-w-[18px] px-1 text-[10px] tabular-nums rounded-full',
                active ? 'bg-evari-surface text-evari-dim' : 'bg-evari-surfaceSoft text-evari-dimmer',
              )}
            >
              {l.memberCount}
            </span>
          </button>
        );
      })}
      <button
        onClick={onNew}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-evari-dim hover:text-evari-text hover:bg-evari-surface transition-colors whitespace-nowrap"
      >
        <Plus className="h-3.5 w-3.5" />
        New list
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// The active list's stats, charts, and table.
// -----------------------------------------------------------------------------

function ListActiveView({
  list,
  members,
  filteredMembers,
  mode,
  setMode,
  busy,
  onAddKeyword,
  onRunIngest,
  onRemoveMember,
  onDeleteList,
}: {
  list: KeywordList;
  members: KeywordMember[];
  filteredMembers: KeywordMember[];
  mode: LeaderboardMode;
  setMode: (m: LeaderboardMode) => void;
  busy: boolean;
  onAddKeyword: () => void;
  onRunIngest: () => void;
  onRemoveMember: (keyword: string) => void;
  onDeleteList: () => void;
}) {
  const stats = computeStats(members);
  const intentData = bucketBy(members, (m) => m.searchIntent || 'unknown');
  const priorityData = bucketBy(members, (m) => priorityBucket(m));
  const featuresData = bucketFeatures(members);
  const topByVolume = [...members]
    .filter((m) => m.searchVolume != null)
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
    .slice(0, 10);

  return (
    <>
      {/* Header: title + sync info + actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium text-evari-text">{list.label}</h2>
            <Badge variant={list.kind === 'own' ? 'gold' : 'accent'}>
              {list.kind === 'own' ? 'Us' : list.targetDomain}
            </Badge>
            <span className="text-xs text-evari-dimmer">
              {localeLabel(list.locationCode, list.languageCode)}
            </span>
          </div>
          {list.notes ? (
            <p className="mt-1 text-xs text-evari-dim max-w-2xl">{list.notes}</p>
          ) : null}
          <p className="mt-0.5 text-[11px] text-evari-dimmer">
            {list.lastSyncedAt
              ? `Last synced ${relativeTime(list.lastSyncedAt)} · $${(list.lastSyncCostUsd ?? 0).toFixed(3)}`
              : list.kind === 'competitor'
                ? 'Not synced yet — run ingest to pull ranked keywords.'
                : 'Market data pulled via DataForSEO keyword ingest.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={onAddKeyword} disabled={busy}>
            <Plus className="h-3.5 w-3.5" /> Add keyword
          </Button>
          {list.kind === 'competitor' ? (
            <Button variant="primary" size="sm" onClick={onRunIngest} disabled={busy}>
              <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
              Pull ranked keywords
            </Button>
          ) : null}
          {list.slug !== 'our-keywords' ? (
            <Button variant="ghost" size="sm" onClick={onDeleteList} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" />
              Retire
            </Button>
          ) : null}
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<Target className="h-4 w-4" />}
          iconTone="text-evari-accent"
          value={stats.total.toLocaleString('en-GB')}
          unit="keywords"
          helper={
            stats.trackedHere > 0
              ? `${stats.trackedHere} SERP-tracked`
              : 'None SERP-tracked yet'
          }
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4" />}
          iconTone="text-evari-gold"
          value={stats.totalVolume.toLocaleString('en-GB')}
          unit="/mo"
          helper={`Avg ${Math.round(stats.avgVolume).toLocaleString('en-GB')} per keyword`}
        />
        <StatTile
          icon={<Minus className="h-4 w-4" />}
          iconTone={kdTone(stats.avgDifficulty)}
          value={stats.avgDifficulty != null ? Math.round(stats.avgDifficulty) : '—'}
          unit="avg KD"
          helper={kdLabel(stats.avgDifficulty)}
        />
        {list.kind === 'competitor' ? (
          <StatTile
            icon={<Globe className="h-4 w-4" />}
            iconTone="text-evari-accent"
            value={`${stats.weBeatThem}/${stats.overlap || 0}`}
            unit="we lead"
            helper={
              stats.overlap > 0
                ? `${Math.round((stats.weBeatThem / stats.overlap) * 100)}% of overlap`
                : 'No SERP overlap yet'
            }
          />
        ) : (
          <StatTile
            icon={<User className="h-4 w-4" />}
            iconTone="text-evari-success"
            value={stats.avgPosition != null ? stats.avgPosition.toFixed(1) : '—'}
            unit="avg rank"
            helper={`${stats.top10} in top 10`}
          />
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Search intent</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            <DonutChart data={intentData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Priority mix</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            <DonutChart data={priorityData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top SERP features</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            {featuresData.length > 0 ? (
              <DonutChart data={featuresData} />
            ) : (
              <EmptyChart message="No SERP features tracked yet." />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bar chart row */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Top 10 by monthly volume</CardTitle>
          <span className="text-[11px] text-evari-dimmer">UK / en</span>
        </CardHeader>
        <CardContent className="h-64">
          {topByVolume.length > 0 ? (
            <VolumeBarChart data={topByVolume} />
          ) : (
            <EmptyChart message="No volume data yet — run the keyword ingest." />
          )}
        </CardContent>
      </Card>

      {/* Leaderboard filter (competitor lists only) */}
      {list.kind === 'competitor' ? (
        <LeaderboardFilter mode={mode} setMode={setMode} stats={stats} />
      ) : null}

      {/* Members table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {filteredMembers.length} keyword{filteredMembers.length === 1 ? '' : 's'}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <MembersTable
            list={list}
            members={filteredMembers}
            onRemove={onRemoveMember}
          />
        </CardContent>
      </Card>
    </>
  );
}

// -----------------------------------------------------------------------------
// Stats computation.
// -----------------------------------------------------------------------------

interface Stats {
  total: number;
  trackedHere: number;
  totalVolume: number;
  avgVolume: number;
  avgDifficulty: number | null;
  avgPosition: number | null;
  top10: number;
  weBeatThem: number;
  theyBeatUs: number;
  overlap: number;
  missing: number;
}

function computeStats(members: KeywordMember[]): Stats {
  if (members.length === 0) {
    return {
      total: 0,
      trackedHere: 0,
      totalVolume: 0,
      avgVolume: 0,
      avgDifficulty: null,
      avgPosition: null,
      top10: 0,
      weBeatThem: 0,
      theyBeatUs: 0,
      overlap: 0,
      missing: 0,
    };
  }

  let totalVolume = 0;
  let volumeCount = 0;
  let kdSum = 0;
  let kdCount = 0;
  let posSum = 0;
  let posCount = 0;
  let top10 = 0;
  let weBeatThem = 0;
  let theyBeatUs = 0;
  let overlap = 0;
  let missing = 0;
  let trackedHere = 0;

  for (const m of members) {
    if (m.searchVolume != null) {
      totalVolume += m.searchVolume;
      volumeCount += 1;
    }
    if (m.keywordDifficulty != null) {
      kdSum += m.keywordDifficulty;
      kdCount += 1;
    }
    if (m.ourPosition != null) {
      posSum += m.ourPosition;
      posCount += 1;
      if (m.ourPosition <= 10) top10 += 1;
      trackedHere += 1;
    } else {
      missing += 1;
    }
    if (m.theirPosition != null && m.ourPosition != null) {
      overlap += 1;
      if (m.ourPosition < m.theirPosition) weBeatThem += 1;
      else if (m.theirPosition < m.ourPosition) theyBeatUs += 1;
    }
  }

  return {
    total: members.length,
    trackedHere,
    totalVolume,
    avgVolume: volumeCount > 0 ? totalVolume / volumeCount : 0,
    avgDifficulty: kdCount > 0 ? kdSum / kdCount : null,
    avgPosition: posCount > 0 ? posSum / posCount : null,
    top10,
    weBeatThem,
    theyBeatUs,
    overlap,
    missing,
  };
}

function bucketBy(
  members: KeywordMember[],
  pick: (m: KeywordMember) => string,
): Array<{ name: string; value: number }> {
  const counts: Record<string, number> = {};
  for (const m of members) {
    const k = pick(m);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, value]) => ({ name: prettyLabel(name), value }))
    .sort((a, b) => b.value - a.value);
}

function bucketFeatures(members: KeywordMember[]): Array<{ name: string; value: number }> {
  const counts: Record<string, number> = {};
  for (const m of members) {
    for (const f of m.serpFeatures) {
      counts[f] = (counts[f] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([name, value]) => ({ name: prettyLabel(name), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

function priorityBucket(m: KeywordMember): string {
  // Rough priority heuristic based on volume + KD: high = >500 vol & <50 KD,
  // mid = some-volume, low = everything else.
  const vol = m.searchVolume ?? 0;
  const kd = m.keywordDifficulty ?? 100;
  if (vol >= 500 && kd < 50) return 'high';
  if (vol >= 100) return 'mid';
  return 'low';
}

function prettyLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function kdTone(kd: number | null): string {
  if (kd == null) return 'text-evari-dim';
  if (kd < 30) return 'text-evari-success';
  if (kd < 60) return 'text-evari-gold';
  return 'text-evari-danger';
}

function kdLabel(kd: number | null): string {
  if (kd == null) return 'No difficulty data';
  if (kd < 30) return 'Easy wins';
  if (kd < 60) return 'Medium battle';
  return 'Hard fight';
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return `${Math.floor(diff / 60_000)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function localeLabel(loc: number, lang: string): string {
  // 2826 = UK. Keep simple for now.
  if (loc === 2826) return `Google UK / ${lang}`;
  if (loc === 2840) return `Google US / ${lang}`;
  return `loc ${loc} / ${lang}`;
}

// -----------------------------------------------------------------------------
// Charts.
// -----------------------------------------------------------------------------

const CHART_COLORS = ['#D4A017', '#F97316', '#06B6D4', '#10B981', '#8B5CF6', '#EF4444', '#64748B', '#F59E0B'];

function DonutChart({ data }: { data: Array<{ name: string; value: number }> }) {
  if (data.length === 0) return <EmptyChart message="Nothing to show yet." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={45}
          outerRadius={75}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((_, idx) => (
            <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--evari-surface, #141414)',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function VolumeBarChart({ data }: { data: KeywordMember[] }) {
  const chartData = data.map((m) => ({
    name: m.keyword.length > 24 ? m.keyword.slice(0, 24) + '…' : m.keyword,
    volume: m.searchVolume ?? 0,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 40 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: '#9CA3AF' }}
          interval={0}
          angle={-30}
          textAnchor="end"
          height={60}
        />
        <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--evari-surface, #141414)',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Bar dataKey="volume" fill="#D4A017" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-xs text-evari-dimmer">
      {message}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Leaderboard filter.
// -----------------------------------------------------------------------------

function LeaderboardFilter({
  mode,
  setMode,
  stats,
}: {
  mode: LeaderboardMode;
  setMode: (m: LeaderboardMode) => void;
  stats: Stats;
}) {
  const options: Array<{ key: LeaderboardMode; label: string; count: number }> = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'we-beat-them', label: 'We beat them', count: stats.weBeatThem },
    { key: 'they-beat-us', label: 'They beat us', count: stats.theyBeatUs },
    { key: 'missing', label: 'We don\'t rank', count: stats.missing },
  ];
  return (
    <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1">
      {options.map((o) => {
        const active = mode === o.key;
        return (
          <button
            key={o.key}
            onClick={() => setMode(o.key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap',
              active
                ? 'bg-evari-accent text-white'
                : 'bg-evari-surface text-evari-dim hover:text-evari-text',
            )}
          >
            <span>{o.label}</span>
            <span
              className={cn(
                'inline-flex items-center justify-center h-4 min-w-[18px] px-1 text-[10px] tabular-nums rounded-full',
                active ? 'bg-white/20 text-white' : 'bg-evari-surfaceSoft text-evari-dimmer',
              )}
            >
              {o.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Members table.
// -----------------------------------------------------------------------------

function MembersTable({
  list,
  members,
  onRemove,
}: {
  list: KeywordList;
  members: KeywordMember[];
  onRemove: (keyword: string) => void;
}) {
  const isCompetitor = list.kind === 'competitor';

  if (members.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-evari-dim">
        No keywords match this filter.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.1em] text-evari-dimmer border-b border-evari-surfaceSoft">
            <th className="text-left font-medium px-5 py-2">Keyword</th>
            <th className="text-right font-medium px-3 py-2">Volume</th>
            <th className="text-right font-medium px-3 py-2">KD</th>
            <th className="text-left font-medium px-3 py-2">Intent</th>
            <th className="text-right font-medium px-3 py-2">
              {isCompetitor ? 'Us' : 'Rank'}
            </th>
            {isCompetitor ? (
              <>
                <th className="text-right font-medium px-3 py-2">Them</th>
                <th className="text-right font-medium px-3 py-2">Gap</th>
              </>
            ) : null}
            <th className="text-right font-medium px-3 py-2 pr-5"></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const gap =
              m.ourPosition != null && m.theirPosition != null
                ? m.ourPosition - m.theirPosition
                : null;
            return (
              <tr
                key={m.keyword}
                className="border-b border-evari-surface/40 hover:bg-evari-surface/30"
              >
                <td className="px-5 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-evari-text">{m.keyword}</span>
                    {m.source === 'auto' ? (
                      <Badge variant="outline" className="text-[9px] py-0">auto</Badge>
                    ) : m.source === 'seed' ? (
                      <Badge variant="outline" className="text-[9px] py-0">seed</Badge>
                    ) : m.source === 'gsc' ? (
                      <Badge variant="outline" className="text-[9px] py-0">gsc</Badge>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-evari-dim">
                  {m.searchVolume != null ? m.searchVolume.toLocaleString('en-GB') : '—'}
                </td>
                <td className={cn('px-3 py-2 text-right tabular-nums', kdTone(m.keywordDifficulty))}>
                  {m.keywordDifficulty ?? '—'}
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
                  <PositionCell pos={m.ourPosition} />
                </td>
                {isCompetitor ? (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <PositionCell pos={m.theirPosition} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <GapCell gap={gap} ourMissing={m.ourPosition == null && m.theirPosition != null} />
                    </td>
                  </>
                ) : null}
                <td className="px-3 py-2 pr-5 text-right">
                  <button
                    onClick={() => onRemove(m.keyword)}
                    aria-label={`Remove ${m.keyword}`}
                    className="text-evari-dimmer hover:text-evari-danger transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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

function GapCell({ gap, ourMissing }: { gap: number | null; ourMissing: boolean }) {
  if (ourMissing) {
    return (
      <span className="inline-flex items-center gap-1 text-evari-danger text-xs">
        <TrendingDown className="h-3 w-3" /> not ranking
      </span>
    );
  }
  if (gap == null) return <span className="text-evari-dimmer">—</span>;
  if (gap === 0) return <span className="text-evari-dim">tied</span>;
  if (gap < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-evari-success text-xs">
        <TrendingUp className="h-3 w-3" /> +{Math.abs(gap)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-evari-danger text-xs">
      <TrendingDown className="h-3 w-3" /> -{gap}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Dialogs.
// -----------------------------------------------------------------------------

function AddKeywordDialog({
  open,
  onOpenChange,
  list,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  list: KeywordList | null;
  onDone: () => void;
}) {
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!list) return;
    const keywords = raw
      .split(/[\n,]+/)
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean);
    if (keywords.length === 0) {
      setErr('Enter at least one keyword.');
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/keywords/lists/${list.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords, source: 'manual' }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    setBusy(false);
    if (!data.ok) {
      setErr(data.error || 'Add failed');
      return;
    }
    setRaw('');
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add keywords</DialogTitle>
          <DialogDescription>
            {list
              ? `Add to "${list.label}". One per line or comma-separated.`
              : 'Select a list first.'}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="ebike uk&#10;class 3 electric bike&#10;fastest electric bike 2026"
          className="min-h-[140px] font-mono text-sm"
        />
        {err ? <p className="text-xs text-evari-danger mt-2">{err}</p> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? 'Adding…' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewListDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: (listId: number) => void;
}) {
  const [kind, setKind] = useState<'own' | 'competitor'>('competitor');
  const [label, setLabel] = useState('');
  const [domain, setDomain] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!label.trim()) {
      setErr('Label is required.');
      return;
    }
    if (kind === 'competitor' && !domain.trim()) {
      setErr('Domain is required for competitor lists.');
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch('/api/keywords/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: label.trim(),
        kind,
        target_domain: kind === 'competitor' ? domain.trim() : null,
        notes: notes.trim() || null,
      }),
    });
    const data = (await res.json()) as { ok: boolean; list?: { id: number }; error?: string };
    setBusy(false);
    if (!data.ok || !data.list) {
      setErr(data.error || 'Create failed');
      return;
    }
    setLabel('');
    setDomain('');
    setNotes('');
    onOpenChange(false);
    onDone(data.list.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New keyword list</DialogTitle>
          <DialogDescription>
            Lists scope a comparison. Every keyword in a list is tracked in the same locale.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setKind('competitor')}
              className={cn(
                'flex-1 px-3 py-2 rounded-md text-xs text-left transition-colors',
                kind === 'competitor'
                  ? 'bg-evari-accent text-white'
                  : 'bg-evari-surface text-evari-dim hover:text-evari-text',
              )}
            >
              <div className="font-medium">Competitor</div>
              <div className="opacity-80">Track a rival domain</div>
            </button>
            <button
              onClick={() => setKind('own')}
              className={cn(
                'flex-1 px-3 py-2 rounded-md text-xs text-left transition-colors',
                kind === 'own'
                  ? 'bg-evari-gold text-evari-goldInk'
                  : 'bg-evari-surface text-evari-dim hover:text-evari-text',
              )}
            >
              <div className="font-medium">Own</div>
              <div className="opacity-80">A curated Evari list</div>
            </button>
          </div>
          <div>
            <label className="text-xs text-evari-dim">Label</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Fuell" />
          </div>
          {kind === 'competitor' ? (
            <div>
              <label className="text-xs text-evari-dim">Domain</label>
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="fuell.us"
              />
            </div>
          ) : null}
          <div>
            <label className="text-xs text-evari-dim">Notes (optional)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why is this list interesting?"
              className="min-h-[64px]"
            />
          </div>
          {err ? <p className="text-xs text-evari-danger">{err}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? 'Creating…' : 'Create list'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
