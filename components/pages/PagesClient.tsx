'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ExternalLink,
  FileText,
  Filter,
  Globe,
  Image as ImageIcon,
  Info,
  Newspaper,
  Search as SearchIcon,
  ShoppingBag,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatTile } from '@/components/ui/stat-tile';
import {
  DrawerKV,
  DrawerSection,
  RightDrawer,
} from '@/components/shopify/RightDrawer';
import { cn, formatNumber, relativeTime } from '@/lib/utils';
import type { PageOverviewRow, PagesOverview } from '@/lib/pages/overview';
import type { EntityType, CheckSeverity } from '@/lib/seo/types';

/**
 * `/pages` — master per-URL cockpit.
 *
 * Hero-strip stats → coverage bars → full filterable / sortable table of
 * every product + page + article with SEO findings, meta lens, image alt
 * coverage and (stub) Google Search Console columns. Clicking a row opens
 * a detail drawer with a SERP preview and the full finding list for that
 * entity.
 */

type SortKey =
  | 'title'
  | 'type'
  | 'issues'
  | 'metaTitleLen'
  | 'metaDescLen'
  | 'updatedAt'
  | 'impressions'
  | 'clicks'
  | 'position';

type SortDir = 'asc' | 'desc';

interface SortState {
  key: SortKey;
  dir: SortDir;
}

type TypeFilter = 'all' | EntityType;
type IssueFilter = 'all' | 'with-issues' | 'critical' | 'no-meta-title' | 'no-meta-desc' | 'no-alt' | 'clean';

const TITLE_IDEAL_MIN = 30;
const TITLE_IDEAL_MAX = 60;
const DESC_IDEAL_MIN = 120;
const DESC_IDEAL_MAX = 160;

const ENTITY_ICON: Record<EntityType, React.ComponentType<{ className?: string }>> = {
  product: ShoppingBag,
  page: FileText,
  article: Newspaper,
};

const ENTITY_LABEL: Record<EntityType, string> = {
  product: 'Product',
  page: 'Page',
  article: 'Article',
};

const SEVERITY_LABEL: Record<CheckSeverity, string> = {
  A: 'Critical',
  B: 'Warn',
  C: 'Nice-to-have',
};

const SEVERITY_DOT: Record<CheckSeverity, string> = {
  A: 'bg-evari-danger',
  B: 'bg-evari-warn',
  C: 'bg-sky-400',
};

