'use client';

import { useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatNumber, formatPercent, cn } from '@/lib/utils';
import type { KeywordRow } from '@/lib/types';

const PRIORITY_TONE = { high: 'accent', medium: 'gold', low: 'muted' } as const;
const INTENT_TONE = {
  transactional: 'success',
  commercial: 'gold',
  informational: 'info',
  navigational: 'muted',
} as const;

const GRID_COLS =
  'grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto_auto_auto] gap-x-4';

export function KeywordsClient({
  initialKeywords,
}: {
  initialKeywords: KeywordRow[];
}) {
  const [keywords, setKeywords] = useState<KeywordRow[]>(initialKeywords);
  const [editing, setEditing] = useState<KeywordRow | null>(null);
  const confirm = useConfirm();

  const sorted = [...keywords].sort((a, b) => b.impressions - a.impressions);

  async function removeKeyword(k: KeywordRow) {
    const ok = await confirm({
      title: 'Stop tracking keyword?',
      description: `"${k.query}" will be removed from the tracker. Historic impressions and clicks are kept on record.`,
      confirmLabel: 'Stop tracking',
      tone: 'danger',
    });
    if (!ok) return;
    setKeywords((prev) => prev.filter((x) => x.id !== k.id));
  }

  function saveKeyword(
    id: string,
    changes: Partial<Pick<KeywordRow, 'url' | 'intent' | 'priority'>>,
  ) {
    setKeywords((prev) =>
      prev.map((k) => (k.id === id ? { ...k, ...changes } : k)),
    );
    setEditing(null);
  }

  return (
    <div className="p-6 max-w-[1600px] space-y-5">
      <div className="space-y-1">
        <div
          className={`grid ${GRID_COLS} px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium`}
        >
          <div className="text-left">Query</div>
          <div className="w-28 text-left">Intent</div>
          <div className="w-24 text-left">Priority</div>
          <div className="w-28 text-right">Impressions</div>
          <div className="w-20 text-right">Clicks</div>
          <div className="w-20 text-right">CTR</div>
          <div className="w-24 text-right">Position</div>
          <div className="w-20 text-right">7d</div>
        </div>

        {sorted.map((k) => {
          const Trend =
            k.positionDelta7d < 0
              ? ArrowUp
              : k.positionDelta7d > 0
                ? ArrowDown
                : ArrowRight;
          const trendColor =
            k.positionDelta7d < 0
              ? 'text-evari-success'
              : k.positionDelta7d > 0
                ? 'text-evari-danger'
                : 'text-evari-dim';
          return (
            <div
              key={k.id}
              className={`group relative grid ${GRID_COLS} bg-evari-surface/60 rounded-md px-4 py-3 items-center hover:bg-evari-surface transition-colors`}
            >
              <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  type="button"
                  aria-label="Edit keyword"
                  title="Edit"
                  onClick={() => setEditing(k)}
                  className="h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label="Stop tracking keyword"
                  title="Stop tracking"
                  onClick={() => void removeKeyword(k)}
                  className="h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-danger hover:bg-evari-surfaceSoft"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>

              <div className="min-w-0">
                <div className="text-sm text-evari-text truncate">{k.query}</div>
                {k.url && (
                  <div className="text-[11px] font-mono text-evari-dimmer mt-0.5 truncate">
                    {k.url}
                  </div>
                )}
              </div>
              <div className="w-28">
                <Badge
                  variant={INTENT_TONE[k.intent]}
                  className="text-[10px] capitalize"
                >
                  {k.intent}
                </Badge>
              </div>
              <div className="w-24">
                <Badge
                  variant={PRIORITY_TONE[k.priority]}
                  className="text-[10px] capitalize"
                >
                  {k.priority}
                </Badge>
              </div>
              <div className="w-28 text-right font-mono tabular-nums text-sm text-evari-dim">
                {formatNumber(k.impressions)}
              </div>
              <div className="w-20 text-right font-mono tabular-nums text-sm text-evari-text">
                {formatNumber(k.clicks)}
              </div>
              <div className="w-20 text-right font-mono tabular-nums text-sm text-evari-dim">
                {formatPercent(k.ctr, 1)}
              </div>
              <div className="w-24 text-right font-mono tabular-nums text-sm text-evari-text">
                {k.position.toFixed(1)}
              </div>
              <div className="w-20 text-right pr-6">
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 text-xs font-mono tabular-nums',
                    trendColor,
                  )}
                >
                  <Trend className="h-3 w-3" />
                  {Math.abs(k.positionDelta7d).toFixed(1)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit keyword</DialogTitle>
            </DialogHeader>
            <KeywordEditForm
              keyword={editing}
              onSubmit={(changes) => saveKeyword(editing.id, changes)}
              onCancel={() => setEditing(null)}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function KeywordEditForm({
  keyword,
  onSubmit,
  onCancel,
}: {
  keyword: KeywordRow;
  onSubmit: (changes: Partial<Pick<KeywordRow, 'url' | 'intent' | 'priority'>>) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(keyword.url ?? '');
  const [intent, setIntent] = useState<KeywordRow['intent']>(keyword.intent);
  const [priority, setPriority] = useState<KeywordRow['priority']>(keyword.priority);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      url: url.trim() || undefined,
      intent,
      priority,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium mb-1">
          Query
        </span>
        <div className="text-sm text-evari-text font-medium">{keyword.query}</div>
        <div className="text-[11px] text-evari-dimmer italic mt-1">
          Search query from GSC — not editable here.
        </div>
      </div>
      <label className="space-y-1 block">
        <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          Target URL
        </span>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="e.g. /products/evari-tour — the page we want to rank for this"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 block">
          <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
            Intent
          </span>
          <select
            value={intent}
            onChange={(e) => setIntent(e.target.value as KeywordRow['intent'])}
            className="w-full bg-evari-surface/70 rounded-md px-2 py-1.5 text-sm text-evari-text focus:outline-none focus:ring-1 focus:ring-evari-gold/50"
          >
            <option value="transactional">Transactional</option>
            <option value="commercial">Commercial</option>
            <option value="informational">Informational</option>
            <option value="navigational">Navigational</option>
          </select>
        </label>
        <label className="space-y-1 block">
          <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
            Priority
          </span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as KeywordRow['priority'])}
            className="w-full bg-evari-surface/70 rounded-md px-2 py-1.5 text-sm text-evari-text focus:outline-none focus:ring-1 focus:ring-evari-gold/50"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
      </div>
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
