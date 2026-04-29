'use client';

/**
 * Single Idea row card. Displays a sector-aware icon tile, title with
 * favourite star, brief that wraps to two lines (no aggressive single-
 * line truncate), tag chips, status pill, last-touched date, and the
 * owner. Clicking the row routes to /strategy?playId= for that play.
 */

import Link from 'next/link';
import { useState } from 'react';
import {
  Award, Bike, Briefcase, Building2, Car, Crown, Heart, MoreHorizontal,
  Plane, Rocket, ShieldCheck, Sparkles, Star, Stethoscope, Trees,
  Trophy, Users, Utensils,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Play } from '@/lib/types';

// Order matters: more specific keywords are listed first so they win
// when the haystack contains overlapping signals.
const ICON_BY_KEYWORD: Array<{ test: RegExp; Icon: React.ComponentType<{ className?: string }> }> = [
  { test: /knee|surgery|orthop|clinic|medical|rehab|physio/i, Icon: Stethoscope },
  { test: /healthcare|hospital|wellness/i,                 Icon: Heart },
  { test: /yacht|boat|marine|sail|aviation|jet|aircraft/i, Icon: Plane },
  { test: /hotel|resort|hospitality|spa/i,                 Icon: Building2 },
  { test: /car|automotive|dealer|supercar/i,               Icon: Car },
  { test: /golf|tennis|country club|members|club/i,        Icon: Award },
  { test: /restaurant|dining|food|chef/i,                  Icon: Utensils },
  { test: /sport|fitness|cycling|bike|gym|coach/i,         Icon: Bike },
  { test: /property|estate|real estate|developer/i,        Icon: Trees },
  { test: /finance|wealth|invest|broker/i,                 Icon: Briefcase },
  { test: /charity|community|education/i,                  Icon: Users },
  { test: /award|prize|trophy|elite|premier/i,             Icon: Trophy },
  { test: /private|exclusive|luxury|premium/i,             Icon: Crown },
  { test: /security|legal|compliance/i,                    Icon: ShieldCheck },
  { test: /startup|tech|software|platform/i,               Icon: Rocket },
];

function pickIcon(p: Play): React.ComponentType<{ className?: string }> {
  const haystack = `${p.title} ${p.tags.join(' ')} ${p.brief}`;
  for (const m of ICON_BY_KEYWORD) if (m.test.test(haystack)) return m.Icon;
  return Sparkles;
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
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
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
        className="group flex items-start gap-3 rounded-panel bg-evari-surface border border-evari-edge/30 hover:border-evari-gold/40 hover:bg-evari-surface/80 p-3 transition-colors"
      >
        {/* Sector-aware icon tile */}
        <div className="h-12 w-12 shrink-0 rounded-md bg-evari-gold/10 flex items-center justify-center text-evari-gold border border-evari-gold/20">
          <Icon className="h-5 w-5" />
        </div>

        {/* Card body. Vertical flow: title row (with star + status),
            then 2-line brief, then a compact footer row with owner +
            timestamp. No more separate right metadata column so the
            card holds up at narrow widths. */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-evari-text truncate flex-1 min-w-0">{play.title}</h3>
            <button
              type="button"
              onClick={togglePin}
              className={cn('shrink-0 transition', pinned ? 'text-evari-gold' : 'text-evari-dim hover:text-evari-gold')}
              title={pinned ? 'Remove from favourites' : 'Add to favourites'}
              aria-label="Toggle favourite"
            >
              <Star className={cn('h-3.5 w-3.5', pinned ? 'fill-evari-gold' : '')} />
            </button>
            <StatusPill tone={status.tone} label={status.label} />
          </div>

          {play.brief ? (
            <p className="text-[12px] text-evari-dim mt-1 leading-snug line-clamp-2">{play.brief}</p>
          ) : null}

          <div className="mt-2 flex items-center gap-2 text-[11px] text-evari-dim">
            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-evari-ink/40 text-[9px] font-semibold uppercase shrink-0">{initials}</span>
            <span className="truncate flex-1 min-w-0">{ownerName}</span>
            <span className="text-[10px] text-evari-dimmer tabular-nums shrink-0">{timeAgo(play.updatedAt)}</span>
            {play.tags.length > 0 ? (
              <span className="hidden md:inline-flex flex-wrap gap-1 ml-auto">
                {play.tags.slice(0, 2).map((t) => (
                  <span key={t} className="px-1.5 py-0.5 rounded text-[10px] bg-evari-ink/40 text-evari-dim">{t}</span>
                ))}
              </span>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="self-start text-evari-dim hover:text-evari-text p-1 rounded transition opacity-0 group-hover:opacity-100"
          title="More"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </Link>
    </li>
  );
}

function StatusPill({ tone, label }: { tone: 'progress' | 'draft' | 'archived'; label: string }) {
  const cls =
    tone === 'progress' ? 'bg-evari-success/15 text-evari-success' :
    tone === 'draft'    ? 'bg-evari-warn/15 text-evari-warn' :
                          'bg-evari-ink/40 text-evari-dim';
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold', cls)}>{label}</span>;
}
