'use client';

import * as React from 'react';
import { Search, Wand2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from './DataTable';
import { SeoDrawer, type SeoDrawerValues } from './SeoDrawer';
import type { ShopifyArticle, ShopifyBlog } from '@/lib/integrations/shopify';
import { cn, relativeTime } from '@/lib/utils';

/**
 * Blog articles list with inline SEO editing.
 *
 * Filters by blog (when there's more than one) and by SEO completeness.
 * Body editing remains in Shopify Admin — long-form content is the wrong
 * problem to put in a drawer.
 */
export function ArticlesClient({
  initial,
  blogs,
  mock,
  storefrontBaseUrl,
}: {
  initial: ShopifyArticle[];
  blogs: ShopifyBlog[];
  mock: boolean;
  storefrontBaseUrl: string;
}) {
  const [articles, setArticles] = React.useState<ShopifyArticle[]>(initial);
  const [query, setQuery] = React.useState('');
  const [blogFilter, setBlogFilter] = React.useState<'all' | string>('all');
  const [seoFilter, setSeoFilter] = React.useState<'all' | 'missing'>('all');
  const [openArticle, setOpenArticle] = React.useState<ShopifyArticle | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (blogFilter !== 'all' && a.blog.id !== blogFilter) return false;
      if (seoFilter === 'missing' && a.seo.title && a.seo.description) return false;
      if (q && !`${a.title} ${a.handle} ${a.tags.join(' ')}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [articles, query, blogFilter, seoFilter]);

  const columns: Column<ShopifyArticle>[] = [
    {
      key: 'title',
      header: 'Article',
      render: (a) => (
        <div className="min-w-0">
          <div className="text-sm text-evari-text truncate">{a.title}</div>
          <div className="text-xs text-evari-dim font-mono truncate">
            /blogs/{a.blog.handle}/{a.handle}
          </div>
        </div>
      ),
    },
    {
      key: 'blog',
      header: 'Blog',
      width: 'w-32',
      render: (a) => <span className="text-xs text-evari-dim">{a.blog.title}</span>,
    },
    {
      key: 'seo',
      header: 'SEO',
      width: 'w-44',
      render: (a) => (
        <div className="text-xs">
          <SeoBit ok={!!a.seo.title} label="title" />
          <span className="mx-1 text-evari-dimmer">·</span>
          <SeoBit ok={!!a.seo.description} label="meta" />
          <span className="mx-1 text-evari-dimmer">·</span>
          <SeoBit ok={!!a.image?.altText} label="alt" />
        </div>
      ),
    },
    {
      key: 'state',
      header: 'State',
      width: 'w-24',
      render: (a) =>
        a.isPublished ? (
          <Badge variant="success" className="text-[10px]">published</Badge>
        ) : (
          <Badge variant="muted" className="text-[10px]">draft</Badge>
        ),
    },
    {
      key: 'updated',
      header: 'Updated',
      width: 'w-28',
      render: (a) => (
        <span className="text-xs text-evari-dim font-mono">{relativeTime(a.updatedAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-24',
      align: 'right',
      swallowClick: true,
      render: (a) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpenArticle(a);
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
            placeholder="Search title, tag, or handle…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {blogs.length > 1 && (
            <>
              <Pill label="All blogs" active={blogFilter === 'all'} onClick={() => setBlogFilter('all')} />
              {blogs.map((b) => (
                <Pill
                  key={b.id}
                  label={b.title}
                  active={blogFilter === b.id}
                  onClick={() => setBlogFilter(b.id)}
                />
              ))}
              <span className="mx-1 text-evari-dimmer">·</span>
            </>
          )}
          <Pill label="Any" active={seoFilter === 'all'} onClick={() => setSeoFilter('all')} />
          <Pill label="Missing SEO" active={seoFilter === 'missing'} onClick={() => setSeoFilter('missing')} />
        </div>
      </div>

      <div className="text-xs text-evari-dim mb-2 font-mono tabular-nums">
        {filtered.length} of {articles.length} articles
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(a) => a.id}
        onRowClick={(a) => setOpenArticle(a)}
      />

      <SeoDrawer
        open={!!openArticle}
        onOpenChange={(o) => {
          if (!o) setOpenArticle(null);
        }}
        entity={
          openArticle
            ? {
                id: openArticle.id,
                type: 'article',
                name: openArticle.title,
                body: openArticle.bodyHtml.replace(/<[^>]+>/g, ' ').slice(0, 800),
                url: `${storefrontBaseUrl.replace(/\/+$/, '')}/blogs/${openArticle.blog.handle}/${openArticle.handle}`,
                tags: openArticle.tags,
              }
            : null
        }
        initial={{
          title: openArticle?.seo.title ?? '',
          meta: openArticle?.seo.description ?? '',
          handle: openArticle?.handle ?? '',
        }}
        onSave={async (values: SeoDrawerValues) => {
          if (!openArticle) return;
          const res = await fetch('/api/shopify/articles', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              articleId: openArticle.id,
              metaTitle: values.title,
              metaDescription: values.meta,
            }),
          });
          if (res.ok) {
            setArticles((prev) =>
              prev.map((a) =>
                a.id === openArticle.id
                  ? { ...a, seo: { title: values.title, description: values.meta } }
                  : a,
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
