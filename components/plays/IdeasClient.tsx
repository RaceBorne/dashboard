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
import { Search, Star } from 'lucide-react';

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
          </div>
        </div>
      </div>

      {/* Two-column body. The grid itself doesn't scroll; the LEFT
          column scrolls its cards internally, the RIGHT column stays
          fixed alongside (sticky position keeps the panel pinned even
          when the parent content is taller). */}
      <div className="flex-1 min-h-0 px-gutter pb-5 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-panel h-full">
          {/* LEFT: tabs at top, scrollable cards list below. */}
          <div className="min-w-0 flex flex-col min-h-0">
            <div className="flex items-center gap-1 border-b border-evari-edge/30 shrink-0">
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

            <div className="flex-1 min-h-0 overflow-auto pt-3 no-scrollbar">
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
          </div>

          {/* RIGHT: opportunity panel. Top aligned with first card row
              by skipping the tabs height (~41px). Panel itself is a
              capped-height column that ends before the bottom of the
              page; cards scrolling on the left don't move it. */}
          <div className="min-w-0 hidden lg:block pt-[41px]">
            <NewIdeaPanel />
          </div>

          {/* On narrow viewports the panel sits BELOW the list. */}
          <div className="lg:hidden">
            <NewIdeaPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
