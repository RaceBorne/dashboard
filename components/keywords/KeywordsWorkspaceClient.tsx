'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Trash2,
  X,
  ExternalLink,
  Trophy,
  GitCompareArrows,
  Link2,
  Gauge,
  List,
  LayoutGrid,
  MessageSquare,
} from 'lucide-react';
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
import { CompetitorSidebar } from './CompetitorSidebar';
import {
  CompetitorDetail,
  BacklinksTab,
  TrafficTab,
  TabButton,
} from './CompetitorDetail';
import { KeywordStrategyChat } from './KeywordStrategyChat';

// -----------------------------------------------------------------------------
// Interactive Keywords workspace: lists + members + charts + inline CRUD.
// -----------------------------------------------------------------------------

interface Props {
  workspace: KeywordWorkspace;
}

type TopTab = 'workspace' | 'strategy';

export function KeywordsWorkspaceClient({ workspace }: Props) {
  const router = useRouter();
  const [activeListId, setActiveListId] = useState<number | null>(
    workspace.lists[0]?.id ?? null,
  );
  const [topTab, setTopTab] = useState<TopTab>('workspace');
  const [busy, startTransition] = useTransition();
  const [addKwOpen, setAddKwOpen] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const [editList, setEditList] = useState<KeywordList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeList = workspace.lists.find((l) => l.id === activeListId) ?? null;
  const members = activeListId != null ? workspace.membersByList[activeListId] ?? [] : [];

  /**
   * Re-read the workspace after a mutation.
   *
   * router.refresh() is supposed to re-run the RSC and flow fresh props,
   * but in practice on Next.js 16 + our Supabase read path the freshly
   * inserted rows sometimes don't show up until a hard reload — the
   * Add-keyword dialog has been the visible symptom (#187). Hard reload
   * is a touch heavy but it is guaranteed to pick up anything the DB
   * just wrote. Single workspace page, sub-second load, trade-off is
   * fine.
   */
  async function refresh() {
    window.location.reload();
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
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      <TopTabBar tab={topTab} setTab={setTopTab} />

      {topTab === 'strategy' ? (
        <KeywordStrategyChat workspace={workspace} />
      ) : (
        <div className="flex flex-1 min-h-0">
          <CompetitorSidebar
            lists={workspace.lists}
            activeListId={activeListId}
            onSelect={setActiveListId}
            onAddCompetitor={() => setNewListOpen(true)}
            onSyncAll={syncAllCompetitors}
            onEditList={(l) => setEditList(l)}
            busy={busy}
          />

          <main className="flex-1 min-w-0 flex flex-col">
        {error ? (
          <div className="mx-6 mt-4 rounded-md bg-evari-danger/10 text-evari-danger text-sm px-4 py-3 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {activeList == null ? (
          <div className="flex-1 flex items-center justify-center px-6 py-16">
            <div className="text-center max-w-sm">
              <p className="text-sm text-evari-dim">
                Select a competitor from the sidebar, or add one to start tracking.
              </p>
              <Button
                variant="primary"
                size="sm"
                className="mt-3"
                onClick={() => setNewListOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Add competitor
              </Button>
            </div>
          </div>
        ) : activeList.kind === 'competitor' ? (
          <CompetitorDetail
            list={activeList}
            members={members}
            workspace={workspace}
            busy={busy}
            onAddKeyword={() => setAddKwOpen(true)}
            onRunIngest={() => runIngest(activeList)}
            onDeleteList={() => deleteList(activeList)}
          />
        ) : (
          <div className="flex-1 min-w-0 px-4 pt-6 pb-10 space-y-5 overflow-x-hidden">
            <ListActiveView
              list={activeList}
              members={members}
              workspace={workspace}
              busy={busy}
              onAddKeyword={() => setAddKwOpen(true)}
              onRemoveMember={(kw) => removeMember(activeList.id, kw)}
              onDeleteList={() => deleteList(activeList)}
            />
          </div>
        )}
          </main>
        </div>
      )}

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
      <EditListDialog
        list={editList}
        onOpenChange={(open) => {
          if (!open) setEditList(null);
        }}
        onDone={() => {
          setEditList(null);
          refresh();
        }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// The active "own" list view. Matches the competitor AllKeywordsTab column
// layout — same dense table, same info, just no "Them" column because there's
// nothing to compare against on an own list.
// -----------------------------------------------------------------------------

function ListActiveView({
  list,
  members,
  workspace,
  busy,
  onAddKeyword,
  onRemoveMember,
  onDeleteList,
}: {
  list: KeywordList;
  members: KeywordMember[];
  workspace: KeywordWorkspace;
  busy: boolean;
  onAddKeyword: () => void;
  onRemoveMember: (keyword: string) => void;
  onDeleteList: () => void;
}) {
  const [tab, setTab] = useState<'all' | 'wins' | 'backlinks' | 'traffic'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? members.filter((m) => m.keyword.includes(q)) : members;
    // Sort by our position (best first), nulls last, then volume desc.
    return [...base].sort((a, b) => {
      const ap = a.ourPosition ?? Number.POSITIVE_INFINITY;
      const bp = b.ourPosition ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      return (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
    });
  }, [members, search]);

  // Equivalent stats for the Own side — same shape the competitor view uses,
  // but computed off `ourPosition` instead of `theirPosition`.
  const trafficStats = useMemo(() => estimateOwnTraffic(members), [members]);
  const keywordsWeWin = useMemo(
    () =>
      members
        .filter((m) => m.ourPosition != null && m.ourPosition <= 10)
        .sort((a, b) => (a.ourPosition ?? 999) - (b.ourPosition ?? 999)),
    [members],
  );
  const top3Count = useMemo(
    () => members.filter((m) => m.ourPosition != null && m.ourPosition <= 3).length,
    [members],
  );

  // Our own backlinks + top pages (evari.cc), looked up via the same maps the
  // competitor view uses. Will be null / [] if we haven't synced backlinks or
  // ranked keywords for our own domain.
  const target = (list.targetDomain ?? '').toLowerCase();
  const backlinks = target ? workspace.backlinksByDomain[target] ?? null : null;
  const referring = target ? workspace.referringDomainsByDomain[target] ?? [] : [];
  const topPages = target ? workspace.topPagesByDomain[target] ?? [] : [];

  return (
    <>
      {/* Header — mirrors the competitor layout: title + badge + meta line,
          actions on the right. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-lg font-medium text-evari-text truncate">{list.label}</h2>
            <Badge variant="gold">Us</Badge>
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
              ? `Last synced ${relativeTime(list.lastSyncedAt)}`
              : 'Market data pulled via DataForSEO keyword ingest.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={onAddKeyword} disabled={busy}>
            <Plus className="h-3.5 w-3.5" /> Add keyword
          </Button>
          {list.slug !== 'our-keywords' ? (
            <Button variant="ghost" size="sm" onClick={onDeleteList} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" />
              Retire
            </Button>
          ) : null}
        </div>
      </div>

      {/* Headline stat tiles — identical shape/styling to the competitor view
          (4 tiles, same grid, same icons + tones). Numbers swapped for our
          own positions + our domain's backlinks. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<Trophy className="h-4 w-4" />}
          iconTone="text-evari-gold"
          value={keywordsWeWin.length.toLocaleString('en-GB')}
          unit="keywords we win"
          helper={`of ${members.length} tracked`}
        />
        <StatTile
          icon={<GitCompareArrows className="h-4 w-4" />}
          iconTone="text-evari-accent"
          value={top3Count.toLocaleString('en-GB')}
          unit="top-3"
          helper={
            keywordsWeWin.length > 0
              ? `${Math.round((top3Count / keywordsWeWin.length) * 100)}% of wins`
              : 'Positions 1–3'
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

      {/* Tab bar — same four-tab layout as the competitor view. Overlap is
          gone from both sides; the remaining four tabs mirror one-for-one. */}
      <div className="flex items-center gap-1 border-b border-evari-surfaceSoft">
        <TabButton
          active={tab === 'all'}
          onClick={() => setTab('all')}
          icon={<List className="h-3.5 w-3.5" />}
          label="All keywords"
          count={members.length}
        />
        <TabButton
          active={tab === 'wins'}
          onClick={() => setTab('wins')}
          icon={<Trophy className="h-3.5 w-3.5" />}
          label="Keywords we win"
          count={keywordsWeWin.length}
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
        // Full keyword dump — identical column layout to the competitor's
        // AllKeywordsTab minus the "Them" column.
        <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Every keyword we track</CardTitle>
            <p className="text-xs text-evari-dimmer">
              {filtered.length.toLocaleString('en-GB')} of{' '}
              {members.length.toLocaleString('en-GB')} shown. Sorted by our
              search rank.
            </p>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter keywords…"
            className="h-8 w-48 rounded-md bg-evari-surface border border-evari-surfaceSoft px-2.5 text-xs text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:ring-1 focus:ring-evari-accent"
          />
        </CardHeader>
        <CardContent className="px-0">
          {members.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-evari-dim">
              No keywords yet. Click{' '}
              <span className="font-medium">Add keyword</span> to start tracking.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm table-fixed">
                <colgroup>
                  <col className="w-12" /> {/* Us */}
                  <col /> {/* Keyword + URL */}
                  <col className="w-20" /> {/* Volume */}
                  <col className="w-12" /> {/* KD */}
                  <col className="w-16" /> {/* CPC */}
                  <col className="w-16" /> {/* Comp */}
                  <col className="w-24" /> {/* Intent */}
                  <col className="w-20" /> {/* Est. traffic */}
                  <col className="w-10" /> {/* Remove */}
                </colgroup>
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.1em] text-evari-dimmer border-b border-evari-surfaceSoft">
                    <th className="text-right font-medium px-2 py-2">Us</th>
                    <th className="text-left font-medium px-3 py-2">Keyword / page</th>
                    <th className="text-right font-medium px-2 py-2">Volume</th>
                    <th className="text-right font-medium px-2 py-2">KD</th>
                    <th className="text-right font-medium px-2 py-2">CPC</th>
                    <th
                      className="text-right font-medium px-2 py-2"
                      title="Paid search competition (0–1)"
                    >
                      Comp
                    </th>
                    <th className="text-left font-medium px-2 py-2">Intent</th>
                    <th
                      className="text-right font-medium px-2 py-2"
                      title="Estimated monthly visits = volume × CTR at our rank"
                    >
                      Est. traffic
                    </th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const estTraffic =
                      m.ourPosition != null && m.searchVolume != null
                        ? m.searchVolume * ctrFor(m.ourPosition)
                        : null;
                    return (
                      <tr
                        key={m.keyword}
                        className="border-b border-evari-surface/40 hover:bg-evari-surface/30 align-top"
                      >
                        <td className="px-2 py-2 text-right tabular-nums">
                          <PositionCell pos={m.ourPosition} />
                        </td>
                        <td className="px-3 py-2 min-w-0">
                          <div
                            className="font-medium text-evari-text truncate"
                            title={m.keyword}
                          >
                            {m.keyword}
                          </div>
                          {m.ourUrl ? (
                            <a
                              href={m.ourUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-0.5 flex items-center gap-1 text-[11px] text-evari-dimmer hover:text-evari-accent truncate"
                              title={m.ourUrl}
                            >
                              <span className="truncate">{prettyPath(m.ourUrl)}</span>
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
                        <td
                          className={cn(
                            'px-2 py-2 text-right tabular-nums',
                            compTone(m.competition),
                          )}
                        >
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
                        <td className="px-2 py-2 text-right tabular-nums text-evari-text">
                          {estTraffic != null
                            ? Math.round(estTraffic).toLocaleString('en-GB')
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            onClick={() => onRemoveMember(m.keyword)}
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
          )}
        </CardContent>
      </Card>
      ) : tab === 'wins' ? (
        <KeywordsWeWinTab rows={keywordsWeWin} onRemoveMember={onRemoveMember} />
      ) : tab === 'backlinks' ? (
        <BacklinksTab summary={backlinks} referring={referring} target={target} />
      ) : (
        <TrafficTab stats={trafficStats} topPages={topPages} target={target} />
      )}
    </>
  );
}

// -----------------------------------------------------------------------------
// Keywords we win — our top-10 rankings, parallel to the competitor's
// KeywordsTheyWinTab. Sorted by our position (best wins first).
// -----------------------------------------------------------------------------

function KeywordsWeWinTab({
  rows,
  onRemoveMember,
}: {
  rows: KeywordMember[];
  onRemoveMember: (keyword: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Keywords we rank top-10 for</CardTitle>
        <p className="text-xs text-evari-dimmer">
          Sorted by our position (best first). These are the wins worth defending.
        </p>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-evari-dim">
            No top-10 rankings yet. Once DataForSEO has a SERP snapshot for
            your keywords, wins will show up here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.1em] text-evari-dimmer border-b border-evari-surfaceSoft">
                  <th className="text-right font-medium px-5 py-2">Our rank</th>
                  <th className="text-left font-medium px-3 py-2">Keyword / page</th>
                  <th className="text-right font-medium px-3 py-2">Volume</th>
                  <th className="text-right font-medium px-3 py-2">KD</th>
                  <th className="text-right font-medium px-3 py-2">CPC</th>
                  <th className="text-left font-medium px-3 py-2">Intent</th>
                  <th
                    className="text-right font-medium px-3 py-2 pr-5"
                    title="Estimated monthly visits = volume × CTR at our rank"
                  >
                    Est. traffic
                  </th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const estTraffic =
                    m.ourPosition != null && m.searchVolume != null
                      ? m.searchVolume * ctrFor(m.ourPosition)
                      : null;
                  return (
                    <tr
                      key={m.keyword}
                      className="border-b border-evari-surface/40 hover:bg-evari-surface/30 align-top"
                    >
                      <td className="px-5 py-2 text-right tabular-nums">
                        <PositionCell pos={m.ourPosition} />
                      </td>
                      <td className="px-3 py-2 min-w-0">
                        <div
                          className="font-medium text-evari-text truncate"
                          title={m.keyword}
                        >
                          {m.keyword}
                        </div>
                        {m.ourUrl ? (
                          <a
                            href={m.ourUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 flex items-center gap-1 text-[11px] text-evari-dimmer hover:text-evari-accent truncate"
                            title={m.ourUrl}
                          >
                            <span className="truncate">{prettyPath(m.ourUrl)}</span>
                            <ExternalLink className="h-2.5 w-2.5 opacity-60 shrink-0" />
                          </a>
                        ) : null}
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
                      <td className="px-3 py-2 pr-5 text-right tabular-nums text-evari-text">
                        {estTraffic != null
                          ? Math.round(estTraffic).toLocaleString('en-GB')
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => onRemoveMember(m.keyword)}
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
        )}
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Helpers shared with the Own-list table. Keyword-difficulty + paid-competition
// colour tones, relative-time formatter, URL path prettifier, CTR curve.
// Kept local so this file stays self-contained — the competitor view has its
// own copies in CompetitorDetail.tsx.
// -----------------------------------------------------------------------------

function kdTone(kd: number | null): string {
  if (kd == null) return 'text-evari-dim';
  if (kd < 30) return 'text-evari-success';
  if (kd < 60) return 'text-evari-gold';
  return 'text-evari-danger';
}

function compTone(comp: number | null): string {
  if (comp == null) return 'text-evari-dim';
  if (comp < 0.33) return 'text-evari-success';
  if (comp < 0.66) return 'text-evari-gold';
  return 'text-evari-danger';
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return `${Math.floor(diff / 60_000)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function prettyPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? u.host : u.pathname + (u.search || '');
  } catch {
    return url;
  }
}

// AWR 2024 organic CTR curve (UK, desktop + mobile average). Drops off hard
// after pos 10 — same numbers used in CompetitorDetail.tsx.
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

// Sum of (volume × CTR) across every keyword we rank for. Mirrors the
// competitor-side estimateTraffic() but walks ourPosition instead. Returns
// the same TrafficEstimate shape the shared TrafficTab expects.
function estimateOwnTraffic(members: KeywordMember[]): {
  estMonthly: number;
  rankingKeywords: number;
  top3: number;
  top10: number;
  avgPosition: number | null;
} {
  let est = 0;
  let ranking = 0;
  let top3 = 0;
  let top10 = 0;
  let posSum = 0;
  for (const m of members) {
    const pos = m.ourPosition;
    if (pos == null) continue;
    ranking += 1;
    posSum += pos;
    if (pos <= 3) top3 += 1;
    if (pos <= 10) top10 += 1;
    est += (m.searchVolume ?? 0) * ctrFor(pos);
  }
  return {
    estMonthly: est,
    rankingKeywords: ranking,
    top3,
    top10,
    avgPosition: ranking > 0 ? posSum / ranking : null,
  };
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

// -----------------------------------------------------------------------------
// Top-level page tab bar — toggles between the competitor/list workspace
// (sidebar + detail) and the strategy chat. Sits above both views so Craig
// can flip without losing either one.
// -----------------------------------------------------------------------------

function TopTabBar({
  tab,
  setTab,
}: {
  tab: TopTab;
  setTab: (t: TopTab) => void;
}) {
  return (
    <div className="flex items-center gap-1 px-4 pt-3 border-b border-evari-surfaceSoft">
      <TopTabButton
        active={tab === 'workspace'}
        onClick={() => setTab('workspace')}
        icon={<LayoutGrid className="h-3.5 w-3.5" />}
        label="Workspace"
      />
      <TopTabButton
        active={tab === 'strategy'}
        onClick={() => setTab('strategy')}
        icon={<MessageSquare className="h-3.5 w-3.5" />}
        label="Ideas"
      />
    </div>
  );
}

function TopTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
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
    </button>
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

// -----------------------------------------------------------------------------
// Edit dialog: rename a list or tweak its notes. Opened from the pencil icon
// in the sidebar. Domain is intentionally read-only — changing the target
// domain mid-flight would orphan every previously-ingested row.
// -----------------------------------------------------------------------------

function EditListDialog({
  list,
  onOpenChange,
  onDone,
}: {
  list: KeywordList | null;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset the form whenever a new list is opened.
  useEffect(() => {
    if (list) {
      setLabel(list.label);
      setNotes(list.notes ?? '');
      setErr(null);
    }
  }, [list]);

  const open = list != null;
  const isOwnSeed = list?.slug === 'our-keywords';

  async function submit() {
    if (!list) return;
    if (!label.trim()) {
      setErr('Label is required.');
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/keywords/lists/${list.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: label.trim(),
        notes: notes.trim() || null,
      }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    setBusy(false);
    if (!data.ok) {
      setErr(data.error || 'Update failed');
      return;
    }
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit list</DialogTitle>
          <DialogDescription>
            Rename the list or tweak its notes. The target domain stays fixed —
            changing it would orphan previously-ingested keyword data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-evari-dim">Label</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Fuell"
              disabled={isOwnSeed}
            />
            {isOwnSeed ? (
              <p className="mt-1 text-[11px] text-evari-dimmer">
                The seed &ldquo;Our keywords&rdquo; list can&rsquo;t be renamed.
              </p>
            ) : null}
          </div>
          {list?.targetDomain ? (
            <div>
              <label className="text-xs text-evari-dim">Domain</label>
              <Input value={list.targetDomain} disabled />
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
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
