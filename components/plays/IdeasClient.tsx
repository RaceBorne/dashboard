'use client';

/**
 * Tabbed Ideas hub. Filters the existing plays list by status buckets
 * (All / Favourites / Drafts / In progress / Archived). Reuses
 * <PlayRow> for the actual row chrome so editing/navigation behaviour
 * stays consistent with what already worked.
 *
 * Maps the legacy stages to the new tabs:
 *   idea, researching          → Drafts
 *   building, ready, live      → In progress
 *   retired                    → Archived
 */

import { useMemo, useState } from 'react';
import { Search, Filter, Star } from 'lucide-react';

import type { Play } from '@/lib/types';
import { IdeaCard } from './IdeaCard';
import { NewIdeaPanel } from './NewIdeaPanel';
import { cn } from '@/lib/utils';

type Bucket = 'all' | 'favourites' | 'drafts' | 'in_progress' | 'archived';

interface CountsByPlay {
  prospects: number;
  leads: number;
  conversations: number;
}

interface Props {
  plays: Play[];
  counts: Map<string, CountsByPlay>;
}

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'all', label: 'All ideas' },
  { key: 'favourites', label: 'Favourites' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'archived', label: 'Archived' },
];

function bucketOf(p: Play): Bucket {
  if (p.stage === 'retired') return 'archived';
  if (p.stage === 'idea' || p.stage === 'researching') return 'drafts';
  return 'in_progress';
}

export function IdeasClient({ plays, counts }: Props) {
  const [active, setActive] = useState<Bucket>('all');
  const [search, setSearch] = useState('');

  const counts_by_bucket: Record<Bucket, number> = useMemo(() => {
    const out: Record<Bucket, number> = { all: plays.length, favourites: 0, drafts: 0, in_progress: 0, archived: 0 };
    for (const p of plays) {
      out[bucketOf(p)]++;
      if (p.pinned) out.favourites++;
    }
    return out;
  }, [plays]);

  const filtered = useMemo(() => {
    let arr = plays;
    if (active === 'favourites') arr = arr.filter((p) => p.pinned);
    else if (active !== 'all') arr = arr.filter((p) => bucketOf(p) === active);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.brief.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    // Newest first.
    return [...arr].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }, [plays, active, search]);

  return (
    // Two-column layout. Left column is the existing list of
    // opportunities (search + tabs + scrollable cards). Right column
    // is an inline 'new opportunity' panel that submits straight into
    // /strategy?playId=X&kickoff=1.
    <div className="flex-1 min-h-0 flex flex-col bg-evari-ink">
      <div className="shrink-0 px-gutter pt-5 pb-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <h1 className="text-[20px] font-bold text-evari-text">Ideas</h1>
            <p className="text-[12px] text-evari-dim">Capture, develop and organise new targeting concepts.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-evari-dim absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ideas..."
                className="pl-7 pr-2 py-1.5 rounded-panel bg-evari-surface text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none w-56"
              />
            </div>
            <button type="button" className="inline-flex items-center justify-center h-8 w-8 rounded-panel bg-evari-surface border border-evari-edge/40 text-evari-dim hover:text-evari-text hover:border-evari-gold/40 transition" title="Filters">
              <Filter className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable two-column body. */}
      <div className="flex-1 min-h-0 overflow-auto px-gutter pb-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-panel">
          {/* LEFT: tabs + ideas list */}
          <div className="min-w-0">
            <div className="flex items-center gap-1 border-b border-evari-edge/30 mb-3 sticky top-0 bg-evari-ink z-10">
              {BUCKETS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setActive(b.key)}
                  className={cn('inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition',
                    active === b.key
                      ? 'border-evari-gold text-evari-text'
                      : 'border-transparent text-evari-dim hover:text-evari-text')}
                >
                  {b.key === 'favourites' ? <Star className="h-3 w-3" /> : null}
                  <span>{b.label}</span>
                  <span className={cn('inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded text-[10px] font-mono tabular-nums',
                    active === b.key ? 'bg-evari-gold/15 text-evari-gold' : 'bg-evari-ink/40 text-evari-dim')}>
                    {counts_by_bucket[b.key]}
                  </span>
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-panel bg-evari-surface border border-evari-edge/30 p-10 text-center text-[13px] text-evari-dim">
                {search.trim() ? 'No ideas match that search.' : active === 'favourites' ? 'Star an idea to add it to favourites.' : 'No ideas in this bucket yet. Use the panel on the right to create one.'}
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((p) => (
                  <IdeaCard key={p.id} play={p} />
                ))}
              </ul>
            )}
          </div>

          {/* RIGHT: inline new-opportunity panel */}
          <NewIdeaPanel />
        </div>
      </div>
    </div>
  );
}
