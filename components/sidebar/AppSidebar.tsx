'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
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
  PanelLeft,
  Stethoscope,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme/ThemeProvider';

// Pages that live inside the pipeline — used to keep the Pipeline link
// highlighted across every stage page, not only /plays.
// Every URL that counts as “inside the Ventures module”. Used to keep
// the Ventures sidebar entry highlighted across every stage page.
const VENTURE_PREFIXES = ['/ventures', '/plays', '/discover', '/prospects', '/leads', '/conversations'];

const NAV = [
  { href: '/', label: 'Briefing', icon: LayoutDashboard, group: 'today' },
  { href: '/tasks', label: 'To-do', icon: ListTodo, group: 'today' },
  { href: '/ventures', label: 'Ventures', icon: Rocket, group: 'pipeline' },
  { href: '/traffic', label: 'Traffic', icon: TrendingUp, group: 'web' },
  { href: '/seo', label: 'SEO Health', icon: Search, group: 'web', warn: true },
  { href: '/pages', label: 'Pages', icon: FileText, group: 'web' },
  { href: '/keywords', label: 'Keywords', icon: Hash, group: 'web' },
  { href: '/performance', label: 'Performance', icon: Gauge, group: 'web' },
  { href: '/backlinks', label: 'Backlinks', icon: Link2, group: 'web' },
  { href: '/synopsis', label: 'Synopsis', icon: Stethoscope, group: 'web' },
  { href: '/social', label: 'Social & blogs', icon: CalendarDays, group: 'broadcast' },
  { href: '/klaviyo', label: 'Klaviyo', icon: Mail, group: 'marketing' },
  { href: '/shopify', label: 'Shopify', icon: ShoppingBag, group: 'commerce' },
  { href: '/wireframe', label: 'Wireframe', icon: Network, group: 'system' },
  { href: '/users', label: 'Users', icon: Users, group: 'system' },
  { href: '/settings', label: 'Settings', icon: Settings, group: 'system' },
] as const;

const GROUP_LABELS: Record<string, string> = {
  today: 'Today',
  pipeline: 'Ventures',
  web: 'Website',
  broadcast: 'Broadcast',
  marketing: 'Marketing',
  commerce: 'Commerce',
  system: 'System',
};

const LS_KEY = 'evari.sidebar.collapsed';

// Don't steal arrow keys while the user is typing.
function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (t.isContentEditable) return true;
  return false;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { theme, logoLight, logoDark } = useTheme();
  const [openTaskCount, setOpenTaskCount] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount.
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

  // Arrow-key shortcut. Left → collapse, Right → expand. Skip while
  // the user is typing so filter boxes, edit fields, etc. still work.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') {
        setCollapsed(true);
      } else if (e.key === 'ArrowRight') {
        setCollapsed(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  // Group items
  const groups = NAV.reduce<Record<string, typeof NAV[number][]>>((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  const uploaded = theme === 'dark' ? logoDark : logoLight;
  const logoSrc =
    uploaded ??
    (theme === 'dark' ? '/evari-logo-on-dark.svg' : '/evari-logo-on-light.svg');

  return (
    <aside
      className={cn(
        'hidden lg:flex shrink-0 flex-col bg-evari-carbon sticky top-0 h-screen self-start transition-[width] duration-500 ease-evari',
        collapsed ? 'w-14' : 'w-60',
      )}
      aria-label="Main navigation"
    >
      {/* Brand + collapse toggle */}
      <div
        className={cn(
          'py-5 flex items-center',
          collapsed ? 'px-2 justify-center' : 'px-5 justify-between',
        )}
      >
        {!collapsed ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoSrc}
            alt="Evari"
            style={{ width: 110, height: 'auto' }}
            draggable={false}
          />
        ) : null}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand (→)' : 'Collapse (←)'}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surface/60 transition-colors"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav
        className={cn(
          'flex-1 overflow-y-auto py-3',
          collapsed ? 'px-1.5' : 'px-2',
        )}
      >
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-4">
            {!collapsed ? (
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-evari-dimmer font-medium">
                {GROUP_LABELS[group]}
              </div>
            ) : (
              /* thin divider between groups when collapsed */
              <div className="mx-2 my-2 h-px bg-evari-line/20 first:hidden" />
            )}
            <div className="space-y-0.5">
              {items.map((item) => {
                const active =
                  item.group === 'pipeline'
                    ? VENTURE_PREFIXES.some((px) => pathname === px || pathname.startsWith(px + '/') || pathname.startsWith(px + '?'))
                    : item.href === '/'
                      ? pathname === '/'
                      : pathname.startsWith(item.href);
                const Icon = item.icon;
                const navCount =
                  item.href === '/tasks' && openTaskCount && openTaskCount > 0
                    ? openTaskCount
                    : undefined;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center rounded-md text-sm transition-colors',
                      collapsed ? 'justify-center h-9 w-9 mx-auto' : 'gap-3 px-3 py-1.5',
                      active
                        ? 'bg-evari-surfaceSoft text-evari-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                        : 'text-evari-dim hover:bg-evari-surface/60 hover:text-evari-text',
                    )}
                    aria-label={collapsed ? item.label : undefined}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        active ? 'text-evari-text' : 'text-evari-dimmer',
                      )}
                    />
                    {!collapsed ? (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {navCount ? (
                          <span
                            className={cn(
                              'inline-flex items-center justify-center h-5 min-w-[20px] text-[10px] tabular-nums rounded-full',
                              navCount >= 10000
                                ? 'px-2.5'
                                : navCount >= 1000
                                  ? 'px-2'
                                  : navCount >= 100
                                    ? 'px-1.5'
                                    : 'px-1',
                              item.href === '/tasks'
                                ? 'bg-evari-warn text-evari-ink font-semibold'
                                : active
                                  ? 'bg-evari-surfaceSoft text-evari-dim'
                                  : 'bg-evari-surface/60 text-evari-dimmer',
                            )}
                          >
                            {navCount.toLocaleString()}
                          </span>
                        ) : null}
                        {'warn' in item && item.warn ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-evari-warn" />
                        ) : null}
                      </>
                    ) : navCount ? (
                      /* small dot on the icon when there are open tasks */
                      <span
                        className={cn(
                          'absolute h-1.5 w-1.5 rounded-full -translate-y-2 translate-x-2',
                          item.href === '/tasks' ? 'bg-evari-warn' : 'bg-evari-dim',
                        )}
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed ? (
        <div className="px-4 py-3 text-[11px] text-evari-dimmer leading-tight">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-evari-success" />
            <span>Supabase + integrations</span>
          </div>
          <div className="mt-1 text-evari-dimmer/80 font-mono">v0.1.0</div>
        </div>
      ) : (
        <div className="py-3 flex items-center justify-center">
          <span
            className="h-1.5 w-1.5 rounded-full bg-evari-success"
            title="Supabase + integrations"
          />
        </div>
      )}
    </aside>
  );
}
