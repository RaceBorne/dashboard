'use client';

import * as React from 'react';
import { Search, Plus, Trash2, Loader2, Check, X, ArrowRight } from 'lucide-react';
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
import { DataTable, type Column } from './DataTable';
import type { ShopifyRedirect } from '@/lib/integrations/shopify';
import { cn } from '@/lib/utils';

/**
 * URL redirects manager. Two operations: create, delete. Editing in
 * place would require pull-then-push roundtrip; deleting + recreating
 * is the documented Shopify pattern and matches Shopify Admin's UX.
 */
export function RedirectsClient({
  initial,
  mock,
}: {
  initial: ShopifyRedirect[];
  mock: boolean;
}) {
  const [redirects, setRedirects] = React.useState<ShopifyRedirect[]>(initial);
  const [query, setQuery] = React.useState('');
  const [showCreate, setShowCreate] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<Set<string>>(new Set());

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return redirects;
    return redirects.filter((r) => `${r.path} ${r.target}`.toLowerCase().includes(q));
  }, [redirects, query]);

  const remove = async (id: string) => {
    if (!confirm('Delete this redirect? This cannot be undone.')) return;
    setPendingDelete((s) => new Set(s).add(id));
    try {
      const numeric = id.startsWith('gid://') ? id.split('/').pop()! : id;
      const res = await fetch(`/api/shopify/redirects/${encodeURIComponent(numeric)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setRedirects((prev) => prev.filter((r) => r.id !== id));
      } else {
        alert('Failed to delete redirect.');
      }
    } finally {
      setPendingDelete((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  };

  const columns: Column<ShopifyRedirect>[] = [
    {
      key: 'path',
      header: 'From',
      render: (r) => <code className="text-xs text-evari-text font-mono">{r.path}</code>,
    },
    {
      key: 'arrow',
      header: '',
      width: 'w-8',
      render: () => <ArrowRight className="h-3 w-3 text-evari-dimmer" />,
    },
    {
      key: 'target',
      header: 'To',
      render: (r) => <code className="text-xs text-evari-gold font-mono">{r.target}</code>,
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
            void remove(r.id);
          }}
          disabled={pendingDelete.has(r.id)}
          className="text-evari-dim hover:text-evari-danger disabled:opacity-50"
          aria-label="Delete redirect"
        >
          {pendingDelete.has(r.id) ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
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
            placeholder="Search path or target…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3 w-3" /> New redirect
        </Button>
      </div>

      <div className="text-xs text-evari-dim mb-2 font-mono tabular-nums">
        {filtered.length} of {redirects.length} redirects
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        empty="No redirects yet. Create one when you change a URL on the storefront."
      />

      <CreateRedirectDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={(r) => setRedirects((prev) => [r, ...prev])}
      />
    </>
  );
}

function CreateRedirectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (r: ShopifyRedirect) => void;
}) {
  const [path, setPath] = React.useState('');
  const [target, setTarget] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setPath('');
      setTarget('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const res = await fetch('/api/shopify/redirects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: cleanPath, target }),
      });
      const json = (await res.json()) as { redirect?: ShopifyRedirect; error?: string };
      if (!res.ok || !json.redirect) throw new Error(json.error ?? 'Failed');
      onCreated(json.redirect);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New redirect</DialogTitle>
          <DialogDescription>
            Permanent (301) redirect. Use when you rename a product or page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Field label="From (old path)">
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/products/old-name"
              className="font-mono text-xs"
            />
          </Field>
          <Field label="To (target)">
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="/products/new-name or https://…"
              className="font-mono text-xs"
            />
          </Field>
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
            disabled={submitting || !path || !target}
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
      <label
        className={cn(
          'block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer mb-1.5',
        )}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
