'use client';

import * as React from 'react';
import { Search, Wand2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from './DataTable';
import { SeoDrawer, type SeoDrawerValues } from './SeoDrawer';
import type { ShopifyPage } from '@/lib/integrations/shopify';
import { cn, relativeTime } from '@/lib/utils';

/**
 * Online-store Pages list + SEO editor drawer.
 *
 * Body editing belongs in Shopify Admin (rich text + assets); we deep
 * link there from the row. Inline editor here covers the high-frequency
 * cases: meta title, meta description, and the page handle/URL.
 */
export function PagesClient({
  initial,
  mock,
  storefrontBaseUrl,
}: {
  initial: ShopifyPage[];
  mock: boolean;
  storefrontBaseUrl: string;
}) {
  const [pages, setPages] = React.useState<ShopifyPage[]>(initial);
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'published' | 'draft' | 'missing-seo'>('all');
  const [openPage, setOpenPage] = React.useState<ShopifyPage | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return pages.filter((p) => {
      if (filter === 'published' && !p.isPublished) return false;
      if (filter === 'draft' && p.isPublished) return false;
      if (filter === 'missing-seo' && p.seo.title && p.seo.description) return false;
      if (q && !`${p.title} ${p.handle}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pages, query, filter]);

  const columns: Column<ShopifyPage>[] = [
    {
      key: 'title',
      header: 'Title',
      render: (p) => (
        <div className="min-w-0">
          <div className="text-sm text-evari-text truncate">{p.title}</div>
          <div className="text-xs text-evari-dim font-mono truncate">/pages/{p.handle}</div>
        </div>
      ),
    },
    {
      key: 'seo',
      header: 'SEO',
      width: 'w-48',
      render: (p) => (
        <div className="text-xs">
          <SeoBit ok={!!p.seo.title} label="title" />
          <span className="mx-1 text-evari-dimmer">·</span>
          <SeoBit ok={!!p.seo.description} label="meta" />
        </div>
      ),
    },
    {
      key: 'status',
      header: 'State',
      width: 'w-24',
      render: (p) =>
        p.isPublished ? (
          <Badge variant="success" className="text-[10px]">published</Badge>
        ) : (
          <Badge variant="muted" className="text-[10px]">draft</Badge>
        ),
    },
    {
      key: 'updated',
      header: 'Updated',
      width: 'w-28',
      render: (p) => (
        <span className="text-xs text-evari-dim font-mono">{relativeTime(p.updatedAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-24',
      align: 'right',
      swallowClick: true,
      render: (p) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpenPage(p);
          }}
          className="text-[11px] uppercase tracking-[0.06em] text-evari-gold hover:text-evari-gold/80 inline-flex items-center gap-1"
        >
          <Wand2 className="h-3 w-3" /> Edit SEO
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
          <Pill label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
          <Pill label="Published" active={filter === 'published'} onClick={() => setFilter('published')} />
          <Pill label="Draft" active={filter === 'draft'} onClick={() => setFilter('draft')} />
          <Pill label="Missing SEO" active={filter === 'missing-seo'} onClick={() => setFilter('missing-seo')} />
        </div>
      </div>

      <div className="text-xs text-evari-dim mb-2 font-mono tabular-nums">
        {filtered.length} of {pages.length} pages
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(p) => p.id}
        onRowClick={(p) => setOpenPage(p)}
      />

      <SeoDrawer
        open={!!openPage}
        onOpenChange={(o) => {
          if (!o) setOpenPage(null);
        }}
        entity={
          openPage
            ? {
                id: openPage.id,
                type: 'page',
                name: openPage.title,
                body: openPage.bodyHtml.replace(/<[^>]+>/g, ' ').slice(0, 800),
                url: `${storefrontBaseUrl.replace(/\/+$/, '')}/pages/${openPage.handle}`,
              }
            : null
        }
        initial={{
          title: openPage?.seo.title ?? '',
          meta: openPage?.seo.description ?? '',
          handle: openPage?.handle ?? '',
        }}
        onSave={async (values: SeoDrawerValues) => {
          if (!openPage) return;
          const res = await fetch('/api/shopify/pages', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pageId: openPage.id,
              metaTitle: values.title,
              metaDescription: values.meta,
            }),
          });
          if (res.ok) {
            setPages((prev) =>
              prev.map((p) =>
                p.id === openPage.id
                  ? { ...p, seo: { title: values.title, description: values.meta } }
                  : p,
              ),
            );
          }
        }}
      />
    </>
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

function SeoBit({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('font-mono', ok ? 'text-evari-success' : 'text-evari-warn')}>
      {ok ? '✓' : '×'} {label}
    </span>
  );
}
