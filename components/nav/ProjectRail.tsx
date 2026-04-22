'use client';

/**
 * ProjectRail — the "projects list" column that lives on the leftmost
 * side of every Pipeline stage page (Strategy, Discovery, Prospects,
 * Leads, Conversations).
 *
 * Every stage is scoped to a single project. This rail is how you pick
 * which project you're looking at. Clicking a project preserves the
 * current stage, so switching projects on /prospects stays on /prospects
 * with a new ?playId.
 *
 * Replaces the old per-page "Folders" column — a play is now the
 * top-level grouping for all CRM rows.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Plus, Loader2, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

type PlayLite = { id: string; title: string; updatedAt: string };

// Stage routes the rail can sit next to. Used to keep the user on the
// same stage when they switch projects.
const STAGE_PATHS = [
  '/discover',
  '/prospects',
  '/leads',
  '/conversations',
] as const;

interface Props {
  /**
   * Optional explicit play id — e.g. on /plays/[id] the pathname is the
   * source of truth; stage pages pass ?playId. If omitted the rail falls
   * back to the pathname/searchParams.
   */
  activePlayId?: string | null;
  className?: string;
}

export function ProjectRail({ activePlayId, className }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [plays, setPlays] = useState<PlayLite[] | null>(null);
  const [creating, setCreating] = useState(false);

  // Figure out which play is selected from the URL if the caller didn't
  // pass one in.
  const resolvedActiveId = useMemo(() => {
    if (activePlayId !== undefined) return activePlayId;
    const m = pathname.match(/^\/plays\/(play-[^/]+)/);
    if (m) return m[1];
    return searchParams?.get('playId') ?? null;
  }, [activePlayId, pathname, searchParams]);

  // If we're on a stage page we build project links that preserve the
  // current stage — clicking a project on /prospects lands on
  // /prospects?playId=<new>.
  const currentStagePath = useMemo(() => {
    for (const s of STAGE_PATHS) {
      if (pathname === s || pathname.startsWith(s + '/')) return s;
    }
    return null;
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function refetch() {
      try {
        const r = await fetch('/api/plays', { cache: 'no-store' });
        const d = (await r.json()) as { ok?: boolean; plays?: PlayLite[] };
        if (cancelled) return;
        if (d.ok && Array.isArray(d.plays)) setPlays(d.plays);
      } catch {
        if (!cancelled) setPlays((prev) => prev ?? []);
      }
    }

    void refetch();

    // Any action that mutates plays (create, rename, delete) dispatches
    // this so the rail refreshes without a full reload.
    function onDirty() {
      void refetch();
    }
    window.addEventListener('evari:plays-dirty', onDirty);

    return () => {
      cancelled = true;
      window.removeEventListener('evari:plays-dirty', onDirty);
    };
  }, []);

  function projectHref(id: string): string {
    if (currentStagePath) return currentStagePath + '?playId=' + id;
    return '/plays/' + id;
  }

  async function createProject() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/plays', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
        id?: string;
      };
      if (body.ok && body.id) {
        window.location.href = '/plays/' + body.id;
      } else {
        setCreating(false);
      }
    } catch {
      setCreating(false);
    }
  }

  return (
    <aside
      className={cn(
        'w-[260px] shrink-0 rounded-xl bg-evari-surface overflow-hidden flex flex-col',
        className,
      )}
    >
      <div className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium">
        Projects
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {plays === null ? (
          <div className="px-3 py-2 text-[11px] text-evari-dimmer">Loading…</div>
        ) : plays.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-evari-dimmer">
            No projects yet. Create one below.
          </div>
        ) : (
          plays.map((play) => {
            const active = resolvedActiveId === play.id;
            return (
              <Link
                key={play.id}
                href={projectHref(play.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-evari-surfaceSoft text-evari-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                    : 'text-evari-dim hover:bg-evari-surface/60 hover:text-evari-text',
                )}
              >
                <Rocket
                  className={cn(
                    'h-4 w-4 shrink-0',
                    active ? 'text-evari-gold' : 'text-evari-dimmer',
                  )}
                />
                <span className="flex-1 truncate">
                  {play.title || 'Untitled strategy'}
                </span>
              </Link>
            );
          })
        )}
      </div>
      <div className="border-t border-evari-line/40 p-2">
        <button
          type="button"
          onClick={() => void createProject()}
          disabled={creating}
          className={cn(
            'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm w-full text-left transition-colors',
            creating
              ? 'text-evari-dimmer cursor-wait'
              : 'text-evari-dim hover:bg-evari-surfaceSoft hover:text-evari-text',
          )}
        >
          {creating ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-evari-dimmer" />
          ) : (
            <Plus className="h-4 w-4 shrink-0 text-evari-dimmer" />
          )}
          <span className="flex-1">
            {creating ? 'Creating…' : 'New project'}
          </span>
        </button>
      </div>
    </aside>
  );
}
