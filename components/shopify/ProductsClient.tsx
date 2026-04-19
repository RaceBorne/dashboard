'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search, AlertTriangle, Wand2, ExternalLink, Loader2, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from './DataTable';
import { StatusBadge } from './StatusBadge';
import { RightDrawer, DrawerSection, DrawerKV } from './RightDrawer';
import { SeoDrawer, type SeoDrawerValues } from './SeoDrawer';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { ShopifyProduct } from '@/lib/integrations/shopify';
import { cn, formatGBP, formatNumber } from '@/lib/utils';

/**
 * Products section client.
 *
 * Server hands us the initial product list; we hold it in state so that
 * inline edits + SEO drawer saves can update the row without a full
 * re-fetch. Status / vendor / type filters all run client-side which is
 * fine up to the ~250-row first page; switching to server-side filters
 * is a future Milestone 2 polish task.
 */
export function ProductsClient({
  initial,
  mock,
  storefrontBaseUrl,
}: {
  initial: ShopifyProduct[];
  mock: boolean;
  /** Customer-facing shop origin (https, no trailing slash). */
  storefrontBaseUrl: string;
}) {
  const [products, setProducts] = React.useState<ShopifyProduct[]>(initial);
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<'all' | 'ACTIVE' | 'DRAFT' | 'ARCHIVED'>('all');
  const [seoFilter, setSeoFilter] = React.useState<'all' | 'missing' | 'ok'>('all');
  const [openProduct, setOpenProduct] = React.useState<ShopifyProduct | null>(null);
  const [seoFor, setSeoFor] = React.useState<ShopifyProduct | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      if (seoFilter === 'missing' && p.seo.title && p.seo.description) return false;
      if (seoFilter === 'ok' && (!p.seo.title || !p.seo.description)) return false;
      if (q && !`${p.title} ${p.handle} ${p.tags.join(' ')}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [products, query, status, seoFilter]);

  const updateOne = (next: ShopifyProduct) => {
    setProducts((prev) => prev.map((p) => (p.id === next.id ? next : p)));
    setOpenProduct((cur) => (cur && cur.id === next.id ? next : cur));
  };

  const columns: Column<ShopifyProduct>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (p) => (
        <div className="flex items-center gap-3 min-w-0">
          {p.featuredImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.featuredImage.url}
              alt={p.featuredImage.altText ?? ''}
              className="h-9 w-9 rounded-md object-cover bg-evari-surfaceSoft shrink-0"
            />
          ) : (
            <div className="h-9 w-9 rounded-md bg-evari-surfaceSoft shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-sm text-evari-text truncate">{p.title}</div>
            <div className="text-xs text-evari-dim truncate font-mono">/{p.handle}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-24',
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'inventory',
      header: 'Inventory',
      align: 'right',
      width: 'w-24',
      render: (p) => (
        <span
          className={cn(
            'tabular-nums',
            p.totalInventory <= 0 ? 'text-evari-danger' : 'text-evari-text',
          )}
        >
          {formatNumber(p.totalInventory)}
        </span>
      ),
    },
    {
      key: 'vendor',
      header: 'Vendor',
      width: 'w-28',
      render: (p) => <span className="text-evari-dim text-xs">{p.vendor || '—'}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      width: 'w-28',
      render: (p) => <span className="text-evari-dim text-xs">{p.productType || '—'}</span>,
    },
    {
      key: 'seo',
      header: 'SEO',
      width: 'w-20',
      render: (p) => <SeoBadge p={p} />,
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
            setSeoFor(p);
          }}
          className="text-[11px] uppercase tracking-[0.06em] text-evari-gold hover:text-evari-gold/80 inline-flex items-center gap-1"
        >
          <Wand2 className="h-3 w-3" />
          SEO
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
            placeholder="Search title, handle or tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterPill label="All" active={status === 'all'} onClick={() => setStatus('all')} />
          <FilterPill label="Active" active={status === 'ACTIVE'} onClick={() => setStatus('ACTIVE')} />
          <FilterPill label="Draft" active={status === 'DRAFT'} onClick={() => setStatus('DRAFT')} />
          <FilterPill label="Archived" active={status === 'ARCHIVED'} onClick={() => setStatus('ARCHIVED')} />
          <span className="mx-1 text-evari-dimmer">·</span>
          <FilterPill label="Any SEO" active={seoFilter === 'all'} onClick={() => setSeoFilter('all')} />
          <FilterPill label="Missing SEO" active={seoFilter === 'missing'} onClick={() => setSeoFilter('missing')} />
          <FilterPill label="SEO ok" active={seoFilter === 'ok'} onClick={() => setSeoFilter('ok')} />
        </div>
      </div>

      <div className="text-xs text-evari-dim mb-2 font-mono tabular-nums">
        {filtered.length} of {products.length} products
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(p) => p.id}
        onRowClick={(p) => setOpenProduct(p)}
        empty={query ? `No products matching “${query}”` : 'No products yet.'}
      />

      <ProductDrawer
        product={openProduct}
        onClose={() => setOpenProduct(null)}
        onOpenSeo={() => {
          if (openProduct) {
            setSeoFor(openProduct);
          }
        }}
        onUpdated={updateOne}
      />

      <SeoDrawerWrap
        product={seoFor}
        storefrontBaseUrl={storefrontBaseUrl}
        onClose={() => setSeoFor(null)}
        onUpdated={updateOne}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FilterPill({
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
        active ? 'bg-evari-gold text-evari-goldInk' : 'bg-evari-surface text-evari-dim hover:text-evari-text',
      )}
    >
      {label}
    </button>
  );
}

function SeoBadge({ p }: { p: ShopifyProduct }) {
  const missingTitle = !p.seo.title;
  const missingMeta = !p.seo.description;
  if (missingTitle && missingMeta) {
    return <Badge variant="critical" className="text-[10px] gap-1"><AlertTriangle className="h-3 w-3" /> none</Badge>;
  }
  if (missingTitle || missingMeta) {
    return <Badge variant="warning" className="text-[10px]">partial</Badge>;
  }
  return <Badge variant="success" className="text-[10px]">ok</Badge>;
}

// ---------------------------------------------------------------------------
// Product detail drawer
// ---------------------------------------------------------------------------

function ProductDrawer({
  product,
  onClose,
  onOpenSeo,
  onUpdated,
}: {
  product: ShopifyProduct | null;
  onClose: () => void;
  onOpenSeo: () => void;
  onUpdated: (next: ShopifyProduct) => void;
}) {
  const [tab, setTab] = React.useState('overview');
  const [title, setTitle] = React.useState(product?.title ?? '');
  const [tagsText, setTagsText] = React.useState(product?.tags.join(', ') ?? '');
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    setTitle(product?.title ?? '');
    setTagsText(product?.tags.join(', ') ?? '');
    setTab('overview');
    setSavedAt(null);
  }, [product?.id]);

  const dirty =
    !!product &&
    (title !== product.title || tagsText !== product.tags.join(', '));

  const save = async () => {
    if (!product) return;
    setSaving(true);
    try {
      const res = await fetch('/api/shopify/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: product.id,
          title,
          tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      const json = (await res.json()) as { product?: ShopifyProduct; error?: string };
      if (!res.ok || !json.product) throw new Error(json.error ?? 'Update failed');
      onUpdated(json.product);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  return (
    <RightDrawer
      open={!!product}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={product?.title ?? 'Product'}
      subtitle={product ? `/products/${product.handle}` : undefined}
      headerRight={
        product && (
          <>
            <StatusBadge status={product.status} />
            {product.onlineStoreUrl && (
              <a
                href={product.onlineStoreUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-evari-dim hover:text-evari-text inline-flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" /> live
              </a>
            )}
          </>
        )
      }
      footer={
        product && (
          <>
            {savedAt && (
              <span className="mr-auto text-[11px] text-evari-success inline-flex items-center gap-1">
                <Check className="h-3 w-3" /> saved
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            <Button variant="primary" size="sm" onClick={save} disabled={!dirty || saving}>
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              {saving ? 'Saving' : 'Save'}
            </Button>
          </>
        )
      }
    >
      {!product ? null : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
            <TabsTrigger value="meta">Meta</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <DrawerSection title="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </DrawerSection>
            <DrawerSection title="Tags">
              <Input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="comma, separated, tags"
              />
            </DrawerSection>
            <DrawerSection title="Description">
              <div
                className="prose prose-invert prose-sm max-w-none text-sm text-evari-text rounded-md bg-evari-surface p-3 max-h-64 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: product.descriptionHtml || '<em>No description.</em>' }}
              />
            </DrawerSection>
          </TabsContent>

          <TabsContent value="seo">
            <DrawerSection
              title="SEO summary"
              action={
                <button
                  type="button"
                  onClick={onOpenSeo}
                  className="text-[11px] uppercase tracking-[0.06em] text-evari-gold hover:text-evari-gold/80 inline-flex items-center gap-1"
                >
                  <Wand2 className="h-3 w-3" /> Edit + generate
                </button>
              }
            >
              <DrawerKV label="Title">
                {product.seo.title ?? <span className="italic text-evari-dim">not set</span>}
              </DrawerKV>
              <DrawerKV label="Title length">
                <span className="font-mono tabular-nums">{(product.seo.title ?? '').length}</span>
              </DrawerKV>
              <DrawerKV label="Meta">
                {product.seo.description ?? (
                  <span className="italic text-evari-dim">not set</span>
                )}
              </DrawerKV>
              <DrawerKV label="Meta length">
                <span className="font-mono tabular-nums">
                  {(product.seo.description ?? '').length}
                </span>
              </DrawerKV>
              <DrawerKV label="Featured alt">
                {product.featuredImage?.altText ?? (
                  <span className="italic text-evari-dim">no alt text</span>
                )}
              </DrawerKV>
            </DrawerSection>
          </TabsContent>

          <TabsContent value="meta">
            <DrawerSection title="Identifiers">
              <DrawerKV label="GID">
                <span className="font-mono text-xs break-all">{product.id}</span>
              </DrawerKV>
              <DrawerKV label="Handle">
                <span className="font-mono">{product.handle}</span>
              </DrawerKV>
              <DrawerKV label="Vendor">{product.vendor || '—'}</DrawerKV>
              <DrawerKV label="Type">{product.productType || '—'}</DrawerKV>
              <DrawerKV label="Inventory">
                <span className="font-mono tabular-nums">
                  {formatNumber(product.totalInventory)} units
                </span>
              </DrawerKV>
              <DrawerKV label="Updated">
                {new Date(product.updatedAt).toLocaleString('en-GB')}
              </DrawerKV>
            </DrawerSection>
            <DrawerSection title="Quick stats">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Inventory">
                  <span className="font-mono tabular-nums">
                    {formatNumber(product.totalInventory)}
                  </span>
                </Stat>
                <Stat label="Tags">{product.tags.length}</Stat>
                <Stat label="SEO score">
                  {scoreSeo(product)}/100
                </Stat>
                <Stat label="Online URL">
                  {product.onlineStoreUrl ? (
                    <Link
                      href={product.onlineStoreUrl}
                      target="_blank"
                      className="text-evari-gold underline-offset-2 hover:underline truncate inline-block max-w-full"
                    >
                      view
                    </Link>
                  ) : (
                    '—'
                  )}
                </Stat>
              </div>
            </DrawerSection>
          </TabsContent>
        </Tabs>
      )}
    </RightDrawer>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-evari-surface p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
        {label}
      </div>
      <div className="text-base text-evari-text mt-1">{children}</div>
    </div>
  );
}

function scoreSeo(p: ShopifyProduct): number {
  let score = 100;
  if (!p.seo.title) score -= 30;
  else if (p.seo.title.length < 30 || p.seo.title.length > 60) score -= 10;
  if (!p.seo.description) score -= 30;
  else if (p.seo.description.length < 120 || p.seo.description.length > 160) score -= 10;
  if (p.featuredImage && !p.featuredImage.altText) score -= 10;
  return Math.max(0, score);
}

void formatGBP; // kept import for future per-variant pricing tab

// ---------------------------------------------------------------------------
// SEO drawer adapter
// ---------------------------------------------------------------------------

function SeoDrawerWrap({
  product,
  storefrontBaseUrl,
  onClose,
  onUpdated,
}: {
  product: ShopifyProduct | null;
  storefrontBaseUrl: string;
  onClose: () => void;
  onUpdated: (next: ShopifyProduct) => void;
}) {
  const initial: SeoDrawerValues = {
    title: product?.seo.title ?? '',
    meta: product?.seo.description ?? '',
    handle: product?.handle ?? '',
  };

  return (
    <SeoDrawer
      open={!!product}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      entity={
        product
          ? {
              id: product.id,
              type: 'product',
              name: product.title,
              body: product.descriptionHtml.replace(/<[^>]+>/g, ' ').slice(0, 800),
              productType: product.productType,
              vendor: product.vendor,
              tags: product.tags,
              url:
                product.onlineStoreUrl ??
                `${storefrontBaseUrl.replace(/\/+$/, '')}/products/${product.handle}`,
            }
          : null
      }
      initial={initial}
      onSave={async (values) => {
        if (!product) return;
        const res = await fetch('/api/shopify/products', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: product.id,
            seoTitle: values.title,
            seoDescription: values.meta,
          }),
        });
        const json = (await res.json()) as { product?: ShopifyProduct };
        if (json.product) onUpdated(json.product);
      }}
    />
  );
}
