'use client';

import { useState } from 'react';
import {
  RefreshCw,
  Plus,
  Globe,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { KeywordList } from '@/lib/keywords/workspace';

// -----------------------------------------------------------------------------
// Competitor cards grid — the registry surface at the top of /keywords.
//
// Each card represents one competitor list. Shows identity (favicon + label +
// domain), scale (keyword count), freshness (last sync time + cost), and a
// one-click re-sync. Clicking the card body scrolls + activates that list's tab.
//
// A "Sync all" button at the top fans out DFS ranked_keywords for every
// competitor in parallel — the fastest way to go from zero to a fully
// populated workspace.
// -----------------------------------------------------------------------------

interface Props {
  lists: KeywordList[];
  activeListId: number | null;
  onSelect: (id: number) => void;
  onAddCompetitor: () => void;
  busy: boolean;
  onSyncOne: (list: KeywordList) => void;
  onSyncAll: () => void;
}

export function CompetitorGrid({
  lists,
  activeListId,
  onSelect,
  onAddCompetitor,
  busy,
  onSyncOne,
  onSyncAll,
}: Props) {
  const competitors = lists.filter((l) => l.kind === 'competitor');

  return (
    <Card>
      <CardContent className="p-4 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-evari-text">Competitor registry</div>
            <div className="text-xs text-evari-dimmer">
              {competitors.length === 0
                ? 'No competitors yet — add your first to unlock the gap analysis.'
                : `${competitors.length} competitor${competitors.length === 1 ? '' : 's'} tracked. Each sync pulls up to 200 ranked keywords.`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onAddCompetitor} disabled={busy}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
            {competitors.length > 0 ? (
              <Button variant="primary" size="sm" onClick={onSyncAll} disabled={busy}>
                <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
                Sync all
              </Button>
            ) : null}
          </div>
        </div>

        {competitors.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {competitors.map((list) => (
              <CompetitorCard
                key={list.id}
                list={list}
                active={list.id === activeListId}
                busy={busy}
                onSelect={() => onSelect(list.id)}
                onSync={() => onSyncOne(list)}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CompetitorCard({
  list,
  active,
  busy,
  onSelect,
  onSync,
}: {
  list: KeywordList;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
  onSync: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const faviconUrl = list.targetDomain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(list.targetDomain)}&sz=64`
    : null;

  const freshnessTone = freshnessColour(list.lastSyncedAt);

  return (
    <div
      className={cn(
        'group rounded-lg bg-evari-surfaceSoft p-3 transition-all cursor-pointer',
        active
          ? 'ring-1 ring-evari-accent shadow-[0_4px_16px_rgba(0,0,0,0.25)]'
          : 'hover:bg-evari-mute/60',
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2.5">
        {/* Favicon / fallback */}
        <div className="h-9 w-9 rounded-panel bg-evari-surface flex items-center justify-center shrink-0 overflow-hidden">
          {faviconUrl && !imgErr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={faviconUrl}
              alt={`${list.label} favicon`}
              className="h-5 w-5"
              onError={() => setImgErr(true)}
            />
          ) : (
            <Globe className="h-4 w-4 text-evari-dimmer" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-evari-text truncate">{list.label}</span>
            {list.targetDomain ? (
              <a
                href={`https://${list.targetDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-evari-dimmer hover:text-evari-text"
                aria-label={`Visit ${list.targetDomain}`}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
          <div className="text-[11px] text-evari-dimmer truncate">{list.targetDomain}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] py-0">
            {list.memberCount} kw
          </Badge>
          {list.lastSyncedAt ? (
            <span className={cn('inline-flex items-center gap-1 text-[11px]', freshnessTone.text)}>
              <CheckCircle2 className="h-3 w-3" />
              {relativeTime(list.lastSyncedAt)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-evari-dimmer">
              <AlertCircle className="h-3 w-3" />
              never synced
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSync();
          }}
          disabled={busy}
          aria-label={`Re-sync ${list.label}`}
          className="text-evari-dimmer hover:text-evari-text disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
        </button>
      </div>

      {list.lastSyncCostUsd != null && list.lastSyncCostUsd > 0 ? (
        <div className="mt-1 text-[10px] text-evari-dimmer tabular-nums">
          Last sync: ${list.lastSyncCostUsd.toFixed(3)}
        </div>
      ) : null}
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Colour buckets for "when was this last synced":
//  <24h = success
//  1-7d = default
//  >7d  = warn
function freshnessColour(iso: string | null): { text: string } {
  if (!iso) return { text: 'text-evari-dimmer' };
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const hours = diff / 3_600_000;
  if (hours < 24) return { text: 'text-evari-success' };
  if (hours < 24 * 7) return { text: 'text-evari-dim' };
  return { text: 'text-evari-warn' };
}
