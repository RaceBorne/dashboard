'use client';

import * as React from 'react';
import { Search, Wand2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from './DataTable';
import { SeoDrawer, type SeoDrawerValues } from './SeoDrawer';
import type {
  ShopifyArticle,
  ShopifyPage,
  ShopifyProduct,
} from '@/lib/integrations/shopify';
import { cn } from '@/lib/utils';

/**
 * /shopify/seo — the all-content SEO hub.
 *
 * Single virtualised-feel table that lists every product/page/article
 * with its SEO completeness flagged. Click a row to open the shared SEO
 * drawer; the drawer is wired to the right PATCH endpoint based on
 * row type.
 */

export interface SeoHubRow {
  id: string;
  type: 'product' | 'page' | 'article';
  title: string;
  handle: string;
  url: string;
  metaTitle: string | null;
  metaDescription: string | null;
  body: string;
  /** Used for the SEO drawer hint — products carry vendor/type. */
  vendor?: string;
  productType?: string;
  tags?: string[];
}

function storefrontUrl(origin: string, path: string) {
  const base = origin.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export function rowFromProduct(p: ShopifyProduct, origin: string): SeoHubRow {
  return {
    id: p.id,
    type: 'product',
    title: p.title,
    handle: p.handle,
    url: p.onlineStoreUrl ?? storefrontUrl(origin, `/products/${p.handle}`),
    metaTitle: p.seo.title,
    metaDescription: p.seo.description,
    body: p.descriptionHtml.replace(/<[^>]+>/g, ' ').slice(0, 800),
    vendor: p.vendor,
    productType: p.productType,
    tags: p.tags,
  };
}

export function rowFromPage(p: ShopifyPage, origin: string): SeoHubRow {
  return {
    id: p.id,
    type: 'page',
    title: p.title,
    handle: p.handle,
    url: storefrontUrl(origin, `/pages/${p.handle}`),
    metaTitle: p.seo.title,
    metaDescription: p.seo.description,
    body: p.bodyHtml.replace(/<[^>]+>/g, ' ').slice(0, 800),
  };
}

export function rowFromArticle(a: ShopifyArticle, origin: string): SeoHubRow {
  return {
    id: a.id,
    type: 'article',
    title: a.title,
    handle: a.handle,
    url: storefrontUrl(origin, `/blogs/${a.blog.handle}/${a.handle}`),
    metaTitle: a.seo.title,
    metaDescription: a.seo.description,
    body: a.bodyHtml.replace(/<[^>]+>/g, ' ').slice(0, 800),
    tags: a.tags,
  };
}

export function SeoHubClient({
  initial,
  mock,
}: {
  initial: SeoHubRow[];
  mock: boolean;
}) {
  const [rows, setRows] = React.useState<SeoHubRow[]>(initial);
  const [query, setQuery] = React.useState('');
  const [type, setType] = React.useState<'all' | 'product' | 'page' | 'article'>('all');
  const [filter, setFilter] = React.useState<'all' | 'missing' | 'partial' | 'ok'>('all');
  const [openRow, setOpenRow] = React.useState<SeoHubRow | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== 'all' && r.type !== type) return false;
      const completeness = scoreRow(r);
      if (filter === 'missing' && completeness !== 'none') return false;
      if (filter === 'partial' && completeness !== 'partial') return false;
      if (filter === 'ok' && completeness !== 'ok') return false;
      if (q && !`${r.title} ${r.handle}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, type, filter]);

  const columns: Column<SeoHubRow>[] = [
    {
      key: 'type',
      header: 'Type',
      width: 'w-24',
      render: (r) => <Badge variant="muted" className="capitalize text-[10px]">{r.type}</Badge>,
    },
    {
      key: 'title',
      header: 'Title',
      render: (r) => (
        <div className="min-w-0">
          <div className="text-sm text-evari-text truncate">{r.title}</div>
          <div className="text-xs text-evari-dim font-mono truncate">{r.url}</div>
        </div>
      ),
    },
    {
      key: 'metaTitle',
      header: 'Meta title',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm text-evari-text">
            {r.metaTitle || <span className="italic text-evari-dim">missing</span>}
          </div>
          <LengthHint len={(r.metaTitle ?? '').length} min={30} max={60} />
        </div>
      ),
    },
    {
      key: 'metaDescription',
      header: 'Meta description',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm text-evari-text">
            {r.metaDescription || <span className="italic text-evari-dim">missing</span>}
          </div>
          <LengthHint len={(r.metaDescription ?? '').length} min={120} max={160} />
        </div>
      ),
    },
    {
      key: 'state',
      header: 'State',
      width: 'w-20',
      render: (r) => <CompletenessBadge state={scoreRow(r)} />,
    },
    {
      key: 'actions',
      header: '',
      width: 'w-16',
      align: 'right',
      swallowClick: true,
      render: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpenRow(r);
          }}
          className="text-[11px] uppercase tracking-[0.06em] text-evari-gold hover:text-evari-gold/80 inline-flex items-center gap-1"
        >
          <Wand2 className="h-3 w-3" /> Edit
        </button>
      ),
    },
  ];

  return (
    <>
      {mock && (
        <div className="rounded-md bg-evari-warn/15 ring-1 ring-evari-warn/30 px-4 py-2.5 text-xs text-evari-text mb-4">
          Showing mock data — Shopify is not connected.
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dimmer" />
          <Input
            placeholder="Search title or handle…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Pill label="All" active={type === 'all'} onClick={() => setType('all')} />
          <Pill label="Products" active={type === 'product'} onClick={() => setType('product')} />
          <Pill label="Pages" active={type === 'page'} onClick={() => setType('page')} />
          <Pill label="Articles" active={type === 'article'} onClick={() => setType('article')} />
          <span className="mx-1 text-evari-dimmer">·</span>
          <Pill label="Any" active={filter === 'all'} onClick={() => setFilter('all')} />
          <Pill label="Missing" active={filter === 'missing'} onClick={() => setFilter('missing')} />
          <Pill label="Partial" active={filter === 'partial'} onClick={() => setFilter('partial')} />
          <Pill label="OK" active={filter === 'ok'} onClick={() => setFilter('ok')} />
        </div>
      </div>

      <div className="text-xs text-evari-dim mb-2 font-mono tabular-nums">
        {filtered.length} of {rows.length}
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => `${r.type}:${r.id}`}
        onRowClick={(r) => setOpenRow(r)}
      />

      <SeoDrawer
        open={!!openRow}
        onOpenChange={(o) => {
          if (!o) setOpenRow(null);
        }}
        entity={
          openRow
            ? {
                id: openRow.id,
                type: openRow.type,
                name: openRow.title,
                body: openRow.body,
                productType: openRow.productType,
                vendor: openRow.vendor,
                tags: openRow.tags,
                url: openRow.url,
              }
            : null
        }
        initial={{
          title: openRow?.metaTitle ?? '',
          meta: openRow?.metaDescription ?? '',
          handle: openRow?.handle ?? '',
        }}
        onSave={async (values: SeoDrawerValues) => {
          if (!openRow) return;
          const endpoint =
            openRow.type === 'product'
              ? '/api/shopify/products'
              : openRow.type === 'page'
              ? '/api/shopify/pages'
              : null;
          if (!endpoint) return; // articles save handled by content/articles page
          const body =
            openRow.type === 'product'
              ? {
                  id: openRow.id,
                  seoTitle: values.title,
                  seoDescription: values.meta,
                }
              : {
                  pageId: openRow.id,
                  metaTitle: values.title,
                  metaDescription: values.meta,
                };
          const res = await fetch(endpoint, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (res.ok) {
            setRows((prev) =>
              prev.map((r) =>
                r.id === openRow.id
                  ? { ...r, metaTitle: values.title, metaDescription: values.meta }
                  : r,
              ),
            );
          }
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

function Pill({
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
        'px-2.5 py-1 rounded-full text-[11px] uppercase tracking-[0.06em] transition-colors',
        active
          ? 'bg-evari-gold text-evari-goldInk'
          : 'bg-evari-surface text-evari-dim hover:text-evari-text',
      )}
    >
      {label}
    </button>
  );
}

function LengthHint({ len, min, max }: { len: number; min: number; max: number }) {
  const tone =
    len === 0
      ? 'text-evari-danger'
      : len < min || len > max
      ? 'text-evari-warn'
      : 'text-evari-success';
  return <span className={cn('text-[10px] font-mono tabular-nums', tone)}>{len}c</span>;
}

function scoreRow(r: SeoHubRow): 'none' | 'partial' | 'ok' {
  const t = !!r.metaTitle;
  const m = !!r.metaDescription;
  if (!t && !m) return 'none';
  if (t && m) return 'ok';
  return 'partial';
}

function CompletenessBadge({ state }: { state: 'none' | 'partial' | 'ok' }) {
  if (state === 'none') {
    return <Badge variant="critical" className="text-[10px]">missing</Badge>;
  }
  if (state === 'partial') {
    return <Badge variant="warning" className="text-[10px]">partial</Badge>;
  }
  return <Badge variant="success" className="text-[10px]">ok</Badge>;
}
