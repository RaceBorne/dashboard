'use client';

import * as React from 'react';
import { Search, ExternalLink, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from './DataTable';
import { RightDrawer, DrawerSection, DrawerKV } from './RightDrawer';
import type { ShopifyCustomer } from '@/lib/integrations/shopify';
import { cn, formatNumber } from '@/lib/utils';

/**
 * Customers table + drawer.
 *
 * Three soft segments displayed as pills (computed client-side from
 * the loaded list). Real CRM segmentation would happen against a wider
 * dataset and live behind the Leads section — this view is a quick
 * lookup, not a marketing tool.
 */
export function CustomersClient({
  initial,
  mock,
}: {
  initial: ShopifyCustomer[];
  mock: boolean;
}) {
  const [customers] = React.useState<ShopifyCustomer[]>(initial);
  const [query, setQuery] = React.useState('');
  const [segment, setSegment] = React.useState<'all' | 'repeat' | 'high' | 'new'>('all');
  const [open, setOpen] = React.useState<ShopifyCustomer | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (q && !`${c.displayName} ${c.email ?? ''} ${c.tags.join(' ')}`.toLowerCase().includes(q)) {
        return false;
      }
      const spent = Number(c.amountSpent.amount);
      if (segment === 'repeat' && c.numberOfOrders < 2) return false;
      if (segment === 'high' && spent < 1000) return false;
      if (segment === 'new') {
        const recentMs = Date.now() - new Date(c.createdAt).getTime();
        if (recentMs > 30 * 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });
  }, [customers, query, segment]);

  const columns: Column<ShopifyCustomer>[] = [
    {
      key: 'name',
      header: 'Customer',
      render: (c) => (
        <div className="min-w-0">
          <div className="text-sm text-evari-text truncate">{c.displayName || 'Unknown'}</div>
          <div className="text-xs text-evari-dim truncate">{c.email ?? '—'}</div>
        </div>
      ),
    },
    {
      key: 'orders',
      header: 'Orders',
      width: 'w-20',
      align: 'right',
      render: (c) => (
        <span className="font-mono tabular-nums">{formatNumber(c.numberOfOrders)}</span>
      ),
    },
    {
      key: 'spent',
      header: 'Lifetime',
      width: 'w-32',
      align: 'right',
      render: (c) => (
        <span className="font-mono tabular-nums text-evari-text">
          {c.amountSpent.currencyCode}{' '}
          {formatNumber(Number(c.amountSpent.amount), {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}
        </span>
      ),
    },
    {
      key: 'tags',
      header: 'Tags',
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.tags.slice(0, 3).map((t) => (
            <Badge key={t} variant="muted" className="text-[10px]">
              {t}
            </Badge>
          ))}
          {c.tags.length > 3 && (
            <span className="text-[10px] text-evari-dim">+{c.tags.length - 3}</span>
          )}
        </div>
      ),
    },
    {
      key: 'updated',
      header: 'Last update',
      width: 'w-32',
      render: (c) => (
        <span className="text-xs text-evari-dim font-mono">
          {new Date(c.updatedAt).toLocaleDateString('en-GB')}
        </span>
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
            placeholder="Search name, email or tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <SegPill label="All" active={segment === 'all'} onClick={() => setSegment('all')} />
          <SegPill label="New (30d)" active={segment === 'new'} onClick={() => setSegment('new')} />
          <SegPill label="Repeat (2+)" active={segment === 'repeat'} onClick={() => setSegment('repeat')} />
          <SegPill label="High value (£1k+)" active={segment === 'high'} onClick={() => setSegment('high')} />
        </div>
      </div>

      <div className="text-xs text-evari-dim mb-2 font-mono tabular-nums">
        {filtered.length} of {customers.length} customers
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(c) => c.id}
        onRowClick={(c) => setOpen(c)}
      />

      <CustomerDrawer customer={open} onClose={() => setOpen(null)} />
    </>
  );
}

function CustomerDrawer({
  customer,
  onClose,
}: {
  customer: ShopifyCustomer | null;
  onClose: () => void;
}) {
  const numericId = customer?.id.split('/').pop();
  const adminUrl = customer ? `https://admin.shopify.com/customers/${numericId}` : '#';
  return (
    <RightDrawer
      open={!!customer}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={customer?.displayName ?? ''}
      subtitle={customer?.email ?? undefined}
      headerRight={
        customer && (
          <>
            {customer.email && (
              <a
                href={`mailto:${customer.email}`}
                className="text-xs text-evari-gold hover:text-evari-gold/80 inline-flex items-center gap-1"
              >
                <Mail className="h-3 w-3" /> email
              </a>
            )}
          </>
        )
      }
      footer={
        customer && (
          <a
            href={adminUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-xs text-evari-gold hover:text-evari-gold/80 inline-flex items-center gap-1"
          >
            Open in Shopify Admin <ExternalLink className="h-3 w-3" />
          </a>
        )
      }
    >
      {customer && (
        <>
          <DrawerSection title="Profile">
            <DrawerKV label="Name">{customer.displayName}</DrawerKV>
            <DrawerKV label="Email">{customer.email ?? '—'}</DrawerKV>
            <DrawerKV label="Phone">{customer.phone ?? '—'}</DrawerKV>
            <DrawerKV label="Created">
              {new Date(customer.createdAt).toLocaleDateString('en-GB')}
            </DrawerKV>
            <DrawerKV label="Updated">
              {new Date(customer.updatedAt).toLocaleDateString('en-GB')}
            </DrawerKV>
          </DrawerSection>
          <DrawerSection title="Lifetime stats">
            <DrawerKV label="Orders">
              <span className="font-mono tabular-nums">{customer.numberOfOrders}</span>
            </DrawerKV>
            <DrawerKV label="Spent">
              <span className="font-mono tabular-nums text-evari-text">
                {customer.amountSpent.currencyCode}{' '}
                {formatNumber(Number(customer.amountSpent.amount), {
                  minimumFractionDigits: 2,
                })}
              </span>
            </DrawerKV>
            <DrawerKV label="State">
              <Badge variant="muted" className="text-[10px]">{customer.state}</Badge>
            </DrawerKV>
          </DrawerSection>
          {customer.tags.length > 0 && (
            <DrawerSection title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {customer.tags.map((t) => (
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

function SegPill({
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
