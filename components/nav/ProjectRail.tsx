'use client';

/**
 * ProjectRail — the "projects list" column that lives on the leftmost
 * side of every Pipeline stage page (Strategy, Discovery, Prospects,
 * Leads, Conversations).
 *
 * Every stage is scoped to a single project. This rail is how you pick
 * which project you are looking at. Clicking a project preserves the
 * current stage, so switching projects on /prospects stays on /prospects
 * with a new ?playId.
 *
 * Collapsible: mirrors AppSidebar exactly. w-14 icon-only / w-[260px]
 * full layout, persisted via localStorage so it stays where the user
 * left it. Default is expanded so first-time users see project titles.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Plus, Loader2, Rocket, PanelLeft } from 'lucide-react';
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

const LS_KEY = 'evari.project-rail.collapsed';

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
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate collapsed state from localStorage on mount.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(LS_KEY);
      if (v === '1') setCollapsed(true);
    } catch {
      // localStorage unavailable — default to expanded.
    }
    setHydrated(true);
  }, []);

  // Persist when it changes.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(LS_KEY, collapsed ? '1' : '0');
    } catch {
      // Non-fatal.
    }
  }, [collapsed, hydrated]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  // Figure out which play is selected from the URL if the caller did not
  // pass one in.
  const resolvedActiveId = useMemo(() => {
    if (activePlayId !== undefined) return activePlayId;
    const m = pathname.match(/^\/plays\/(play-[^/]+)/);
    if (m) return m[1];
    return searchParams?.get('playId') ?? null;
  }, [activePlayId, pathname, searchParams]);

  // If we are on a stage page we build project links that preserve the
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
    return '/ventures/' + id;
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
        window.location.href = '/ventures/' + body.id;
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
        'shrink-0 rounded-xl bg-evari-surface overflow-hidden flex flex-col transition-[width] duration-200 ease-out',
        collapsed ? 'w-14' : 'w-[260px]',
        className,
      )}
      aria-label="Projects"
    >
      {/* Header: section label (when expanded) + collapse toggle */}
      <div
        className={cn(
          'pt-3 pb-2 flex items-center',
          collapsed ? 'px-2 justify-center' : 'px-4 justify-between gap-2',
        )}
      >
        {!collapsed ? (
          <span className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium">
            Projects
          </span>
        ) : null}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand projects' : 'Collapse projects'}
          title={collapsed ? 'Expand projects' : 'Collapse projects'}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft/60 transition-colors"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Project list */}
      <div
        className={cn(
          'flex-1 overflow-y-auto pb-2 space-y-0.5',
          collapsed ? 'px-1.5' : 'px-2',
        )}
      >
        {plays === null ? (
          collapsed ? (
            <div className="px-1 py-2 flex justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-evari-dimmer" />
            </div>
          ) : (
            <div className="px-3 py-2 text-[11px] text-evari-dimmer">Loading…</div>
          )
        ) : plays.length === 0 ? (
          collapsed ? null : (
            <div className="px-3 py-2 text-[11px] text-evari-dimmer">
              No projects yet. Create one below.
            </div>
          )
        ) : (
          plays.map((play) => {
            const active = resolvedActiveId === play.id;
            const title = play.title || 'Untitled strategy';
            return (
              <Link
                key={play.id}
                href={projectHref(play.id)}
                title={collapsed ? title : undefined}
                aria-label={collapsed ? title : undefined}
                className={cn(
                  'flex items-center rounded-md text-sm transition-colors',
                  collapsed
                    ? 'justify-center h-9 w-9 mx-auto'
                    : 'gap-2.5 px-3 py-1.5',
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
                {!collapsed ? (
                  <span className="flex-1 truncate">{title}</span>
                ) : null}
              </Link>
            );
          })
        )}
      </div>

      {/* Footer: New project */}
      <div
        className={cn(
          'border-t border-evari-line/40',
          collapsed ? 'p-1.5' : 'p-2',
        )}
      >
        <button
          type="button"
          onClick={() => void createProject()}
          disabled={creating}
          title={collapsed ? (creating ? 'Creating…' : 'New project') : undefined}
          aria-label={collapsed ? 'New project' : undefined}
          className={cn(
            'flex items-center rounded-md text-sm w-full transition-colors',
            collapsed
              ? 'justify-center h-9 w-9 mx-auto'
              : 'gap-2.5 px-3 py-1.5 text-left',
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
          {!collapsed ? (
            <span className="flex-1">
              {creating ? 'Creating…' : 'New project'}
            </span>
          ) : null}
        </button>
      </div>
    </aside>
  );
}
