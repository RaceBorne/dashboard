'use client';

/**
 * Single Idea row card matching the new design: square icon tile,
 * title + star, brief, tag chips, status pill, updated date, owner
 * avatar + name. Replaces PlayRow's denser pipeline-counts layout
 * for the Ideas surface; the legacy PlayRow stays untouched.
 */

import Link from 'next/link';
import { useState } from 'react';
import { Building2, Car, Crown, MoreHorizontal, ShieldCheck, Star, Utensils } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Play } from '@/lib/types';

const ICON_BY_KEYWORD: Array<{ test: RegExp; Icon: React.ComponentType<{ className?: string }> }> = [
  { test: /yacht|boat|marine|sail/i, Icon: Crown },
  { test: /hotel|resort|hospitality/i, Icon: Building2 },
  { test: /car|automotive|dealer/i, Icon: Car },
  { test: /private|club|members/i, Icon: ShieldCheck },
  { test: /restaurant|dining|food/i, Icon: Utensils },
];

function pickIcon(p: Play): React.ComponentType<{ className?: string }> {
  const haystack = `${p.title} ${p.tags.join(' ')} ${p.brief}`;
  for (const m of ICON_BY_KEYWORD) if (m.test.test(haystack)) return m.Icon;
  return Crown;
}

function statusFromStage(stage: Play['stage']): { label: string; tone: 'progress' | 'draft' | 'archived' } {
  if (stage === 'retired') return { label: 'Archived', tone: 'archived' };
  if (stage === 'idea' || stage === 'researching') return { label: 'Draft', tone: 'draft' };
  return { label: 'In progress', tone: 'progress' };
}

function timeAgo(iso: string | undefined | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const m = Math.floor(ms / 60_000); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `Updated ${Math.floor(d / 7)}w ago`;
  return `Updated ${Math.floor(d / 30)}mo ago`;
}

export function IdeaCard({ play, onTogglePin }: { play: Play; onTogglePin?: (id: string, next: boolean) => void }) {
  const [pinned, setPinned] = useState(!!play.pinned);
  const Icon = pickIcon(play);
  const status = statusFromStage(play.stage);
  const ownerName = play.ownerName ?? 'You';
  const initials = ownerName.split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'YO';

  function togglePin(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !pinned;
    setPinned(next);
    onTogglePin?.(play.id, next);
  }

  return (
    <li>
      <Link
        href={`/strategy?playId=${play.id}`}
        className="group flex items-center gap-3 rounded-panel bg-evari-surface border border-evari-edge/30 hover:border-evari-gold/40 p-3 transition-colors"
      >
        <div className="h-12 w-12 shrink-0 rounded-md bg-evari-ink/40 flex items-center justify-center text-evari-dim border border-evari-edge/20">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-evari-text truncate">{play.title}</h3>
            <button
              type="button"
              onClick={togglePin}
              className={cn('shrink-0 transition', pinned ? 'text-evari-gold' : 'text-evari-dim hover:text-evari-gold')}
              title={pinned ? 'Remove from favourites' : 'Add to favourites'}
            >
              <Star className={cn('h-3.5 w-3.5', pinned ? 'fill-evari-gold' : '')} />
            </button>
          </div>
          {play.brief ? <p className="text-[12px] text-evari-dim mt-0.5 truncate">{play.brief}</p> : null}
          {play.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {play.tags.slice(0, 4).map((t) => (
                <span key={t} className="px-1.5 py-0.5 rounded text-[10px] bg-evari-ink/40 text-evari-dim">{t}</span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5 text-right">
          <StatusPill tone={status.tone} label={status.label} />
          <div className="text-[10px] text-evari-dimmer">{timeAgo(play.updatedAt)}</div>
          <div className="inline-flex items-center gap-1.5 text-[11px] text-evari-dim">
            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-evari-ink/40 text-[9px] font-semibold uppercase">{initials}</span>
            <span className="truncate max-w-[120px]">{ownerName}</span>
          </div>
        </div>
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="text-evari-dim hover:text-evari-text p-1 rounded transition opacity-0 group-hover:opacity-100" title="More">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </Link>
    </li>
  );
}

function StatusPill({ tone, label }: { tone: 'progress' | 'draft' | 'archived'; label: string }) {
  const cls =
    tone === 'progress' ? 'bg-evari-success/15 text-evari-success' :
    tone === 'draft' ? 'bg-evari-warn/15 text-evari-warn' :
    'bg-evari-ink/40 text-evari-dim';
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold', cls)}>{label}</span>;
}
