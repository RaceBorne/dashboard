'use client';

import { useState } from 'react';
import { Plus, Globe, User, RefreshCw, CheckCircle2, AlertCircle, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { KeywordList } from '@/lib/keywords/workspace';

// -----------------------------------------------------------------------------
// Left-hand competitor sidebar. Sits directly after the main nav and lists:
//   1. A sticky header with the primary "Add competitor" action + sync-all icon
//   2. Our own list(s) pinned up top (gold accent)
//   3. Every competitor list below, with favicon + keyword count + freshness
//
// Clicking an item selects it — the detail panel on the right renders the
// relevant workspace for that list.
// -----------------------------------------------------------------------------

interface Props {
  lists: KeywordList[];
  activeListId: number | null;
  onSelect: (id: number) => void;
  onAddCompetitor: () => void;
  onSyncAll: () => void;
  onEditList: (list: KeywordList) => void;
  busy: boolean;
}

export function CompetitorSidebar({
  lists,
  activeListId,
  onSelect,
  onAddCompetitor,
  onSyncAll,
  onEditList,
  busy,
}: Props) {
  const own = lists.filter((l) => l.kind === 'own');
  const competitors = lists.filter((l) => l.kind === 'competitor');

  return (
    <aside className="w-[346px] shrink-0 border-r border-evari-surfaceSoft bg-evari-surface/40 flex flex-col">
      <div className="px-4 pt-5 pb-3 border-b border-evari-surfaceSoft">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dimmer">
              Workspaces
            </div>
            <div className="text-sm font-medium text-evari-text mt-0.5 truncate">
              {competitors.length} competitor{competitors.length === 1 ? '' : 's'}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {competitors.length > 0 ? (
              <button
                onClick={onSyncAll}
                disabled={busy}
                title="Re-sync every competitor"
                className="p-1.5 rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft transition-colors disabled:opacity-40"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
              </button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 gap-1 text-xs"
              onClick={onAddCompetitor}
              disabled={busy}
              title="Add competitor"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {own.length > 0 ? (
          <div className="px-2 mb-2">
            <SectionLabel>Us</SectionLabel>
            <div className="space-y-0.5 mt-1">
              {own.map((l) => (
                <SidebarItem
                  key={l.id}
                  list={l}
                  active={l.id === activeListId}
                  onClick={() => onSelect(l.id)}
                  onEdit={() => onEditList(l)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="px-2">
          <SectionLabel>Competitors</SectionLabel>
          <div className="space-y-0.5 mt-1">
            {competitors.length === 0 ? (
              <div className="px-3 py-3 text-xs text-evari-dimmer">
                No competitors yet. Add one to start tracking their keywords.
              </div>
            ) : (
              competitors.map((l) => (
                <SidebarItem
                  key={l.id}
                  list={l}
                  active={l.id === activeListId}
                  onClick={() => onSelect(l.id)}
                  onEdit={() => onEditList(l)}
                />
              ))
            )}
          </div>
        </div>
      </div>

    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
      {children}
    </div>
  );
}

function SidebarItem({
  list,
  active,
  onClick,
  onEdit,
}: {
  list: KeywordList;
  active: boolean;
  onClick: () => void;
  onEdit: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const faviconUrl = list.targetDomain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(list.targetDomain)}&sz=64`
    : null;
  const fresh = freshnessColour(list.lastSyncedAt);

  return (
    <div
      className={cn(
        'group relative rounded-md transition-colors',
        active
          ? 'bg-evari-surfaceSoft text-evari-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
          : 'text-evari-dim hover:bg-evari-surface hover:text-evari-text',
      )}
    >
      <button
        onClick={onClick}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 pr-9 rounded-md text-left"
      >
        <div className="h-7 w-7 rounded-md bg-evari-surface flex items-center justify-center shrink-0 overflow-hidden">
          {list.kind === 'own' ? (
            <User className="h-3.5 w-3.5 text-evari-gold" />
          ) : faviconUrl && !imgErr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={faviconUrl}
              alt=""
              className="h-4 w-4"
              onError={() => setImgErr(true)}
            />
          ) : (
            <Globe className="h-3.5 w-3.5 text-evari-dimmer" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{list.label}</div>
          <div className="flex items-center gap-1.5 text-[10px] text-evari-dimmer">
            <span className="tabular-nums">{list.memberCount} kw</span>
            <span>·</span>
            {list.lastSyncedAt ? (
              <span className={cn('inline-flex items-center gap-0.5', fresh.text)}>
                <CheckCircle2 className="h-2.5 w-2.5" />
                {relativeTime(list.lastSyncedAt)}
              </span>
            ) : list.kind === 'competitor' ? (
              <span className="inline-flex items-center gap-0.5 text-evari-dimmer">
                <AlertCircle className="h-2.5 w-2.5" />
                not synced
              </span>
            ) : (
              <span className="text-evari-dimmer">live</span>
            )}
          </div>
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        title="Edit list"
        className={cn(
          'absolute top-1.5 right-1.5 p-1.5 rounded-md transition-all',
          'text-evari-dimmer hover:text-evari-text hover:bg-evari-surface',
          'opacity-0 group-hover:opacity-100 focus:opacity-100',
        )}
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function freshnessColour(iso: string | null): { text: string } {
  if (!iso) return { text: 'text-evari-dimmer' };
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const hours = diff / 3_600_000;
  if (hours < 24) return { text: 'text-evari-success' };
  if (hours < 24 * 7) return { text: 'text-evari-dim' };
  return { text: 'text-evari-warn' };
}
