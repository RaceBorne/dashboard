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
  ChevronDown,
  Instagram,
  Linkedin,
  Music,
  Send,
  GitBranch,
  Globe,
  Ban,
  Palette,
  Image,
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
  { href: '/ventures', label: 'Prospecting', icon: Rocket, group: 'pipeline' },
  { href: '/discover', label: 'Discover', icon: Search, group: 'pipeline', child: true },
  { href: '/leads', label: 'Leads', icon: Users, group: 'pipeline', child: true },
  { href: '/traffic', label: 'Traffic', icon: TrendingUp, group: 'web' },
  { href: '/seo', label: 'SEO Health', icon: Search, group: 'web', warn: true },
  { href: '/pages', label: 'Pages', icon: FileText, group: 'web' },
  { href: '/keywords', label: 'Keywords', icon: Hash, group: 'web' },
  { href: '/performance', label: 'Performance', icon: Gauge, group: 'web' },
  { href: '/backlinks', label: 'Backlinks', icon: Link2, group: 'web' },
  { href: '/synopsis', label: 'Synopsis', icon: Stethoscope, group: 'web' },
  { href: '/social', label: 'Calendar', icon: CalendarDays, group: 'broadcast' },
  { href: '/social/instagram', label: 'Instagram', icon: Instagram, group: 'broadcast', child: true },
  { href: '/social/tiktok', label: 'TikTok', icon: Music, group: 'broadcast', child: true },
  { href: '/social/linkedin', label: 'LinkedIn', icon: Linkedin, group: 'broadcast', child: true },
  { href: '/journals', label: 'Journals', icon: FileText, group: 'broadcast', child: true },
  { href: '/klaviyo', label: 'Klaviyo', icon: Mail, group: 'marketing' },
  { href: '/email', label: 'Email', icon: Mail, group: 'marketing' },
  { href: '/email/conversations', label: 'Conversations', icon: Mail, group: 'marketing', child: true },
  { href: '/email/audience', label: 'Audience', icon: Users, group: 'marketing', child: true },
  { href: '/email/templates', label: 'Templates', icon: Image, group: 'marketing', child: true },
  { href: '/email/campaigns', label: 'Campaigns', icon: Send, group: 'marketing', child: true },
  { href: '/email/statistics', label: 'Statistics', icon: TrendingUp, group: 'marketing', child: true },
  { href: '/email/flows', label: 'Flows', icon: GitBranch, group: 'marketing', child: true },
  { href: '/shopify', label: 'Shopify', icon: ShoppingBag, group: 'marketing' },
  // Setup group — touch-once-then-forget pages. Sits below Marketing in
  // the sidebar so daily workflow items lead, configuration follows.
  { href: '/email/brand', label: 'Brand setup', icon: Palette, group: 'setup' },
  { href: '/email/domains', label: 'Domains', icon: Globe, group: 'setup' },
  { href: '/email/suppressions', label: 'Suppressions', icon: Ban, group: 'setup' },
  { href: '/email/assets', label: 'Assets', icon: Image, group: 'setup' },
  { href: '/wireframe', label: 'Wireframe', icon: Network, group: 'system' },
  { href: '/users', label: 'Users', icon: Users, group: 'system' },
  { href: '/settings', label: 'Settings', icon: Settings, group: 'system' },
] as const;

const GROUP_LABELS: Record<string, string> = {
  today: 'Today',
  pipeline: 'Prospecting',
  web: 'Website',
  broadcast: 'Broadcast',
  marketing: 'Marketing',
  setup: 'Setup',
  system: 'System',
};

