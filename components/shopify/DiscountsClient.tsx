'use client';

import * as React from 'react';
import { Plus, Loader2, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from './DataTable';
import { StatusBadge } from './StatusBadge';
import type { ShopifyDiscount } from '@/lib/integrations/shopify';
import { cn, formatNumber } from '@/lib/utils';

/**
 * Discounts table + create modal.
 *
 * Listing covers code + automatic discounts; the create modal only
 * builds basic code discounts (% off all / amount off all). Anything
 * fancier (free shipping over X, BOGO, app-driven) needs the full
 * Shopify discount builder which we don't try to replicate.
 */
export function DiscountsClient({
  initial,
  mock,
}: {
  initial: ShopifyDiscount[];
  mock: boolean;
}) {
  const [discounts, setDiscounts] = React.useState<ShopifyDiscount[]>(initial);
  const [filter, setFilter] = React.useState<'all' | 'code' | 'automatic'>('all');
  const [showCreate, setShowCreate] = React.useState(false);

  const filtered = React.useMemo(() => {
    if (filter === 'all') return discounts;
    return discounts.filter((d) => d.kind === filter);
  }, [discounts, filter]);

  const columns: Column<ShopifyDiscount>[] = [
    {
      key: 'title',
      header: 'Title',
      render: (d) => (
        <div className="min-w-0">
          <div className="text-sm text-evari-text truncate">{d.title}</div>
          {d.code && (
            <code className="text-xs text-evari-gold font-mono">{d.code}</code>
          )}
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Type',
      width: 'w-24',
      render: (d) => <Badge variant="muted" className="capitalize text-[10px]">{d.kind}</Badge>,
    },
    {
      key: 'summary',
      header: 'Value',
      render: (d) => <span className="text-sm text-evari-text">{d.summary}</span>,
    },
    {
      key: 'usage',
      header: 'Used',
      width: 'w-24',
      align: 'right',
      render: (d) => (
        <span className="font-mono tabular-nums">
          {formatNumber(d.usageCount)}
          {d.usageLimit ? ` / ${formatNumber(d.usageLimit)}` : ''}
        </span>
      ),
    },
    {
      key: 'window',
      header: 'Window',
      width: 'w-44',
      render: (d) => (
        <span className="text-xs text-evari-dim font-mono">
          {d.startsAt ? new Date(d.startsAt).toLocaleDateString('en-GB') : '—'} →{' '}
          {d.endsAt ? new Date(d.endsAt).toLocaleDateString('en-GB') : '∞'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-24',
      render: (d) => <StatusBadge status={d.status} />,
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
        <div className="flex items-center gap-1.5">
          <Pill label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
          <Pill label="Code" active={filter === 'code'} onClick={() => setFilter('code')} />
          <Pill label="Automatic" active={filter === 'automatic'} onClick={() => setFilter('automatic')} />
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3 w-3" /> New code
        </Button>
      </div>

      <div className="text-xs text-evari-dim mb-2 font-mono tabular-nums">
        {filtered.length} of {discounts.length} discounts
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(d) => d.id}
      />

      <CreateDiscountDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={(d) => setDiscounts((prev) => [d, ...prev])}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

function CreateDiscountDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (d: ShopifyDiscount) => void;
}) {
  const [title, setTitle] = React.useState('');
  const [code, setCode] = React.useState('');
  const [mode, setMode] = React.useState<'percent' | 'amount'>('percent');
  const [percent, setPercent] = React.useState('10');
  const [amount, setAmount] = React.useState('25');
  const [endsAt, setEndsAt] = React.useState('');
  const [usageLimit, setUsageLimit] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setTitle('');
      setCode('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title || code,
        code,
      };
      if (mode === 'percent') {
        const p = Number(percent);
        if (!isFinite(p) || p <= 0 || p > 100) throw new Error('Percentage must be 1–100');
        body.percentage = p / 100;
      } else {
        body.amount = { amount, currencyCode: 'GBP' };
      }
      if (endsAt) body.endsAt = new Date(endsAt).toISOString();
      if (usageLimit) body.usageLimit = Number(usageLimit);

      const res = await fetch('/api/shopify/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { discount?: { id: string; code: string | null }; error?: string };
      if (!res.ok || !json.discount) throw new Error(json.error ?? 'Failed');
      onCreated({
        id: json.discount.id,
        title: title || code,
        kind: 'code',
        code: json.discount.code,
        status: 'ACTIVE',
        summary: mode === 'percent' ? `${percent}% off` : `GBP ${amount} off`,
        startsAt: new Date().toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        usageCount: 0,
        usageLimit: usageLimit ? Number(usageLimit) : null,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New discount code</DialogTitle>
          <DialogDescription>
            Creates a basic % or amount-off code on the whole catalogue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Code">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="WELCOME10"
              className="font-mono"
            />
          </Field>
          <Field label="Title (internal)">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="defaults to code if blank"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <div className="flex rounded-panel bg-evari-surface p-1 ring-1 ring-evari-edge/40">
                <SegmentBtn label="% off" active={mode === 'percent'} onClick={() => setMode('percent')} />
                <SegmentBtn label="£ off" active={mode === 'amount'} onClick={() => setMode('amount')} />
              </div>
            </Field>
            <Field label={mode === 'percent' ? 'Percentage' : 'Amount (GBP)'}>
              {mode === 'percent' ? (
                <Input value={percent} onChange={(e) => setPercent(e.target.value)} type="number" />
              ) : (
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" />
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ends at (optional)">
              <Input value={endsAt} onChange={(e) => setEndsAt(e.target.value)} type="date" />
            </Field>
            <Field label="Usage limit (optional)">
              <Input value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} type="number" />
            </Field>
          </div>
          {error && (
            <div className="rounded-md bg-evari-danger/15 ring-1 ring-evari-danger/30 px-3 py-2 text-xs text-evari-text">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-3 w-3" /> Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={submitting || !code}
          >
            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function SegmentBtn({
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
        'flex-1 rounded-sm px-2 py-1 text-xs uppercase tracking-[0.06em] transition-colors',
        active ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text',
      )}
    >
      {label}
    </button>
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
