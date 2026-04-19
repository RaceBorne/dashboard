'use client';

import { useState } from 'react';
import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatNumber, relativeTime } from '@/lib/utils';
import type { PageRecord } from '@/lib/types';

const TYPE_TONE = {
  home: 'gold',
  product: 'accent',
  collection: 'info',
  blog: 'muted',
  page: 'outline',
} as const;

const GRID_COLS =
  'grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto_auto] gap-x-4';

export function PagesClient({ initialPages }: { initialPages: PageRecord[] }) {
  const [pages, setPages] = useState<PageRecord[]>(initialPages);
  const [editing, setEditing] = useState<PageRecord | null>(null);
  const confirm = useConfirm();

  const sorted = [...pages].sort(
    (a, b) => b.organicSessions30d - a.organicSessions30d,
  );

  async function removePage(p: PageRecord) {
    const ok = await confirm({
      title: 'Stop tracking this page?',
      description: `"${p.title}" will be removed from the dashboard mirror. The page itself on evari.cc is untouched.`,
      confirmLabel: 'Stop tracking',
      tone: 'danger',
    });
    if (!ok) return;
    setPages((prev) => prev.filter((x) => x.id !== p.id));
  }

  function savePage(
    id: string,
    changes: Partial<
      Pick<PageRecord, 'title' | 'metaTitle' | 'metaDescription' | 'primaryKeyword'>
    >,
  ) {
    setPages((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, ...changes, lastEditedAt: new Date().toISOString() }
          : p,
      ),
    );
    setEditing(null);
  }

  return (
    <div className="p-6 max-w-[1600px] space-y-5">
      <div className="space-y-1">
        {/* Header row */}
        <div
          className={`grid ${GRID_COLS} px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium`}
        >
          <div className="text-left">Page</div>
          <div className="w-28 text-left">Type</div>
          <div className="w-56 text-left">Primary keyword</div>
          <div className="w-28 text-right whitespace-nowrap">Organic 30d</div>
          <div className="w-28 text-right whitespace-nowrap">Conversions 30d</div>
          <div className="w-24 text-right">Issues</div>
          <div className="w-24 text-right">Edited</div>
        </div>

        {/* Row boxes */}
        {sorted.map((p) => (
          <div
            key={p.id}
            className={`group relative grid ${GRID_COLS} bg-evari-surface/60 rounded-md px-4 py-3 items-center hover:bg-evari-surface transition-colors`}
          >
            {/* Edit / delete — top-right */}
            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <button
                type="button"
                aria-label="Edit page"
                title="Edit"
                onClick={() => setEditing(p)}
                className="h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label="Stop tracking page"
                title="Stop tracking"
                onClick={() => void removePage(p)}
                className="h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-danger hover:bg-evari-surfaceSoft"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>

            <div className="min-w-0">
              <div className="text-sm font-medium text-evari-text truncate">
                {p.title}
              </div>
              <div className="text-[11px] font-mono text-evari-dim flex items-center gap-1 mt-0.5">
                <span className="truncate">{p.path}</span>
                <a
                  href={'https://evari.cc' + p.path}
                  target="_blank"
                  rel="noreferrer"
                  className="text-evari-dimmer hover:text-evari-gold shrink-0"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              {!p.metaDescription && (
                <Badge variant="warning" className="text-[9px] mt-1.5">
                  missing meta description
                </Badge>
              )}
            </div>
            <div className="w-28">
              <Badge
                variant={TYPE_TONE[p.type]}
                className="text-[10px] capitalize"
              >
                {p.type}
              </Badge>
            </div>
            <div className="w-56 text-xs text-evari-dim truncate">
              {p.primaryKeyword ?? (
                <span className="italic text-evari-dimmer">unset</span>
              )}
            </div>
            <div className="w-28 text-right font-mono tabular-nums text-sm text-evari-text">
              {formatNumber(p.organicSessions30d)}
            </div>
            <div className="w-28 text-right font-mono tabular-nums text-sm text-evari-text">
              {formatNumber(p.conversions30d)}
            </div>
            <div className="w-24 text-right">
              <div className="flex items-center justify-end gap-0.5">
                {p.issues.length === 0 ? (
                  <span className="text-evari-dimmer text-xs">—</span>
                ) : (
                  p.issues.map((sev, i) => (
                    <span
                      key={i}
                      className={
                        'h-1.5 w-1.5 rounded-full ' +
                        (sev === 'critical'
                          ? 'bg-evari-danger'
                          : sev === 'warning'
                            ? 'bg-evari-warn'
                            : 'bg-sky-400')
                      }
                    />
                  ))
                )}
              </div>
            </div>
            <div className="w-24 text-right text-xs text-evari-dim font-mono tabular-nums pr-6">
              {relativeTime(p.lastEditedAt)}
            </div>
          </div>
        ))}
      </div>

      {/* Edit dialog */}
      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit page SEO</DialogTitle>
            </DialogHeader>
            <PageEditForm
              page={editing}
              onSubmit={(changes) => savePage(editing.id, changes)}
              onCancel={() => setEditing(null)}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function PageEditForm({
  page,
  onSubmit,
  onCancel,
}: {
  page: PageRecord;
  onSubmit: (changes: Partial<Pick<PageRecord, 'title' | 'metaTitle' | 'metaDescription' | 'primaryKeyword'>>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [metaTitle, setMetaTitle] = useState(page.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(page.metaDescription ?? '');
  const [primaryKeyword, setPrimaryKeyword] = useState(page.primaryKeyword ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      title: title.trim(),
      metaTitle: metaTitle.trim() || undefined,
      metaDescription: metaDescription.trim() || undefined,
      primaryKeyword: primaryKeyword.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label={`Path · ${page.path}`}>
        <div className="text-[11px] text-evari-dimmer italic">
          Path and type are owned by Shopify — edit in the admin there.
        </div>
      </Field>
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Primary keyword">
        <Input
          value={primaryKeyword}
          onChange={(e) => setPrimaryKeyword(e.target.value)}
          placeholder="e.g. ebike for knee rehab UK"
        />
      </Field>
      <Field label={`Meta title · ${metaTitle.length} chars (≤ 60 ideal)`}>
        <Input
          value={metaTitle}
          onChange={(e) => setMetaTitle(e.target.value)}
          placeholder="What Google shows as the page title in search"
        />
      </Field>
      <Field
        label={`Meta description · ${metaDescription.length} chars (≤ 160 ideal)`}
      >
        <Textarea
          value={metaDescription}
          onChange={(e) => setMetaDescription(e.target.value)}
          placeholder="The 1-2 sentence summary Google shows under the title"
          className="min-h-[80px]"
        />
      </Field>
      <p className="text-[11px] text-evari-dimmer italic">
        Saved here today — pushed back to Shopify via the Admin API once that
        connection is live.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" variant="primary">
          Save changes
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 block">
      <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
        {label}
      </span>
      {children}
    </label>
  );
}