const LS_KEY = 'evari.sidebar.collapsed';
const LS_OPEN_GROUPS = 'evari.sidebar.openGroups';
// Every group is expanded by default. User collapses whichever
// sections they want out of the way, and the choice is remembered
// per-device.
const DEFAULT_OPEN_GROUPS: string[] = ['today', 'pipeline', 'web', 'broadcast', 'marketing', 'setup', 'system'];

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
  // Which groups are expanded. Set for O(1) membership checks.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(DEFAULT_OPEN_GROUPS));

  // Hydrate from localStorage on mount.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(LS_KEY);
      if (v === '1') setCollapsed(true);
      const raw = window.localStorage.getItem(LS_OPEN_GROUPS);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setOpenGroups(new Set(parsed.filter((k): k is string => typeof k === 'string')));
        }
      }
    } catch {
      // localStorage unavailable — defaults stand.
    }
    setHydrated(true);
  }, []);

  // Persist when it changes.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(LS_KEY, collapsed ? '1' : '0');
      window.localStorage.setItem(LS_OPEN_GROUPS, JSON.stringify([...openGroups]));
    } catch {
      // Non-fatal.
    }
  }, [collapsed, hydrated, openGroups]);

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
  const toggleGroup = useCallback((group: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

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
        {Object.entries(groups).filter(([g]) => g !== 'system').map(([group, items]) => {
          const groupOpen = openGroups.has(group);
          return (
          <div key={group} className="mb-4">
            {!collapsed ? (
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-evari-dimmer font-medium hover:text-evari-dim transition-colors"
                aria-expanded={groupOpen}
              >
                <ChevronDown
                  className={cn(
                    'h-3 w-3 text-evari-dimmer/70 transition-transform',
                    groupOpen ? '' : '-rotate-90',
                  )}
                />
                <span className="flex-1 text-left">{GROUP_LABELS[group]}</span>
              </button>
            ) : (
              /* thin divider between groups when collapsed */
              <div className="mx-2 my-2 h-px bg-evari-line/20 first:hidden" />
            )}
            <div
              className={cn(
                'space-y-0.5',
                !collapsed && !groupOpen ? 'hidden' : '',
              )}
            >
              {items.map((item) => {
                const active =
                  item.group === 'pipeline'
                    ? VENTURE_PREFIXES.some((px) => pathname === px || pathname.startsWith(px + '/') || pathname.startsWith(px + '?'))
                    : item.href === '/'
                      ? pathname === '/'
                      : item.href === '/social'
                        ? // Calendar: exact match only, so it doesn't
                          // stay active on /social/instagram etc.
                          pathname === '/social' ||
                          pathname.startsWith('/social?') ||
                          pathname === '/social/new' ||
                          pathname.startsWith('/social/new/')
                        : pathname.startsWith(item.href);
                const Icon = item.icon;
                const navCount =
                  item.href === '/tasks' && openTaskCount && openTaskCount > 0
                    ? openTaskCount
                    : undefined;
                const isChild = 'child' in item && item.child === true;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center rounded-md transition-colors',
                      collapsed ? 'justify-center h-9 w-9 mx-auto' : 'gap-3 px-3 py-1.5',
                      // Children sit indented under their parent
                      // (Calendar). The ml-3 + border-l draws a faint
                      // tree-line from the parent's icon-column down
                      // through the children, making the nesting
                      // unambiguous. Children also use a smaller font
                      // size + slightly dimmer label to read as
                      // secondary nav.
                      !collapsed && isChild
                        ? 'ml-3 pl-3 border-l border-evari-edge/30 text-xs'
                        : 'text-sm',
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
          );
        })}
      </nav>

      {/* System group — pinned to the bottom of the sidebar.
          When the user clicks the header the items grow UPWARD from
          0 → fit (max-h interpolated over 500ms ease-evari) so they
          unfold above the header. Source order inside the wrapper is
          items-then-header, which is what gives the upward-reveal
          feel: as max-height increases the items push the rest of
          the sidebar contents up by the same amount. */}
      {(() => {
        const systemItems = groups['system'] ?? [];
        if (systemItems.length === 0) return null;
        const open = openGroups.has('system');
        return (
          <div className="shrink-0 border-t border-evari-edge/20">
            {!collapsed ? (
              <>
                <div
                  className={cn(
                    'overflow-hidden transition-[max-height] duration-500 ease-evari',
                    open ? 'max-h-[400px]' : 'max-h-0',
                  )}
                  aria-hidden={!open}
                >
                  <div className="space-y-0.5 px-2 pt-2 pb-1">
                    {systemItems.map((item) => {
                      const active = pathname.startsWith(item.href);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            'flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors',
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
                          <span className="flex-1">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleGroup('system')}
                  aria-expanded={open}
                  className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-evari-dimmer font-medium hover:text-evari-dim transition-colors"
                >
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 text-evari-dimmer/70 transition-transform duration-500 ease-evari',
                      // Closed: chevron points UP to hint that the
                      // group reveals upward. Open: rotated back to
                      // its standard pointing-down position.
                      open ? '' : 'rotate-180',
                    )}
                  />
                  <span className="flex-1 text-left">System</span>
                </button>
              </>
            ) : (
              /* Collapsed sidebar: show system items inline as
                 icon-only links pinned to the bottom. No expand/
                 collapse since the icons already fit. */
              <div className="py-2 space-y-0.5 flex flex-col items-center">
                {systemItems.map((item) => {
                  const active = pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      aria-label={item.label}
                      className={cn(
                        'flex items-center justify-center h-9 w-9 rounded-md transition-colors',
                        active
                          ? 'bg-evari-surfaceSoft text-evari-text'
                          : 'text-evari-dimmer hover:bg-evari-surface/60 hover:text-evari-text',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

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
