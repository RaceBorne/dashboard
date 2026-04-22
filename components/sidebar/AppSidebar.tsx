'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Inbox,
  TrendingUp,
  Search,
  FileText,
  Hash,
  CalendarDays,
  Settings,
  ListTodo,
  Rocket,
  Users,
  Network,
  ShoppingBag,
  Gauge,
  Link2,
  Mail,
  Plus,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme/ThemeProvider';

// Static nav items. The 'pipeline' group is NOT in here — it's rendered
// dynamically as a live project list below.
const NAV = [
  { href: '/', label: 'Briefing', icon: LayoutDashboard, group: 'today' },
  { href: '/tasks', label: 'To-do', icon: ListTodo, group: 'today' },
  { href: '/traffic', label: 'Traffic', icon: TrendingUp, group: 'web' },
  { href: '/seo', label: 'SEO Health', icon: Search, group: 'web', warn: true },
  { href: '/pages', label: 'Pages', icon: FileText, group: 'web' },
  { href: '/keywords', label: 'Keywords', icon: Hash, group: 'web' },
  { href: '/performance', label: 'Performance', icon: Gauge, group: 'web' },
  { href: '/backlinks', label: 'Backlinks', icon: Link2, group: 'web' },
  { href: '/social', label: 'Social & blogs', icon: CalendarDays, group: 'broadcast' },
  { href: '/klaviyo', label: 'Klaviyo', icon: Mail, group: 'marketing' },
  { href: '/shopify', label: 'Shopify', icon: ShoppingBag, group: 'commerce' },
  { href: '/wireframe', label: 'Wireframe', icon: Network, group: 'system' },
  { href: '/users', label: 'Users', icon: Users, group: 'system' },
  { href: '/settings', label: 'Settings', icon: Settings, group: 'system' },
] as const;

// Ordering of groups in the rail. Pipeline is injected first after Today.
const GROUP_ORDER: readonly string[] = [
  'today',
  'web',
  'broadcast',
  'marketing',
  'commerce',
  'system',
];

const GROUP_LABELS: Record<string, string> = {
  today: 'Today',
  web: 'Website',
  broadcast: 'Broadcast',
  marketing: 'Marketing',
  commerce: 'Commerce',
  system: 'System',
};

// Pages that are Pipeline stages. Switching projects from the sidebar
// preserves the current stage — e.g. if you're on /discover and click a
// different project, you stay on /discover with a new ?playId.
const STAGE_PATHS = [
  '/discover',
  '/prospects',
  '/leads',
  '/conversations',
] as const;