export function PagesClient({ overview }: { overview: PagesOverview }) {
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>('all');
  const [issueFilter, setIssueFilter] = React.useState<IssueFilter>('all');
  const [sort, setSort] = React.useState<SortState>({ key: 'issues', dir: 'desc' });
  const [activeRow, setActiveRow] = React.useState<PageOverviewRow | null>(null);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return overview.rows.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (issueFilter === 'with-issues' && r.totalIssues === 0) return false;
      if (issueFilter === 'critical' && r.issuesBySeverity.A === 0) return false;
      if (issueFilter === 'no-meta-title' && r.metaTitle) return false;
      if (issueFilter === 'no-meta-desc' && r.metaDescription) return false;
      if (
        issueFilter === 'no-alt' &&
        !(r.hasFeaturedImage && !r.imageAltText)
      )
        return false;
      if (issueFilter === 'clean' && r.totalIssues !== 0) return false;
      if (q) {
        const hay =
          (r.title + ' ' + r.path + ' ' + r.handle + ' ' + (r.metaTitle ?? ''))
            .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [overview.rows, search, typeFilter, issueFilter]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => compareRows(a, b, sort));
    return arr;
  }, [filtered, sort]);

  return (
    <div className="p-6 max-w-[1600px] space-y-5">
      {overview.warnings.length > 0 && (
        <div className="rounded-md bg-evari-warn/15 ring-1 ring-evari-warn/30 px-4 py-3 text-sm text-evari-text">
          <div className="font-medium mb-1">Some reads did not complete</div>
          <ul className="list-disc pl-5 space-y-0.5 text-xs text-evari-dim">
            {overview.warnings.map((m, i) => (
              <li key={i} className="font-mono">
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      <HeroStrip overview={overview} />

      <CoverageRow overview={overview} />

      <section className="rounded-xl bg-evari-surface overflow-hidden">
        <FiltersBar
          total={overview.rows.length}
          shown={sorted.length}
          search={search}
          setSearch={setSearch}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          issueFilter={issueFilter}
          setIssueFilter={setIssueFilter}
          scannedAt={overview.scannedAt}
          totals={overview.totals}
        />

        <PagesTable
          rows={sorted}
          sort={sort}
          setSort={setSort}
          gscConnected={overview.gscConnected}
          onSelect={setActiveRow}
        />

        {sorted.length === 0 && (
          <div className="px-8 py-16 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-evari-surfaceSoft mb-3">
              <SearchIcon className="h-4 w-4 text-evari-dimmer" />
            </div>
            <p className="text-sm text-evari-dim">
              {overview.rows.length === 0
                ? 'No URLs found. Connect Shopify to populate this view.'
                : 'No URLs match the current filters.'}
            </p>
          </div>
        )}
      </section>

      {!overview.gscConnected && <ConnectGoogleCallout />}

      <PageDetailDrawer
        row={activeRow}
        onClose={() => setActiveRow(null)}
        gscConnected={overview.gscConnected}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero strip (top stat row)
// ---------------------------------------------------------------------------

function HeroStrip({ overview }: { overview: PagesOverview }) {
  const t = overview.totals;
  const coveragePct = t.total > 0 ? ((t.total - t.withIssues) / t.total) * 100 : 100;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatTile
        icon={<Globe className="h-4 w-4" />}
        iconTone="text-evari-text"
        value={formatNumber(t.total)}
        helper={
          <span>
            <span className="text-evari-dim">{t.products}</span> products ·{' '}
            <span className="text-evari-dim">{t.pages}</span> pages ·{' '}
            <span className="text-evari-dim">{t.articles}</span> articles
          </span>
        }
      />
      <StatTile
        icon={<Sparkles className="h-4 w-4" />}
        iconTone={
          coveragePct >= 95
            ? 'text-evari-success'
            : coveragePct >= 75
              ? 'text-evari-warn'
              : 'text-evari-danger'
        }
        value={Math.round(coveragePct) + '%'}
        helper={
          <span>
            <span className="text-evari-text font-mono tabular-nums">
              {t.total - t.withIssues}
            </span>
            /{t.total} URLs clean
          </span>
        }
      />
      <StatTile
        icon={<Type className="h-4 w-4" />}
        iconTone="text-evari-text"
        value={t.avgMetaTitleLen || '—'}
        unit="chars"
        helper={
          <MetaLengthHelper
            average={t.avgMetaTitleLen}
            missing={t.missingMetaTitle}
            total={t.total}
            idealMin={TITLE_IDEAL_MIN}
            idealMax={TITLE_IDEAL_MAX}
            label="avg meta title"
          />
        }
      />
      <StatTile
        icon={<FileText className="h-4 w-4" />}
        iconTone="text-evari-text"
        value={t.avgMetaDescLen || '—'}
        unit="chars"
        helper={
          <MetaLengthHelper
            average={t.avgMetaDescLen}
            missing={t.missingMetaDesc}
            total={t.total}
            idealMin={DESC_IDEAL_MIN}
            idealMax={DESC_IDEAL_MAX}
            label="avg meta description"
          />
        }
      />
    </div>
  );
}

function MetaLengthHelper({
  average,
  missing,
  total,
  idealMin,
  idealMax,
  label,
}: {
  average: number;
  missing: number;
  total: number;
  idealMin: number;
  idealMax: number;
  label: string;
}) {
  if (average === 0) {
    return <span>No {label} data yet</span>;
  }
  const ok = average >= idealMin && average <= idealMax;
  return (
    <span>
      <span className={ok ? 'text-evari-success' : 'text-evari-warn'}>
        {ok
          ? `in ${idealMin}–${idealMax} band`
          : average < idealMin
            ? `under ${idealMin}`
            : `over ${idealMax}`}
      </span>
      {missing > 0 && (
        <span className="text-evari-dim">
          {' · '}
          <span className="text-evari-warn font-mono tabular-nums">{missing}</span>
          /{total} missing
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Coverage row — severity + type breakdown as horizontal bars
// ---------------------------------------------------------------------------

function CoverageRow({ overview }: { overview: PagesOverview }) {
  const t = overview.totals;

  // Type mix — fractional widths of one single bar
  const typeSegs = [
    { key: 'product', label: 'Products', count: t.products, color: 'bg-evari-gold' },
    { key: 'page', label: 'Pages', count: t.pages, color: 'bg-sky-500' },
    {
      key: 'article',
      label: 'Articles',
      count: t.articles,
      color: 'bg-evari-accent',
    },
  ];
  const typeTotal = Math.max(1, t.total);

  // Severity mix
  const sevTotal = t.bySeverity.A + t.bySeverity.B + t.bySeverity.C;
  const sevSegs = [
    { key: 'A', label: 'Critical', count: t.bySeverity.A, color: 'bg-evari-danger' },
    { key: 'B', label: 'Warn', count: t.bySeverity.B, color: 'bg-evari-warn' },
    { key: 'C', label: 'Nice-to-have', count: t.bySeverity.C, color: 'bg-sky-400' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-xl bg-evari-surface p-5">
        <header className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-evari-text tracking-tight">
            URL mix
          </h2>
          <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
            {formatNumber(t.total)} total
          </span>
        </header>
        <div className="h-2.5 w-full rounded-full overflow-hidden bg-evari-surfaceSoft flex">
          {typeSegs.map(
            (s) =>
              s.count > 0 && (
                <div
                  key={s.key}
                  className={s.color}
                  style={{ width: (s.count / typeTotal) * 100 + '%' }}
                />
              ),
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
          {typeSegs.map((s) => (
            <LegendSwatch
              key={s.key}
              color={s.color}
              label={s.label}
              value={s.count}
              total={t.total}
            />
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-evari-surface p-5">
        <header className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-evari-text tracking-tight">
            Issue severity
          </h2>
          <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
            {sevTotal === 0 ? 'all clean' : `${sevTotal} findings`}
          </span>
        </header>
        {sevTotal === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-evari-success">
            <Check className="h-4 w-4" />
            Every URL passes the current checks.
          </div>
        ) : (
          <>
            <div className="h-2.5 w-full rounded-full overflow-hidden bg-evari-surfaceSoft flex">
              {sevSegs.map(
                (s) =>
                  s.count > 0 && (
                    <div
                      key={s.key}
                      className={s.color}
                      style={{ width: (s.count / sevTotal) * 100 + '%' }}
                    />
                  ),
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
              {sevSegs.map((s) => (
                <LegendSwatch
                  key={s.key}
                  color={s.color}
                  label={s.label}
                  value={s.count}
                  total={sevTotal}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LegendSwatch({
  color,
  label,
  value,
  total,
}: {
  color: string;
  label: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <span className="inline-flex items-center gap-1.5 text-evari-dim">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      <span className="text-evari-text">{label}</span>
      <span className="font-mono tabular-nums">{formatNumber(value)}</span>
      <span className="text-evari-dimmer">({Math.round(pct)}%)</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Filters bar
// ---------------------------------------------------------------------------

function FiltersBar({
  total,
  shown,
  search,
  setSearch,
  typeFilter,
  setTypeFilter,
  issueFilter,
  setIssueFilter,
  scannedAt,
  totals,
}: {
  total: number;
  shown: number;
  search: string;
  setSearch: (v: string) => void;
  typeFilter: TypeFilter;
  setTypeFilter: (v: TypeFilter) => void;
  issueFilter: IssueFilter;
  setIssueFilter: (v: IssueFilter) => void;
  scannedAt: string | null;
  totals: PagesOverview['totals'];
}) {
  return (
    <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-evari-edge/30">
      <div className="relative flex-1 min-w-[240px]">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dimmer" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, path, handle, meta title…"
          className="pl-8 h-8 text-xs"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-evari-dimmer hover:text-evari-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        <FilterChip
          active={typeFilter === 'all'}
          onClick={() => setTypeFilter('all')}
        >
          All types
        </FilterChip>
        <FilterChip
          active={typeFilter === 'product'}
          onClick={() => setTypeFilter('product')}
        >
          Products · {totals.products}
        </FilterChip>
        <FilterChip
          active={typeFilter === 'page'}
          onClick={() => setTypeFilter('page')}
        >
          Pages · {totals.pages}
        </FilterChip>
        <FilterChip
          active={typeFilter === 'article'}
          onClick={() => setTypeFilter('article')}
        >
          Articles · {totals.articles}
        </FilterChip>
      </div>

      <div className="flex items-center gap-1">
        <FilterChip
          active={issueFilter === 'all'}
          onClick={() => setIssueFilter('all')}
        >
          <Filter className="h-3 w-3" /> Any
        </FilterChip>
        <FilterChip
          active={issueFilter === 'with-issues'}
          onClick={() => setIssueFilter('with-issues')}
        >
          With issues · {totals.withIssues}
        </FilterChip>
        <FilterChip
          active={issueFilter === 'critical'}
          onClick={() => setIssueFilter('critical')}
          tone="danger"
        >
          Critical · {totals.bySeverity.A}
        </FilterChip>
        <FilterChip
          active={issueFilter === 'no-meta-title'}
          onClick={() => setIssueFilter('no-meta-title')}
          tone="warn"
        >
          No title · {totals.missingMetaTitle}
        </FilterChip>
        <FilterChip
          active={issueFilter === 'no-meta-desc'}
          onClick={() => setIssueFilter('no-meta-desc')}
          tone="warn"
        >
          No desc · {totals.missingMetaDesc}
        </FilterChip>
        <FilterChip
          active={issueFilter === 'clean'}
          onClick={() => setIssueFilter('clean')}
          tone="success"
        >
          Clean
        </FilterChip>
      </div>

      <div className="ml-auto text-[11px] text-evari-dim font-mono tabular-nums">
        {shown === total ? (
          <span>
            <span className="text-evari-text">{formatNumber(total)}</span> URLs
          </span>
        ) : (
          <span>
            <span className="text-evari-text">{formatNumber(shown)}</span>
            <span className="text-evari-dimmer"> / {formatNumber(total)}</span>
          </span>
        )}
        {scannedAt && (
          <span className="text-evari-dimmer">
            {' · scan '}
            {relativeTime(scannedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'danger' | 'warn' | 'success';
}) {
  const toneCls =
    tone === 'danger'
      ? 'text-evari-danger'
      : tone === 'warn'
        ? 'text-evari-warn'
        : tone === 'success'
          ? 'text-evari-success'
          : 'text-evari-dim';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap',
        active
          ? 'bg-evari-surfaceSoft text-evari-text'
          : cn('hover:bg-evari-surfaceSoft/60', toneCls),
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

const COL_GRID =
  'grid-cols-[minmax(0,1fr)_88px_84px_96px_96px_96px_80px_96px_88px] gap-x-3';

function PagesTable({
  rows,
  sort,
  setSort,
  gscConnected,
  onSelect,
}: {
  rows: PageOverviewRow[];
  sort: SortState;
  setSort: (s: SortState) => void;
  gscConnected: boolean;
  onSelect: (r: PageOverviewRow) => void;
}) {
  function toggleSort(key: SortKey) {
    if (sort.key === key) {
      setSort({ key, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({
        key,
        dir:
          key === 'title' || key === 'type'
            ? 'asc'
            : 'desc',
      });
    }
  }

  return (
    <div>
      {/* Header */}
      <div
        className={cn(
          'grid px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium border-b border-evari-edge/30',
          COL_GRID,
        )}
      >
        <SortHeader
          align="left"
          active={sort.key === 'title'}
          dir={sort.dir}
          onClick={() => toggleSort('title')}
        >
          Page
        </SortHeader>
        <SortHeader
          active={sort.key === 'type'}
          dir={sort.dir}
          onClick={() => toggleSort('type')}
        >
          Type
        </SortHeader>
        <SortHeader
          active={sort.key === 'issues'}
          dir={sort.dir}
          onClick={() => toggleSort('issues')}
        >
          Issues
        </SortHeader>
        <SortHeader
          active={sort.key === 'metaTitleLen'}
          dir={sort.dir}
          onClick={() => toggleSort('metaTitleLen')}
        >
          Title len
        </SortHeader>
        <SortHeader
          active={sort.key === 'metaDescLen'}
          dir={sort.dir}
          onClick={() => toggleSort('metaDescLen')}
        >
          Desc len
        </SortHeader>
        <SortHeader
          active={sort.key === 'impressions'}
          dir={sort.dir}
          onClick={() => gscConnected && toggleSort('impressions')}
          disabled={!gscConnected}
        >
          Impr · 28d
        </SortHeader>
        <SortHeader
          active={sort.key === 'clicks'}
          dir={sort.dir}
          onClick={() => gscConnected && toggleSort('clicks')}
          disabled={!gscConnected}
        >
          Clicks
        </SortHeader>
        <SortHeader
          active={sort.key === 'position'}
          dir={sort.dir}
          onClick={() => gscConnected && toggleSort('position')}
          disabled={!gscConnected}
        >
          Avg pos
        </SortHeader>
        <SortHeader
          active={sort.key === 'updatedAt'}
          dir={sort.dir}
          onClick={() => toggleSort('updatedAt')}
        >
          Updated
        </SortHeader>
      </div>

      {/* Rows */}
      <div className="divide-y divide-evari-edge/20">
        {rows.map((r) => (
          <PageRow
            key={r.id}
            row={r}
            gscConnected={gscConnected}
            onClick={() => onSelect(r)}
          />
        ))}
      </div>
    </div>
  );
}

function SortHeader({
  active,
  dir,
  onClick,
  children,
  align = 'right',
  disabled,
}: {
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 transition-colors',
        align === 'right' ? 'justify-end' : 'justify-start',
        disabled
          ? 'text-evari-dimmer/60 cursor-not-allowed'
          : active
            ? 'text-evari-text'
            : 'hover:text-evari-text',
      )}
    >
      {children}
      {active && !disabled && (
        <span className="text-evari-dimmer">
          {dir === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )}
        </span>
      )}
    </button>
  );
}

function PageRow({
  row,
  gscConnected,
  onClick,
}: {
  row: PageOverviewRow;
  gscConnected: boolean;
  onClick: () => void;
}) {
  const Icon = ENTITY_ICON[row.type];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'grid w-full items-center px-4 py-3 text-left group transition-colors',
        'hover:bg-evari-surfaceSoft/60 focus:bg-evari-surfaceSoft/60 focus:outline-none',
        COL_GRID,
      )}
    >
      {/* Page */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-panel bg-evari-surfaceSoft text-evari-dim shrink-0">
            <Icon className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-evari-text truncate">{row.title}</div>
            <div className="text-[11px] font-mono text-evari-dim flex items-center gap-1 truncate">
              <span className="truncate">{row.path}</span>
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-evari-dimmer hover:text-evari-gold shrink-0"
                aria-label={`Open ${row.title} on storefront`}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Type */}
      <div className="text-xs text-right">
        <span className="text-evari-dim">{ENTITY_LABEL[row.type]}</span>
      </div>

      {/* Issues */}
      <div className="text-right">
        <IssueDots
          bySeverity={row.issuesBySeverity}
          total={row.totalIssues}
        />
      </div>

      {/* Title len */}
      <MetaLenCell
        len={row.metaTitleLen}
        missing={!row.metaTitle}
        min={TITLE_IDEAL_MIN}
        max={TITLE_IDEAL_MAX}
      />

      {/* Desc len */}
      <MetaLenCell
        len={row.metaDescriptionLen}
        missing={!row.metaDescription}
        min={DESC_IDEAL_MIN}
        max={DESC_IDEAL_MAX}
      />

      {/* Impressions / Clicks / Position — stub until GSC ingest */}
      <StubNumber connected={gscConnected} value={row.gsc.impressions28d} />
      <StubNumber connected={gscConnected} value={row.gsc.clicks28d} />
      <StubNumber
        connected={gscConnected}
        value={row.gsc.avgPosition28d}
        format={(v) => v.toFixed(1)}
      />

      {/* Updated */}
      <div className="text-right text-xs text-evari-dim font-mono tabular-nums whitespace-nowrap">
        {relativeTime(row.updatedAt)}
      </div>
    </button>
  );
}

function IssueDots({
  bySeverity,
  total,
}: {
  bySeverity: Record<CheckSeverity, number>;
  total: number;
}) {
  if (total === 0) {
    return <span className="text-evari-success text-xs inline-flex items-center gap-1 justify-end"><Check className="h-3 w-3" /><span>clean</span></span>;
  }
  const max = 6;
  const flat: CheckSeverity[] = [];
  for (let i = 0; i < bySeverity.A; i += 1) flat.push('A');
  for (let i = 0; i < bySeverity.B; i += 1) flat.push('B');
  for (let i = 0; i < bySeverity.C; i += 1) flat.push('C');
  const shown = flat.slice(0, max);
  const overflow = flat.length - shown.length;
  return (
    <div className="inline-flex items-center gap-1 justify-end">
      <div className="flex items-center gap-0.5">
        {shown.map((s, i) => (
          <span
            key={i}
            className={cn('h-1.5 w-1.5 rounded-full', SEVERITY_DOT[s])}
          />
        ))}
      </div>
      {overflow > 0 && (
        <span className="text-[10px] font-mono tabular-nums text-evari-dimmer">
          +{overflow}
        </span>
      )}
    </div>
  );
}

function MetaLenCell({
  len,
  missing,
  min,
  max,
}: {
  len: number;
  missing: boolean;
  min: number;
  max: number;
}) {
  if (missing) {
    return (
      <div className="text-right">
        <span className="text-[11px] font-mono tabular-nums text-evari-danger">
          missing
        </span>
      </div>
    );
  }
  const inBand = len >= min && len <= max;
  const tone = inBand
    ? 'text-evari-success'
    : len < min
      ? 'text-evari-warn'
      : 'text-evari-warn';
  return (
    <div className="text-right">
      <span className={cn('text-xs font-mono tabular-nums', tone)}>{len}</span>
      <span className="text-[10px] text-evari-dimmer">
        {' '}
        / {min}–{max}
      </span>
    </div>
  );
}

function StubNumber({
  connected,
  value,
  format,
}: {
  connected: boolean;
  value: number | null;
  format?: (v: number) => string;
}) {
  if (!connected || value == null) {
    return (
      <div className="text-right text-evari-dimmer/70 font-mono text-xs">—</div>
    );
  }
  return (
    <div className="text-right font-mono text-xs tabular-nums text-evari-text">
      {format ? format(value) : formatNumber(value)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connect-Google callout
// ---------------------------------------------------------------------------

function ConnectGoogleCallout() {
  return (
    <div className="rounded-xl bg-gradient-to-br from-evari-surface to-evari-carbon ring-1 ring-evari-edge/40 p-5">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-full bg-evari-gold/15 ring-1 ring-evari-gold/30 inline-flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-evari-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-evari-text">
            Light up impressions, clicks, avg position, CTR and Core Web
            Vitals
          </h3>
          <p className="text-xs text-evari-dim mt-1 leading-relaxed">
            Connect Google Search Console + GA4 to populate the three
            placeholder columns above and unlock the Keywords page. A
            PageSpeed Insights key (separate, free) lights up the
            Performance view with Core Web Vitals per URL. Setup is about
            20 minutes end-to-end.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="primary">
              <Link href="/settings/integrations/google">
                Connect Google
                <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/settings/integrations">
                View all integrations
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail drawer
// ---------------------------------------------------------------------------

function PageDetailDrawer({
  row,
  onClose,
  gscConnected,
}: {
  row: PageOverviewRow | null;
  onClose: () => void;
  gscConnected: boolean;
}) {
  return (
    <RightDrawer
      open={row != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={row?.title ?? ''}
      subtitle={row?.path}
      headerRight={
        row ? (
          <>
            <Badge variant="muted" className="capitalize">
              {ENTITY_LABEL[row.type].toLowerCase()}
            </Badge>
            <Button asChild size="sm" variant="ghost">
              <a href={row.url} target="_blank" rel="noreferrer">
                Open
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          </>
        ) : null
      }
      footer={
        row ? (
          <Button asChild size="sm" variant="primary">
            <Link href="/shopify/seo-health">
              Open in SEO Health
              <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        ) : null
      }
    >
      {row && <DrawerBody row={row} gscConnected={gscConnected} />}
    </RightDrawer>
  );
}

function DrawerBody({
  row,
  gscConnected,
}: {
  row: PageOverviewRow;
  gscConnected: boolean;
}) {
  return (
    <div>
      <SerpPreview row={row} />

      <DrawerSection title="Meta">
        <DrawerKV label="Meta title">
          <MetaValue
            value={row.metaTitle}
            len={row.metaTitleLen}
            min={TITLE_IDEAL_MIN}
            max={TITLE_IDEAL_MAX}
          />
        </DrawerKV>
        <DrawerKV label="Meta description">
          <MetaValue
            value={row.metaDescription}
            len={row.metaDescriptionLen}
            min={DESC_IDEAL_MIN}
            max={DESC_IDEAL_MAX}
            multiline
          />
        </DrawerKV>
        <DrawerKV label="Status">
          <span className="inline-flex items-center gap-2">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                row.status === 'ACTIVE' || row.status === 'PUBLISHED'
                  ? 'bg-evari-success'
                  : 'bg-evari-dimmer',
              )}
            />
            <span className="capitalize">{row.status.toLowerCase()}</span>
          </span>
        </DrawerKV>
        <DrawerKV label="Handle">
          <span className="font-mono text-xs text-evari-dim">{row.handle}</span>
        </DrawerKV>
        <DrawerKV label="Updated">
          <span className="text-evari-dim">{relativeTime(row.updatedAt)}</span>
        </DrawerKV>
      </DrawerSection>

      {row.hasFeaturedImage && (
        <DrawerSection title="Featured image">
          <div className="flex items-start gap-2 text-sm">
            <ImageIcon className="h-4 w-4 mt-0.5 text-evari-dim shrink-0" />
            <div className="min-w-0">
              {row.imageAltText ? (
                <>
                  <div className="text-evari-text">{row.imageAltText}</div>
                  <div className="text-[11px] text-evari-dim mt-0.5">
                    alt text set
                  </div>
                </>
              ) : (
                <div className="text-evari-danger">
                  alt text missing
                </div>
              )}
            </div>
          </div>
        </DrawerSection>
      )}

      <DrawerSection
        title="Findings"
        action={
          row.totalIssues > 0 ? (
            <span className="text-[10px] font-mono tabular-nums text-evari-dimmer">
              {row.totalIssues}
            </span>
          ) : null
        }
      >
        {row.totalIssues === 0 ? (
          <div className="flex items-center gap-2 py-1 text-sm text-evari-success">
            <Check className="h-4 w-4" />
            This URL passes every check.
          </div>
        ) : (
          <ul className="space-y-2">
            {row.findings.map((f) => (
              <li
                key={f.id}
                className="flex items-start gap-2 p-3 rounded-panel bg-evari-surfaceSoft/60"
              >
                <span
                  className={cn(
                    'mt-1 h-2 w-2 rounded-full shrink-0',
                    SEVERITY_DOT[f.check.severity],
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-evari-text font-medium">
                      {f.check.title}
                    </span>
                    <Badge
                      variant={
                        f.check.severity === 'A'
                          ? 'critical'
                          : f.check.severity === 'B'
                            ? 'warning'
                            : 'info'
                      }
                      className="text-[9px]"
                    >
                      {SEVERITY_LABEL[f.check.severity]}
                    </Badge>
                    <Badge variant="muted" className="text-[9px] capitalize">
                      {f.check.fix}
                    </Badge>
                  </div>
                  {f.detail && (
                    <div className="text-xs text-evari-dim mt-1 leading-relaxed">
                      {f.detail}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>

      <DrawerSection title="Search performance · 28d">
        <div className="grid grid-cols-2 gap-2">
          <GscStubTile label="Impressions" />
          <GscStubTile label="Clicks" />
          <GscStubTile label="CTR" />
          <GscStubTile label="Avg position" />
        </div>
        {!gscConnected && (
          <div className="mt-3 flex items-start gap-2 text-[11px] text-evari-dim">
            <Info className="h-3.5 w-3.5 mt-0.5 text-evari-dimmer shrink-0" />
            <span>
              Connect Google Search Console to light up these columns.{' '}
              <Link
                href="/settings/integrations/google"
                className="text-evari-gold underline underline-offset-2"
              >
                Connect now →
              </Link>
            </span>
          </div>
        )}
      </DrawerSection>
    </div>
  );
}

function MetaValue({
  value,
  len,
  min,
  max,
  multiline,
}: {
  value: string | null;
  len: number;
  min: number;
  max: number;
  multiline?: boolean;
}) {
  if (!value) {
    return <span className="text-evari-danger text-sm">missing</span>;
  }
  const inBand = len >= min && len <= max;
  const tone = inBand ? 'text-evari-success' : 'text-evari-warn';
  return (
    <div className="space-y-1">
      <div className={cn('text-sm text-evari-text', multiline ? '' : 'truncate')}>
        {value}
      </div>
      <div className="text-[10px] font-mono tabular-nums">
        <span className={tone}>{len}</span>
        <span className="text-evari-dimmer"> chars · ideal {min}–{max}</span>
      </div>
    </div>
  );
}

function GscStubTile({ label }: { label: string }) {
  return (
    <div className="rounded-panel bg-evari-surfaceSoft/60 p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
        {label}
      </div>
      <div className="text-lg text-evari-dimmer/70 font-mono tabular-nums mt-0.5">
        —
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SERP preview — what Google would show in search results
// ---------------------------------------------------------------------------

function SerpPreview({ row }: { row: PageOverviewRow }) {
  const domain = (() => {
    try {
      return new URL(row.url).host;
    } catch {
      return 'evari.cc';
    }
  })();
  const trail = row.path
    .split('/')
    .filter(Boolean)
    .join(' › ');
  const title = row.metaTitle || row.title;
  const desc =
    row.metaDescription ||
    'No meta description set — Google will synthesise a snippet from page content.';
  return (
    <div className="mb-6 rounded-xl bg-white/95 p-4 ring-1 ring-evari-edge/30">
      <div className="text-[11px] text-[#4d5156] font-sans">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-5 w-5 rounded-full bg-evari-accent inline-flex items-center justify-center text-white text-[10px] font-semibold">
            E
          </div>
          <div>
            <div className="text-[#202124] font-medium leading-tight">Evari</div>
            <div className="font-mono text-[10px] text-[#4d5156]">
              {domain}
              {trail ? ` › ${trail}` : ''}
            </div>
          </div>
        </div>
        <h4
          className="text-[18px] leading-tight font-normal text-[#1a0dab] mb-1"
          style={{ fontFamily: 'arial, sans-serif' }}
        >
          {truncate(title, 60)}
        </h4>
        <p className="text-[13px] leading-snug text-[#4d5156]">
          {truncate(desc, 160)}
        </p>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function compareRows(a: PageOverviewRow, b: PageOverviewRow, sort: SortState): number {
  const dir = sort.dir === 'asc' ? 1 : -1;
  switch (sort.key) {
    case 'title':
      return a.title.localeCompare(b.title) * dir;
    case 'type':
      return a.type.localeCompare(b.type) * dir || a.title.localeCompare(b.title);
    case 'issues': {
      const weight = (r: PageOverviewRow) =>
        r.issuesBySeverity.A * 100 + r.issuesBySeverity.B * 10 + r.issuesBySeverity.C;
      const w = weight(a) - weight(b);
      if (w !== 0) return w * dir;
      return a.title.localeCompare(b.title);
    }
    case 'metaTitleLen':
      return (a.metaTitleLen - b.metaTitleLen) * dir;
    case 'metaDescLen':
      return (a.metaDescriptionLen - b.metaDescriptionLen) * dir;
    case 'updatedAt':
      return (
        (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir
      );
    case 'impressions':
      return ((a.gsc.impressions28d ?? 0) - (b.gsc.impressions28d ?? 0)) * dir;
    case 'clicks':
      return ((a.gsc.clicks28d ?? 0) - (b.gsc.clicks28d ?? 0)) * dir;
    case 'position':
      return ((a.gsc.avgPosition28d ?? 999) - (b.gsc.avgPosition28d ?? 999)) * dir;
    default:
      return 0;
  }
}
