import Link from 'next/link';
import { TopBar } from '@/components/sidebar/TopBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { cn, formatGBP, formatNumber } from '@/lib/utils';
import {
  isShopifyConnected,
  getShopifyStatus,
  listAbandonedCheckouts,
  listOrders,
  listProducts,
  type ShopifyOrder,
  type ShopifyProduct,
} from '@/lib/shopify';
import {
  Banknote,
  Receipt,
  ShoppingCart,
  PackageX,
  AlertTriangle,
  ExternalLink,
  ArrowUpRight,
} from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Shopify section overview. Lives at /shopify. Pulls live data through
 * the existing Shopify adapter (auto-falls-back to mock if the store is
 * not connected). Built as a server component so the heavy data fetches
 * happen close to the API and we don't ship product/order JSON to the
 * client.
 */
export default async function ShopifyOverviewPage() {
  const connected = isShopifyConnected();

  // Run all reads in parallel. If any one fails we still render the page
  // — the missing tile shows an em-dash placeholder.
  const [statusResult, ordersResult, abandonedResult, productsResult] =
    await Promise.allSettled([
      getShopifyStatus(),
      listOrders({ first: 100, query: 'created_at:>-30d' }),
      listAbandonedCheckouts({ first: 50 }),
      listProducts({ first: 100 }),
    ]);

  const status = statusResult.status === 'fulfilled' ? statusResult.value : null;
  const orders: ShopifyOrder[] =
    ordersResult.status === 'fulfilled' ? ordersResult.value : [];
  const abandoned =
    abandonedResult.status === 'fulfilled' ? abandonedResult.value : [];
  const products: ShopifyProduct[] =
    productsResult.status === 'fulfilled' ? productsResult.value : [];

  const stats = computeStats(orders, products, abandoned);
  const attention = buildAttention({
    orders,
    products,
    abandoned,
  });
  const topProducts = computeTopProducts(orders);

  const fetchErrors = [statusResult, ordersResult, abandonedResult, productsResult]
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

  return (
    <>
      <TopBar
        title="Shopify"
        subtitle={status?.shop?.primaryDomain ?? 'evari.cc'}
        rightSlot={
          <ConnectionPill
            connected={connected && status?.connected === true}
            apiVersion={status?.apiVersion}
            shopName={status?.shop?.name}
          />
        }
      />

      <div className="p-6 space-y-6">
        {!connected && (
          <div className="rounded-md bg-evari-warn/15 ring-1 ring-evari-warn/30 px-4 py-3 text-sm text-evari-text">
            Shopify is not connected. Showing mock data.{' '}
            <Link
              href="/wireframe"
              className="text-evari-gold underline underline-offset-2"
            >
              Set credentials in Wireframe →
            </Link>
          </div>
        )}

        {fetchErrors.length > 0 && (
          <div className="rounded-md bg-evari-danger/15 ring-1 ring-evari-danger/30 px-4 py-3 text-sm text-evari-text">
            <div className="font-medium mb-1">Some Shopify reads failed</div>
            <ul className="list-disc pl-5 space-y-0.5 text-xs text-evari-dim">
              {fetchErrors.slice(0, 3).map((m, i) => (
                <li key={i} className="font-mono">
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Top stat row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            icon={<Banknote className="h-4 w-4" />}
            iconTone="text-evari-gold"
            value={formatGBP(stats.salesToday)}
            helper={
              stats.salesYesterday > 0 ? (
                <DeltaLabel
                  value={
                    (stats.salesToday - stats.salesYesterday) / stats.salesYesterday
                  }
                  suffix=" vs yesterday"
                />
              ) : (
                'Sales today'
              )
            }
          />
          <StatTile
            icon={<Receipt className="h-4 w-4" />}
            iconTone="text-evari-text"
            value={stats.ordersToday}
            helper="Orders today"
          />
          <StatTile
            icon={<ShoppingCart className="h-4 w-4" />}
            iconTone="text-evari-warn"
            value={stats.abandonedCount}
            helper={`${formatGBP(stats.abandonedValue)} unrecovered`}
          />
          <StatTile
            icon={<PackageX className="h-4 w-4" />}
            iconTone="text-evari-danger"
            value={stats.unfulfilledOver24h}
            helper={`${stats.unfulfilledTotal} unfulfilled total`}
          />
        </div>

        {/* Two-column section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel
            title="Needs attention"
            action={
              attention.length > 0 ? (
                <span className="text-xs text-evari-dim font-mono tabular-nums">
                  {attention.length}
                </span>
              ) : null
            }
          >
            {attention.length === 0 ? (
              <EmptyLine>Nothing needs you right now.</EmptyLine>
            ) : (
              <ul className="divide-y divide-evari-edge/30">
                {attention.map((row) => (
                  <li key={row.id} className="py-3 flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 rounded-full shrink-0',
                        row.severity === 'critical'
                          ? 'bg-evari-danger'
                          : row.severity === 'warning'
                            ? 'bg-evari-warn'
                            : 'bg-sky-400',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-evari-text leading-tight">
                        {row.title}
                      </div>
                      {row.detail && (
                        <div className="text-xs text-evari-dim mt-0.5 truncate">
                          {row.detail}
                        </div>
                      )}
                    </div>
                    {row.href && (
                      <Link
                        href={row.href}
                        className="text-evari-dim hover:text-evari-gold shrink-0"
                        aria-label={`Open ${row.title}`}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Top products · 7 days"
            action={
              <Link
                href="/shopify/products"
                className="text-xs text-evari-dim hover:text-evari-text inline-flex items-center gap-1"
              >
                All products
                <ExternalLink className="h-3 w-3" />
              </Link>
            }
          >
            {topProducts.length === 0 ? (
              <EmptyLine>No orders in the last 7 days.</EmptyLine>
            ) : (
              <ul className="divide-y divide-evari-edge/30">
                {topProducts.map((row, i) => (
                  <li key={row.title} className="py-3 flex items-center gap-3">
                    <span className="font-mono text-[11px] text-evari-dimmer w-4 text-right">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-evari-text truncate">
                        {row.title}
                      </div>
                      <div className="text-xs text-evari-dim mt-0.5">
                        {formatNumber(row.units)} units
                      </div>
                    </div>
                    <div className="text-sm font-mono tabular-nums text-evari-text">
                      {formatGBP(row.revenue)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Quick actions row */}
        <Panel title="Jump to">
          <div className="flex flex-wrap gap-2">
            <QuickLink href="/shopify/products" label="Products" />
            <QuickLink href="/shopify/orders" label="Orders" />
            <QuickLink href="/shopify/customers" label="Customers" />
            <QuickLink href="/shopify/seo" label="SEO" />
            <QuickLink href="/shopify/seo-health" label="SEO Health" />
            <QuickLink href="/shopify/growth/abandoned" label="Abandoned" />
            <QuickLink href="/shopify/ops/redirects" label="Redirects" />
          </div>
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConnectionPill({
  connected,
  apiVersion,
  shopName,
}: {
  connected: boolean;
  apiVersion?: string;
  shopName?: string;
}) {
  return (
    <Badge variant={connected ? 'success' : 'muted'} className="gap-1.5">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          connected ? 'bg-evari-ink/60' : 'bg-evari-dimmer',
        )}
      />
      {connected
        ? `Live · ${shopName ?? 'Shopify'} · ${apiVersion ?? ''}`
        : 'Mock data'}
    </Badge>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-evari-surface p-5">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-evari-text tracking-tight">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-evari-dim italic py-2">{children}</p>;
}

function DeltaLabel({ value, suffix }: { value: number; suffix?: string }) {
  if (!isFinite(value)) return <span className="text-evari-dim">{suffix}</span>;
  const positive = value >= 0;
  return (
    <span
      className={cn(
        'text-[11px] font-mono tabular-nums',
        positive ? 'text-evari-success' : 'text-evari-danger',
      )}
    >
      {positive ? '+' : ''}
      {(value * 100).toFixed(1)}%{suffix}
    </span>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="default" size="sm">
      <Link href={href}>{label}</Link>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

interface OverviewStats {
  salesToday: number;
  salesYesterday: number;
  ordersToday: number;
  abandonedCount: number;
  abandonedValue: number;
  unfulfilledTotal: number;
  unfulfilledOver24h: number;
}

function computeStats(
  orders: ShopifyOrder[],
  _products: ShopifyProduct[],
  abandoned: Awaited<ReturnType<typeof listAbandonedCheckouts>>,
): OverviewStats {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - dayMs);

  let salesToday = 0;
  let salesYesterday = 0;
  let ordersToday = 0;
  let unfulfilledTotal = 0;
  let unfulfilledOver24h = 0;

  for (const o of orders) {
    const placed = new Date(o.processedAt || o.createdAt).getTime();
    const total = Number(o.totalPriceSet?.shopMoney?.amount ?? '0');
    if (placed >= startOfToday.getTime()) {
      salesToday += total;
      ordersToday += 1;
    } else if (placed >= startOfYesterday.getTime()) {
      salesYesterday += total;
    }
    if (
      o.displayFulfillmentStatus &&
      o.displayFulfillmentStatus !== 'FULFILLED'
    ) {
      unfulfilledTotal += 1;
      if (now - placed > dayMs) unfulfilledOver24h += 1;
    }
  }

  const abandonedValue = abandoned.reduce((sum, a) => sum + (a.totalPrice ?? 0), 0);

  return {
    salesToday,
    salesYesterday,
    ordersToday,
    abandonedCount: abandoned.length,
    abandonedValue,
    unfulfilledTotal,
    unfulfilledOver24h,
  };
}

interface AttentionRow {
  id: string;
  title: string;
  detail?: string;
  severity: 'critical' | 'warning' | 'info';
  href?: string;
}

function buildAttention({
  orders,
  products,
  abandoned,
}: {
  orders: ShopifyOrder[];
  products: ShopifyProduct[];
  abandoned: Awaited<ReturnType<typeof listAbandonedCheckouts>>;
}): AttentionRow[] {
  const rows: AttentionRow[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Big abandoned carts (>£100)
  const bigAbandoned = abandoned.filter((a) => (a.totalPrice ?? 0) >= 100);
  if (bigAbandoned.length > 0) {
    rows.push({
      id: 'abandoned-big',
      severity: 'warning',
      title: `${bigAbandoned.length} abandoned cart${bigAbandoned.length === 1 ? '' : 's'} over £100`,
      detail: `${formatGBP(
        bigAbandoned.reduce((s, a) => s + (a.totalPrice ?? 0), 0),
      )} in unrecovered checkouts`,
      href: '/shopify/growth/abandoned',
    });
  }

  // Unfulfilled >24h
  const stale = orders.filter(
    (o) =>
      o.displayFulfillmentStatus &&
      o.displayFulfillmentStatus !== 'FULFILLED' &&
      now - new Date(o.processedAt || o.createdAt).getTime() > dayMs,
  );
  if (stale.length > 0) {
    rows.push({
      id: 'unfulfilled-stale',
      severity: 'critical',
      title: `${stale.length} order${stale.length === 1 ? '' : 's'} unfulfilled over 24h`,
      detail: stale[0]?.name ? `Oldest: ${stale[0].name}` : undefined,
      href: '/shopify/orders',
    });
  }

  // Products out of stock (totalInventory <= 0 + active)
  const noStock = products.filter(
    (p) => p.status === 'ACTIVE' && p.totalInventory <= 0,
  );
  if (noStock.length > 0) {
    rows.push({
      id: 'no-stock',
      severity: 'warning',
      title: `${noStock.length} active product${noStock.length === 1 ? '' : 's'} out of stock`,
      detail: noStock
        .slice(0, 2)
        .map((p) => p.title)
        .join(' · '),
      href: '/shopify/products',
    });
  }

  // Missing SEO (no seo.title OR no seo.description) on active products
  const missingSeo = products.filter(
    (p) =>
      p.status === 'ACTIVE' &&
      (!p.seo?.title || !p.seo?.description),
  );
  if (missingSeo.length > 0) {
    rows.push({
      id: 'missing-seo',
      severity: 'warning',
      title: `${missingSeo.length} active product${missingSeo.length === 1 ? '' : 's'} missing SEO copy`,
      detail: 'Title or meta description empty',
      href: '/shopify/seo-health',
    });
  }

  // Missing alt text — we can't tell from the slim list query (only
  // featuredImage is loaded), so flag products whose featured image has
  // no altText as a proxy.
  const noAlt = products.filter(
    (p) => p.featuredImage && !p.featuredImage.altText,
  );
  if (noAlt.length > 0) {
    rows.push({
      id: 'no-alt',
      severity: 'info',
      title: `${noAlt.length} featured image${noAlt.length === 1 ? '' : 's'} missing alt text`,
      href: '/shopify/seo-health',
    });
  }

  return rows;
}

interface TopProductRow {
  title: string;
  units: number;
  revenue: number;
}

function computeTopProducts(orders: ShopifyOrder[]): TopProductRow[] {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const byTitle = new Map<string, TopProductRow>();
  for (const o of orders) {
    const placed = new Date(o.processedAt || o.createdAt).getTime();
    if (placed < cutoff) continue;
    // Spread the order's revenue across line items by quantity weight —
    // gives a reasonable per-product revenue proxy without re-fetching
    // line item prices.
    const totalUnits = o.lineItems.reduce((s, li) => s + li.quantity, 0) || 1;
    const orderRevenue = Number(o.totalPriceSet?.shopMoney?.amount ?? '0');
    for (const li of o.lineItems) {
      const cur = byTitle.get(li.title) ?? {
        title: li.title,
        units: 0,
        revenue: 0,
      };
      cur.units += li.quantity;
      cur.revenue += (orderRevenue * li.quantity) / totalUnits;
      byTitle.set(li.title, cur);
    }
  }
  return Array.from(byTitle.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}