type PlayLite = { id: string; title: string; updatedAt: string };

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme, logoLight, logoDark } = useTheme();
  const [openTaskCount, setOpenTaskCount] = useState<number | null>(null);
  const [plays, setPlays] = useState<PlayLite[] | null>(null);
  const [creating, setCreating] = useState(false);

  // Current play id: read from /plays/[id] pathname or from ?playId on a
  // stage page. Used to highlight the active project in the rail.
  const activePlayId = useMemo(() => {
    const m = pathname.match(/^\/plays\/(play-[^/]+)/);
    if (m) return m[1];
    return searchParams?.get('playId') ?? null;
  }, [pathname, searchParams]);

  // Current stage path (if we're on one) so the project-switch link can
  // preserve it. Otherwise default to /plays/[id].
  const currentStagePath = useMemo(() => {
    for (const s of STAGE_PATHS) {
      if (pathname === s || pathname.startsWith(s + '/')) return s;
    }
    return null;
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tasks/open-count')
      .then((r) => r.json())
      .then((d: { open?: number }) => {
        if (!cancelled && typeof d.open === 'number') setOpenTaskCount(d.open);
      })
      .catch(() => {
        if (!cancelled) setOpenTaskCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refetch() {
      try {
        const r = await fetch('/api/plays', { cache: 'no-store' });
        const d = (await r.json()) as { ok?: boolean; plays?: PlayLite[] };
        if (cancelled) return;
        if (d.ok && Array.isArray(d.plays)) {
          setPlays(d.plays);
        }
      } catch {
        if (!cancelled) setPlays((prev) => prev ?? []);
      }
    }

    void refetch();

    // Any agent/UI action that mutates plays dispatches this event so the
    // rail reflects new/renamed/deleted projects without a full reload.
    function onDirty() {
      void refetch();
    }
    window.addEventListener('evari:plays-dirty', onDirty);

    return () => {
      cancelled = true;
      window.removeEventListener('evari:plays-dirty', onDirty);
    };
  }, []);

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
        // Navigate via a full anchor so the new play's detail page picks
        // up a fresh server render with seeded strategy.
        window.location.href = '/plays/' + body.id;
      } else {
        setCreating(false);
      }
    } catch {
      setCreating(false);
    }
  }

  // Group static items.
  const groups = NAV.reduce<Record<string, typeof NAV[number][]>>((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  const uploaded = theme === 'dark' ? logoDark : logoLight;
  const logoSrc =
    uploaded ??
    (theme === 'dark' ? '/evari-logo-on-dark.svg' : '/evari-logo-on-light.svg');

  // Helper: build the href for a project list item. Preserves stage when
  // the user is already inside one.
  function projectHref(id: string): string {
    if (currentStagePath) return currentStagePath + '?playId=' + id;
    return '/plays/' + id;
  }

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-evari-carbon sticky top-0 h-screen self-start">
      {/* Brand */}
      <div className="px-5 py-5 flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          alt="Evari"
          style={{ width: 120, height: 'auto' }}
          draggable={false}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {GROUP_ORDER.map((group) => {
          if (group === 'today') {
            const items = groups[group] ?? [];
            return (
              <GroupBlock key={group} label={GROUP_LABELS[group]}>
                {items.map((item) => {
                  const active =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  const navCount =
                    item.href === '/tasks' && openTaskCount && openTaskCount > 0
                      ? openTaskCount
                      : undefined;
                  return (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      Icon={Icon}
                      active={active}
                      count={navCount}
                      countTone={item.href === '/tasks' ? 'warn' : 'default'}
                      warn={'warn' in item && item.warn ? true : false}
                    />
                  );
                })}
              </GroupBlock>
            );
          }

          const items = groups[group] ?? [];
          if (items.length === 0) return null;
          return (
            <GroupBlock key={group} label={GROUP_LABELS[group]}>
              {items.map((item) => {
                const active =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    Icon={Icon}
                    active={active}
                    warn={'warn' in item && item.warn ? true : false}
                  />
                );
              })}
            </GroupBlock>
          );
        }).flatMap((node, i, arr) =>
          // Inject the Pipeline group directly after 'today'.
          GROUP_ORDER[i] === 'today'
            ? [
                node,
                <GroupBlock key="pipeline" label="Pipeline">
                  {plays === null ? (
                    <div className="px-3 py-1.5 text-[11px] text-evari-dimmer">
                      Loading…
                    </div>
                  ) : plays.length === 0 ? (
                    <div className="px-3 py-1.5 text-[11px] text-evari-dimmer">
                      No projects yet.
                    </div>
                  ) : (
                    plays.map((play) => {
                      const active = activePlayId === play.id;
                      return (
                        <Link
                          key={play.id}
                          href={projectHref(play.id)}
                          className={cn(
                            'flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors',
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
                  <button
                    type="button"
                    onClick={() => void createProject()}
                    disabled={creating}
                    className={cn(
                      'mt-1 flex items-center gap-3 rounded-md px-3 py-1.5 text-sm w-full text-left transition-colors',
                      creating
                        ? 'text-evari-dimmer cursor-wait'
                        : 'text-evari-dim hover:bg-evari-surface/60 hover:text-evari-text',
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
                </GroupBlock>,
              ]
            : [node],
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 text-[11px] text-evari-dimmer leading-tight">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-evari-success" />
          <span>Supabase + integrations</span>
        </div>
        <div className="mt-1 text-evari-dimmer/80 font-mono">v0.1.0</div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function GroupBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-evari-dimmer font-medium">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavLink({
  href,
  label,
  Icon,
  active,
  count,
  countTone = 'default',
  warn = false,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  count?: number;
  countTone?: 'default' | 'warn';
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-evari-surfaceSoft text-evari-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
          : 'text-evari-dim hover:bg-evari-surface/60 hover:text-evari-text',
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0',
          active ? 'text-evari-text' : 'text-evari-dimmer',
        )}
      />
      <span className="flex-1">{label}</span>
      {count ? (
        <span
          className={cn(
            'inline-flex items-center justify-center h-5 min-w-[20px] text-[10px] tabular-nums rounded-full',
            count >= 10000
              ? 'px-2.5'
              : count >= 1000
                ? 'px-2'
                : count >= 100
                  ? 'px-1.5'
                  : 'px-1',
            countTone === 'warn'
              ? 'bg-evari-warn text-evari-ink font-semibold'
              : active
                ? 'bg-evari-surfaceSoft text-evari-dim'
                : 'bg-evari-surface/60 text-evari-dimmer',
          )}
        >
          {count.toLocaleString()}
        </span>
      ) : null}
      {warn ? <span className="h-1.5 w-1.5 rounded-full bg-evari-warn" /> : null}
    </Link>
  );
}
