'use client';

import * as React from 'react';
import { Search, Mail, ExternalLink, Loader2, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from './DataTable';
import { RightDrawer, DrawerSection, DrawerKV } from './RightDrawer';
import type { ShopifyAbandonedCheckout } from '@/lib/integrations/shopify';
import { cn, formatNumber, relativeTime } from '@/lib/utils';

/**
 * Abandoned checkouts table + recovery flow.
 *
 * Two value-add actions per row:
 *   1) Open the checkout URL on the storefront (lets the rep see what
 *      the customer was about to buy)
 *   2) Send the official Shopify recovery email (one POST → REST API)
 */
export function AbandonedClient({
  initial,
  mock,
}: {
  initial: ShopifyAbandonedCheckout[];
  mock: boolean;
}) {
  const [carts] = React.useState<ShopifyAbandonedCheckout[]>(initial);
  const [query, setQuery] = React.useState('');
  const [size, setSize] = React.useState<'all' | 'big' | 'huge'>('all');
  const [open, setOpen] = React.useState<ShopifyAbandonedCheckout | null>(null);
  const [recovered, setRecovered] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState<Set<string>>(new Set());

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return carts.filter((c) => {
      if (q && !`${c.email ?? ''} ${c.customer?.displayName ?? ''}`.toLowerCase().includes(q)) {
        return false;
      }
      if (size === 'big' && c.totalPrice < 100) return false;
      if (size === 'huge' && c.totalPrice < 1000) return false;
      return true;
    });
  }, [carts, query, size]);

  const totalUnrecovered = filtered.reduce((s, c) => s + c.totalPrice, 0);
  const currency = filtered[0]?.currencyCode ?? 'GBP';

  const recover = async (id: string) => {
    setPending((p) => new Set(p).add(id));
    try {
      await fetch('/api/shopify/abandoned/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutId: id }),
      });
      setRecovered((r) => new Set(r).add(id));
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(id);
        return next;
      });
    }
  };

  const columns: Column<ShopifyAbandonedCheckout>[] = [
    {
      key: 'customer',
      header: 'Customer',
      render: (c) => (
        <div className="min-w-0">
          <div className="text-sm text-evari-text truncate">
            {c.customer?.displayName || c.email || 'Anonymous'}
          </div>
          <div className="text-xs text-evari-dim truncate">{c.email ?? '—'}</div>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Cart',
      render: (c) => (
        <div className="text-sm text-evari-text truncate min-w-0">
          {c.lineItems
            .slice(0, 2)
            .map((li) => `${li.quantity}× ${li.title}`)
            .join(', ')}
          {c.lineItems.length > 2 && (
            <span className="text-evari-dim"> +{c.lineItems.length - 2}</span>
          )}
        </div>
      ),
    },
    {
      key: 'value',
      header: 'Value',
      width: 'w-32',
      align: 'right',
      render: (c) => (
        <span className="font-mono tabular-nums text-evari-text">
          {c.currencyCode}{' '}
          {formatNumber(c.totalPrice, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      key: 'when',
      header: 'Abandoned',
      width: 'w-32',
      render: (c) => (
        <span className="text-xs text-evari-dim font-mono">{relativeTime(c.abandonedAt)}</span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      width: 'w-32',
      render: (c) =>
        recovered.has(c.id) ? (
          <Badge variant="success" className="text-[10px]">recovery sent</Badge>
        ) : (
          <Badge variant="warning" className="text-[10px]">unrecovered</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-32',
      align: 'right',
      swallowClick: true,
      render: (c) => (
        <Button
          size="sm"
          variant={recovered.has(c.id) ? 'default' : 'primary'}
          onClick={(e) => {
            e.stopPropagation();
            void recover(c.id);
          }}
          disabled={pending.has(c.id) || recovered.has(c.id)}
        >
          {pending.has(c.id) ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : recovered.has(c.id) ? (
            <Check className="h-3 w-3" />
          ) : (
            <Mail className="h-3 w-3" />
          )}
          {recovered.has(c.id) ? 'sent' : 'recover'}
        </Button>
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
            placeholder="Search email or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Pill label="All" active={size === 'all'} onClick={() => setSize('all')} />
          <Pill label="£100+" active={size === 'big'} onClick={() => setSize('big')} />
          <Pill label="£1k+" active={size === 'huge'} onClick={() => setSize('huge')} />
        </div>
      </div>

      <div className="text-xs text-evari-dim mb-2 font-mono tabular-nums flex items-center justify-between">
        <span>{filtered.length} of {carts.length} carts</span>
        <span>
          Unrecovered: {currency} {formatNumber(totalUnrecovered, { minimumFractionDigits: 2 })}
        </span>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(c) => c.id}
        onRowClick={(c) => setOpen(c)}
      />

      <AbandonedDrawer
        cart={open}
        onClose={() => setOpen(null)}
        recovered={open ? recovered.has(open.id) : false}
        onRecover={recover}
        pending={open ? pending.has(open.id) : false}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

function AbandonedDrawer({
  cart,
  onClose,
  recovered,
  onRecover,
  pending,
}: {
  cart: ShopifyAbandonedCheckout | null;
  onClose: () => void;
  recovered: boolean;
  onRecover: (id: string) => Promise<void>;
  pending: boolean;
}) {
  return (
    <RightDrawer
      open={!!cart}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={cart ? cart.customer?.displayName || cart.email || 'Abandoned cart' : ''}
      subtitle={cart ? `${cart.currencyCode} ${cart.totalPrice.toFixed(2)}` : undefined}
      footer={
        cart && (
          <>
            {cart.url && (
              <a
                href={cart.url}
                target="_blank"
                rel="noreferrer"
                className="mr-auto text-xs text-evari-gold hover:text-evari-gold/80 inline-flex items-center gap-1"
              >
                Open checkout <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => void onRecover(cart.id)}
              disabled={recovered || pending}
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
              {recovered ? 'sent' : 'send recovery'}
            </Button>
          </>
        )
      }
    >
      {cart && (
        <>
          <DrawerSection title="Customer">
            <DrawerKV label="Name">{cart.customer?.displayName ?? '—'}</DrawerKV>
            <DrawerKV label="Email">{cart.email ?? '—'}</DrawerKV>
            <DrawerKV label="Phone">{cart.phone ?? '—'}</DrawerKV>
            <DrawerKV label="Abandoned">{relativeTime(cart.abandonedAt)}</DrawerKV>
          </DrawerSection>
          <DrawerSection title="Cart">
            <ul className="divide-y divide-evari-edge/30">
              {cart.lineItems.map((li, i) => (
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
