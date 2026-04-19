'use client';

import * as React from 'react';
import { Search, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from './DataTable';
import { StatusBadge } from './StatusBadge';
import { RightDrawer, DrawerSection, DrawerKV } from './RightDrawer';
import type { ShopifyOrder } from '@/lib/integrations/shopify';
import { cn, formatNumber } from '@/lib/utils';

/**
 * Orders table + read-only drawer.
 *
 * Read-only because every "real" order action (refund, fulfill, hold)
 * has its own multi-step flow Shopify exposes through the Admin app
 * already. The dashboard view is for at-a-glance triage and
 * deep-linking to Shopify Admin to actually act.
 */
export function OrdersClient({
  initial,
  mock,
}: {
  initial: ShopifyOrder[];
  mock: boolean;
}) {
  const [orders] = React.useState<ShopifyOrder[]>(initial);
  const [query, setQuery] = React.useState('');
  const [financial, setFinancial] = React.useState<'all' | string>('all');
  const [fulfillment, setFulfillment] = React.useState<'all' | string>('all');
  const [open, setOpen] = React.useState<ShopifyOrder | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (financial !== 'all' && o.displayFinancialStatus !== financial) return false;
      if (fulfillment !== 'all' && o.displayFulfillmentStatus !== fulfillment) return false;
      if (q && !`${o.name} ${o.email ?? ''} ${o.customer?.displayName ?? ''}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [orders, query, financial, fulfillment]);

  const totals = React.useMemo(
    () => ({
      total: filtered.reduce(
        (s, o) => s + Number(o.totalPriceSet.shopMoney.amount),
        0,
      ),
      currency: filtered[0]?.totalPriceSet.shopMoney.currencyCode ?? 'GBP',
    }),
    [filtered],
  );

  const columns: Column<ShopifyOrder>[] = [
    {
      key: 'name',
      header: 'Order',
      width: 'w-24',
      render: (o) => <span className="font-mono text-evari-text">{o.name}</span>,
    },
    {
      key: 'date',
      header: 'Placed',
      width: 'w-32',
      render: (o) => (
        <span className="text-xs text-evari-dim font-mono">
          {new Date(o.processedAt || o.createdAt).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (o) => (
        <div className="min-w-0">
          <div className="text-sm text-evari-text truncate">
            {o.customer?.displayName ?? 'Guest'}
          </div>
          <div className="text-xs text-evari-dim truncate">{o.email ?? '—'}</div>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      width: 'w-16',
      align: 'right',
      render: (o) => (
        <span className="font-mono tabular-nums">
          {formatNumber(o.lineItems.reduce((s, li) => s + li.quantity, 0))}
        </span>
      ),
    },
    {
      key: 'financial',
      header: 'Payment',
      width: 'w-28',
      render: (o) => <StatusBadge status={o.displayFinancialStatus ?? null} />,
    },
    {
      key: 'fulfillment',
      header: 'Fulfilment',
      width: 'w-28',
      render: (o) => <StatusBadge status={o.displayFulfillmentStatus ?? null} />,
    },
    {
      key: 'total',
      header: 'Total',
      width: 'w-24',
      align: 'right',
      render: (o) => (
        <span className="font-mono tabular-nums text-evari-text">
          {o.totalPriceSet.shopMoney.currencyCode}{' '}
          {formatNumber(Number(o.totalPriceSet.shopMoney.amount), {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
    },
  ];

  const fStatuses = uniqueStatuses(orders.map((o) => o.displayFinancialStatus));
  const ffStatuses = uniqueStatuses(orders.map((o) => o.displayFulfillmentStatus));

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
            placeholder="Search order, email or customer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Pill label="Any payment" active={financial === 'all'} onClick={() => setFinancial('all')} />
          {fStatuses.map((s) => (
            <Pill
              key={s}
              label={s.replace(/_/g, ' ').toLowerCase()}
              active={financial === s}
              onClick={() => setFinancial(s)}
            />
          ))}
          <span className="mx-1 text-evari-dimmer">·</span>
          <Pill label="Any fulfilment" active={fulfillment === 'all'} onClick={() => setFulfillment('all')} />
          {ffStatuses.map((s) => (
            <Pill
              key={s}
              label={s.replace(/_/g, ' ').toLowerCase()}
              active={fulfillment === s}
              onClick={() => setFulfillment(s)}
            />
          ))}
        </div>
      </div>

      <div className="text-xs text-evari-dim mb-2 font-mono tabular-nums flex items-center justify-between">
        <span>{filtered.length} of {orders.length} orders</span>
        <span>
          Total: {totals.currency} {formatNumber(totals.total, { minimumFractionDigits: 2 })}
        </span>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(o) => o.id}
        onRowClick={(o) => setOpen(o)}
      />

      <OrderDrawer order={open} onClose={() => setOpen(null)} />
    </>
  );
}

// ---------------------------------------------------------------------------

function OrderDrawer({
  order,
  onClose,
}: {
  order: ShopifyOrder | null;
  onClose: () => void;
}) {
  const numericId = order?.id.split('/').pop();
  const adminUrl = order ? `https://admin.shopify.com/orders/${numericId}` : '#';
  return (
    <RightDrawer
      open={!!order}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={order ? `Order ${order.name}` : ''}
      subtitle={
        order
          ? new Date(order.processedAt || order.createdAt).toLocaleString('en-GB')
          : undefined
      }
      headerRight={
        order && (
          <>
            <StatusBadge status={order.displayFinancialStatus ?? null} />
            <StatusBadge status={order.displayFulfillmentStatus ?? null} />
          </>
        )
      }
      footer={
        order && (
          <>
            <a
              href={adminUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-xs text-evari-gold hover:text-evari-gold/80 inline-flex items-center gap-1"
            >
              Open in Shopify Admin <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )
      }
    >
      {order && (
        <>
          <DrawerSection title="Customer">
            <DrawerKV label="Name">{order.customer?.displayName ?? 'Guest'}</DrawerKV>
            <DrawerKV label="Email">{order.email ?? '—'}</DrawerKV>
            <DrawerKV label="Phone">{order.phone ?? '—'}</DrawerKV>
            <DrawerKV label="Source">{order.sourceName ?? '—'}</DrawerKV>
          </DrawerSection>
          <DrawerSection title="Items">
            <ul className="divide-y divide-evari-edge/30">
              {order.lineItems.map((li, i) => (
                <li key={i} className="py-2 flex items-center gap-3 text-sm">
                  <span className="font-mono tabular-nums w-8 text-right text-evari-dim">
                    {li.quantity}×
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-evari-text truncate">{li.title}</div>
                    {li.variantTitle && (
                      <div className="text-xs text-evari-dim truncate">{li.variantTitle}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </DrawerSection>
          <DrawerSection title="Totals">
            <DrawerKV label="Subtotal">
              <span className="font-mono tabular-nums">
                {order.subtotalPriceSet.shopMoney.currencyCode}{' '}
                {formatNumber(Number(order.subtotalPriceSet.shopMoney.amount), {
                  minimumFractionDigits: 2,
                })}
              </span>
            </DrawerKV>
            <DrawerKV label="Total">
              <span className="font-mono tabular-nums text-evari-text">
                {order.totalPriceSet.shopMoney.currencyCode}{' '}
                {formatNumber(Number(order.totalPriceSet.shopMoney.amount), {
                  minimumFractionDigits: 2,
                })}
              </span>
            </DrawerKV>
          </DrawerSection>
          {order.tags.length > 0 && (
            <DrawerSection title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {order.tags.map((t) => (
                  <Badge key={t} variant="muted" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
            </DrawerSection>
          )}
        </>
      )}
    </RightDrawer>
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

function uniqueStatuses(arr: Array<string | null | undefined>): string[] {
  return Array.from(new Set(arr.filter((s): s is string => !!s))).sort();
}
