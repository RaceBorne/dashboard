'use client';

import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { DataTable, type Column } from './DataTable';
import { StatusBadge } from './StatusBadge';
import { RightDrawer, DrawerSection, DrawerKV } from './RightDrawer';
import type { ShopifyDraftOrder } from '@/lib/integrations/shopify';
import { formatNumber } from '@/lib/utils';

/**
 * Draft orders viewer (read-only).
 *
 * Drafts in Evari are mostly created by the bike-builder flow — this
 * page exists so a sales rep can see in-flight quotes and jump straight
 * to the Shopify invoice URL to chase the customer. Editing the line
 * items belongs in the builder UI, not here.
 */
export function DraftsClient({
  initial,
  mock,
}: {
  initial: ShopifyDraftOrder[];
  mock: boolean;
}) {
  const [drafts] = React.useState<ShopifyDraftOrder[]>(initial);
  const [open, setOpen] = React.useState<ShopifyDraftOrder | null>(null);

  const columns: Column<ShopifyDraftOrder>[] = [
    {
      key: 'name',
      header: 'Draft',
      width: 'w-28',
      render: (d) => <span className="font-mono text-evari-text">{d.name}</span>,
    },
    {
      key: 'created',
      header: 'Created',
      width: 'w-40',
      render: (d) => (
        <span className="text-xs text-evari-dim font-mono">
          {new Date(d.createdAt).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-32',
      render: (d) => <StatusBadge status={d.status} />,
    },
    {
      key: 'invoice',
      header: 'Invoice',
      render: (d) =>
        d.invoiceUrl ? (
          <span className="text-xs text-evari-gold inline-flex items-center gap-1">
            sent <ExternalLink className="h-3 w-3" />
          </span>
        ) : (
          <span className="text-xs text-evari-dim italic">not sent</span>
        ),
    },
    {
      key: 'total',
      header: 'Total',
      width: 'w-32',
      align: 'right',
      render: (d) => (
        <span className="font-mono tabular-nums text-evari-text">
          GBP {formatNumber(Number(d.totalPrice), { minimumFractionDigits: 2 })}
        </span>
      ),
    },
  ];

  const totalValue = drafts.reduce((s, d) => s + Number(d.totalPrice), 0);

  return (
    <>
      {mock && (
        <div className="rounded-md bg-evari-warn/15 ring-1 ring-evari-warn/30 px-4 py-2.5 text-xs text-evari-text mb-4">
          Showing mock data — Shopify is not connected.
        </div>
      )}

      <div className="text-xs text-evari-dim mb-2 font-mono tabular-nums flex items-center justify-between">
        <span>{drafts.length} drafts</span>
        <span>Pipeline: GBP {formatNumber(totalValue, { minimumFractionDigits: 2 })}</span>
      </div>

      <DataTable
        columns={columns}
        rows={drafts}
        rowKey={(d) => d.id}
        onRowClick={(d) => setOpen(d)}
        empty="No draft orders yet. Drafts created from the bike builder show up here."
      />

      <DraftDrawer draft={open} onClose={() => setOpen(null)} />
    </>
  );
}

function DraftDrawer({
  draft,
  onClose,
}: {
  draft: ShopifyDraftOrder | null;
  onClose: () => void;
}) {
  const numericId = draft?.id.split('/').pop();
  const adminUrl = draft ? `https://admin.shopify.com/draft_orders/${numericId}` : '#';
  return (
    <RightDrawer
      open={!!draft}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={draft ? `Draft ${draft.name}` : ''}
      subtitle={draft ? new Date(draft.createdAt).toLocaleString('en-GB') : undefined}
      headerRight={draft && <StatusBadge status={draft.status} />}
      footer={
        draft && (
          <>
            {draft.invoiceUrl && (
              <a
                href={draft.invoiceUrl}
                target="_blank"
                rel="noreferrer"
                className="mr-auto text-xs text-evari-gold hover:text-evari-gold/80 inline-flex items-center gap-1"
              >
                Open invoice <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <a
              href={adminUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-evari-gold hover:text-evari-gold/80 inline-flex items-center gap-1"
            >
              Open in Shopify Admin <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )
      }
    >
      {draft && (
        <DrawerSection title="Summary">
          <DrawerKV label="Status">{draft.status}</DrawerKV>
          <DrawerKV label="Created">{new Date(draft.createdAt).toLocaleString('en-GB')}</DrawerKV>
          <DrawerKV label="Total">
            <span className="font-mono tabular-nums">
              GBP {formatNumber(Number(draft.totalPrice), { minimumFractionDigits: 2 })}
            </span>
          </DrawerKV>
          <DrawerKV label="Invoice">
            {draft.invoiceUrl ? (
              <a href={draft.invoiceUrl} target="_blank" rel="noreferrer" className="text-evari-gold hover:underline">
                {draft.invoiceUrl}
              </a>
            ) : (
              'not sent'
            )}
          </DrawerKV>
        </DrawerSection>
      )}
    </RightDrawer>
  );
}
