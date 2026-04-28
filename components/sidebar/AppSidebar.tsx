'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  Sparkles,
  Star,
  Database,
  Sun,
  Moon,
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
  Minimize2,
  Maximize2,
  X,
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

const NAV = [
  { href: '/', label: 'Home', icon: LayoutDashboard, group: 'today' },
  { href: '/briefing', label: 'Briefing', icon: LayoutDashboard, group: 'today' },
  { href: '/tasks', label: 'To-do', icon: ListTodo, group: 'today' },
  { href: '/ideas', label: 'Ideas', icon: Rocket, group: 'pipeline', child: true },
  { href: '/strategy', label: 'Strategy', icon: ListTodo, group: 'pipeline', child: true },
  { href: '/discover', label: 'Discover', icon: Search, group: 'pipeline', child: true },
  { href: '/shortlist', label: 'Shortlist', icon: Star, group: 'pipeline', child: true },
  { href: '/enrichment', label: 'Enrichment', icon: Database, group: 'pipeline', child: true },
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
  { href: '/email', label: 'Email', icon: Mail, group: 'marketing' },
  { href: '/people', label: 'People', icon: Users, group: 'marketing', child: true },
  { href: '/email/conversations', label: 'Conversations', icon: Mail, group: 'marketing', child: true },
  { href: '/email/audience', label: 'Audience', icon: Users, group: 'marketing', child: true },
  { href: '/email/templates', label: 'Templates', icon: Image, group: 'marketing', child: true },
  { href: '/email/campaigns', label: 'Campaigns', icon: Send, group: 'marketing', child: true },
  { href: '/email/statistics', label: 'Statistics', icon: TrendingUp, group: 'marketing', child: true },
  { href: '/email/flows', label: 'Flows', icon: GitBranch, group: 'marketing', child: true },
  // Setup group — touch-once-then-forget pages + integration plumbing.
  // Sits below Marketing in the sidebar so daily workflow items lead,
  // configuration follows. Klaviyo + Shopify live here too because
  // they're fundamentally integrations to set up once, not surfaces
  // the operator works in daily.
  { href: '/email/brand', label: 'Brand setup', icon: Palette, group: 'setup' },
  { href: '/email/domains', label: 'Domains', icon: Globe, group: 'setup' },
  { href: '/email/suppressions', label: 'Suppressions', icon: Ban, group: 'setup' },
  { href: '/email/assets', label: 'Assets', icon: Image, group: 'setup' },
  { href: '/email/settings', label: 'Email settings', icon: Settings, group: 'setup' },
  { href: '/scoring', label: 'Fit scoring', icon: Sparkles, group: 'setup' },
  { href: '/klaviyo', label: 'Klaviyo', icon: Mail, group: 'setup' },
  { href: '/shopify', label: 'Shopify', icon: ShoppingBag, group: 'setup' },
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
  const { theme, setTheme, logoLight, logoDark } = useTheme();
  const [openTaskCount, setOpenTaskCount] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [hidden, setHidden] = useState(false);
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

  // Arrow-key shortcut. Left toggles the sidebar fully open/closed
  // (matches the X close button behaviour). Right is reserved for the
  // AI pane on the other side. Skip while the user is typing so filter
  // boxes, edit fields, etc. still work.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') {
        setHidden((h) => !h);
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

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        className="hidden lg:inline-flex fixed left-3 bottom-3 z-30 items-center gap-1.5 px-3 py-1.5 rounded-full border border-evari-gold/40 bg-evari-surface text-evari-gold hover:brightness-110 shadow-lg transition text-[11px] font-semibold"
      >
        <Maximize2 className="h-3.5 w-3.5" /> Show nav
      </button>
    );
  }

  return (
    <aside
      className={cn(
        'hidden lg:flex shrink-0 flex-col bg-evari-surface border-r border-evari-edge/30 sticky top-0 h-screen self-start transition-[width] duration-500 ease-evari',
        collapsed ? 'w-14' : 'w-[320px]',
      )}
      aria-label="Main navigation"
    >
      {/* Brand + collapse toggle */}
      <div
        className={cn(
          'flex items-center border-b border-evari-edge/30 h-[44px]',
          collapsed ? 'px-2 justify-center' : 'px-3 justify-between',
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand"
            className="text-evari-dim hover:text-evari-text p-1 rounded transition"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div className="inline-flex items-center gap-0">
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Minimise sidebar"
              title="Minimise"
              className="text-evari-dim hover:text-evari-text p-1 rounded transition"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setHidden(true)}
              aria-label="Hide sidebar"
              title="Hide"
              className="text-evari-dim hover:text-evari-text p-1 rounded transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {!collapsed ? (
          <Link href="/" aria-label="Home" title="Home" className="inline-flex items-center hover:brightness-110 transition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt="Evari"
              style={{ width: 84, height: 'auto' }}
              draggable={false}
            />
          </Link>
        ) : null}
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
                // Highlight rule: per-item exact + nested match for
                // every link, so only one entry can be active at a
                // time. (Earlier versions lit every Prospecting child
                // whenever any venture URL was open — that's wrong;
                // operators want to see exactly which stage they're
                // looking at.)
                const active =
                  item.href === '/'
                    ? pathname === '/'
                    : item.href === '/social'
                      ? // Calendar: exact match only, so it doesn't
                        // stay active on /social/instagram etc.
                        pathname === '/social' ||
                        pathname.startsWith('/social?') ||
                        pathname === '/social/new' ||
                        pathname.startsWith('/social/new/')
                      : pathname === item.href ||
                        pathname.startsWith(item.href + '/') ||
                        pathname.startsWith(item.href + '?');
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
      {/* System pull-up. Triggered by the gear button in the footer
          row below, so it has no inline trigger of its own anymore.
          Darker bg than the sidebar so it reads as a discrete layer
          floating above. */}
      {(() => {
        const systemItems = groups['system'] ?? [];
        if (systemItems.length === 0) return null;
        const open = openGroups.has('system');
        return (
          <div className="shrink-0">
            {!collapsed ? (
              <div
                className={cn(
                  'overflow-hidden border-t border-evari-edge/30 bg-evari-ink transition-[max-height] duration-500 ease-evari',
                  open ? 'max-h-[400px]' : 'max-h-0 border-t-0',
                )}
                aria-hidden={!open}
              >
                <div className="space-y-0.5 px-2 py-2">
                  {systemItems.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + '/');
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors',
                          active
                            ? 'bg-evari-surface text-evari-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
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
            ) : (
              /* Collapsed sidebar: show system items inline as
                 icon-only links pinned to the bottom. No expand/
                 collapse since the icons already fit. */
              <div className="py-2 space-y-0.5 flex flex-col items-center border-t border-evari-edge/20">
                {systemItems.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
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

      {/* Footer — single row, mirrors the AI pane footer. Lozenge
          height matches the AI pane's input field; gear button matches
          its send button so the two panes read as a matched pair. The
          gear toggles the System pull-up above. */}
      {!collapsed ? (
        <div className="px-3 py-2 border-t border-evari-edge/30 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-evari-edge/40 hover:border-evari-gold/40 transition text-evari-dim hover:text-evari-text text-[10px] uppercase tracking-[0.12em]"
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button
            type="button"
            onClick={() => toggleGroup('system')}
            aria-expanded={openGroups.has('system')}
            aria-label="System"
            title="System"
            className="ml-auto inline-flex items-center justify-center h-8 w-8 rounded-md bg-evari-gold text-evari-goldInk hover:brightness-110 transition"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="py-3 flex flex-col items-center gap-2 border-t border-evari-edge/30">
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="text-evari-dim hover:text-evari-text transition"
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </aside>
  );
}
