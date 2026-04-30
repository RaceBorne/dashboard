'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme/ThemeProvider';

const NAV = [
  { href: '/', label: 'Home', icon: LayoutDashboard, group: 'today' },
  { href: '/briefing', label: 'Briefing', icon: LayoutDashboard, group: 'today' },
  { href: '/tasks', label: 'To-do', icon: ListTodo, group: 'today' },
  { href: '/ideas', label: 'Ideas', icon: Rocket, group: 'pipeline' },
  { href: '/strategy', label: 'Strategy', icon: ListTodo, group: 'pipeline' },
  { href: '/strategy?step=market',   label: 'Market analysis', icon: ListTodo, group: 'pipeline', child: true, parent: '/strategy' },
  { href: '/strategy?step=target',   label: 'Target profile',  icon: ListTodo, group: 'pipeline', child: true, parent: '/strategy' },
  { href: '/strategy?step=synopsis', label: 'Synopsis',        icon: ListTodo, group: 'pipeline', child: true, parent: '/strategy' },
  { href: '/strategy?step=handoff',  label: 'Handoff',         icon: ListTodo, group: 'pipeline', child: true, parent: '/strategy' },
  { href: '/discover', label: 'Discovery', icon: Search, group: 'pipeline' },
  { href: '/shortlist', label: 'Shortlist', icon: Star, group: 'pipeline' },
  { href: '/enrichment', label: 'Enrichment', icon: Database, group: 'pipeline' },
  { href: '/leads', label: 'Leads', icon: Users, group: 'pipeline' },
  { href: '/email', label: 'Email', icon: Mail, group: 'marketing' },
  { href: '/email/campaigns', label: 'Campaigns', icon: Send, group: 'marketing', child: true },
  { href: '/email/templates', label: 'Templates', icon: Image, group: 'marketing', child: true },
  { href: '/email/audience', label: 'Audience', icon: Users, group: 'marketing', child: true },
  { href: '/people', label: 'People', icon: Users, group: 'marketing', child: true },
  { href: '/email/conversations', label: 'Conversations', icon: Mail, group: 'marketing', child: true },
  { href: '/email/statistics', label: 'Statistics', icon: TrendingUp, group: 'marketing', child: true },
  { href: '/email/flows', label: 'Flows', icon: GitBranch, group: 'marketing', child: true },
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
  // Content group — asset library + reusable design templates.
  // Parent rows (Library, Templates) are full size; per-channel
  // template entries below sit as children of Templates.
  { href: '/email/assets', label: 'Asset library', icon: Image, group: 'content' },
  { href: '/email/templates', label: 'Templates', icon: FileText, group: 'content' },
  { href: '/email/templates?kind=newsletter', label: 'Newsletter', icon: Mail, group: 'content', child: true },
  { href: '/email/templates?kind=email', label: 'Email', icon: Mail, group: 'content', child: true },
  { href: '/email/templates?kind=instagram', label: 'Instagram', icon: Instagram, group: 'content', child: true },
  { href: '/email/templates?kind=tiktok', label: 'TikTok', icon: Music, group: 'content', child: true },
  { href: '/email/templates?kind=facebook', label: 'Facebook', icon: Send, group: 'content', child: true },
  { href: '/email/templates?kind=linkedin', label: 'LinkedIn', icon: Linkedin, group: 'content', child: true },
  // Setup group — touch-once-then-forget pages + integration plumbing.
  // Sits below Marketing in the sidebar so daily workflow items lead,
  // configuration follows. Klaviyo + Shopify live here too because
  // they're fundamentally integrations to set up once, not surfaces
  // the operator works in daily.
  { href: '/context', label: 'Context', icon: Briefcase, group: 'setup' },
  { href: '/email/brand', label: 'Brand setup', icon: Palette, group: 'setup' },
  { href: '/email/domains', label: 'Domains', icon: Globe, group: 'setup' },
  { href: '/email/suppressions', label: 'Suppressions', icon: Ban, group: 'setup' },
  { href: '/prospecting/exclusions', label: 'Prospecting exclusions', icon: Ban, group: 'setup' },
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
  marketing: 'Marketing',
  broadcast: 'Broadcast',
  content: 'Content',
  web: 'Website Statistics',
  setup: 'Setup',
  system: 'System',
};

const LS_KEY = 'evari.sidebar.collapsed';
const LS_OPEN_GROUPS = 'evari.sidebar.openGroups';
// Every group is expanded by default. User collapses whichever
// sections they want out of the way, and the choice is remembered
// per-device.
const DEFAULT_OPEN_GROUPS: string[] = ['today', 'pipeline', 'web', 'broadcast', 'marketing', 'content', 'setup', 'system'];

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
  const searchParams = useSearchParams();
  const { theme, setTheme, logoLight, logoDark } = useTheme();
  const [openTaskCount, setOpenTaskCount] = useState<number | null>(null);
  const [followupCount, setFollowupCount] = useState<number | null>(null);
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
    // Pending follow-up suggestions surface as a count badge on the
    // Statistics nav item so the operator sees there's something to
    // act on without having to open the page first.
    fetch('/api/marketing/followups')
      .then((r) => r.json())
      .then((d: { suggestions?: Array<{ status?: string }> }) => {
        if (cancelled) return;
        const pending = (d.suggestions ?? []).filter((s) => s.status === 'pending').length;
        setFollowupCount(pending);
      })
      .catch(() => {
        if (!cancelled) setFollowupCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);
  // Inline groups: only one open at a time. Setup + System are
  // pull-up modals (different presentation), so they stay
  // independent and don't accordion-collapse the main groups.
  const INLINE_GROUPS = ['today', 'pipeline', 'web', 'broadcast', 'marketing', 'content'];
  const toggleGroup = useCallback((group: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      const isInline = INLINE_GROUPS.includes(group);
      if (next.has(group)) {
        next.delete(group);
      } else {
        if (isInline) {
          // Close every other inline group so opening one auto-closes
          // the rest. Pull-ups (setup, system) untouched.
          for (const g of INLINE_GROUPS) {
            if (g !== group) next.delete(g);
          }
        }
        next.add(group);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refs for click-outside dismissal of the System pull-up. We need
  // both the pull-up itself AND the gear trigger excluded from the
  // outside-click test, otherwise clicking the gear would re-open the
  // group in the same tick that the document handler closes it.
  const systemPanelRef = useRef<HTMLDivElement | null>(null);
  const systemTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!openGroups.has('system')) return;
    function close() {
      setOpenGroups((prev) => {
        if (!prev.has('system')) return prev;
        const next = new Set(prev);
        next.delete('system');
        return next;
      });
    }
    function onPointer(e: PointerEvent | MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (systemPanelRef.current?.contains(t)) return;
      if (systemTriggerRef.current?.contains(t)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    // pointerdown covers mouse, pen and touch in one go; mousedown is
    // a belt-and-braces fallback for any input type that doesn't fire
    // pointer events. Both run before click, so the panel is gone by
    // the time the click handler on whatever-was-clicked fires.
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [openGroups]);

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
        className="hidden lg:inline-flex fixed left-3 bottom-3 z-30 items-center gap-1.5 px-3 py-1.5 rounded-full border border-evari-gold/40 bg-evari-surface text-evari-gold hover:brightness-110 shadow-lg transition text-[13px] font-semibold"
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
        {Object.entries(groups).filter(([g]) => g !== 'system' && g !== 'setup').map(([group, items]) => {
          const groupOpen = openGroups.has(group);
          return (
          <div key={group} className="mb-4">
            {!collapsed ? (
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[12px] uppercase tracking-[0.16em] text-evari-dimmer font-medium hover:text-evari-dim transition-colors"
                aria-expanded={groupOpen}
              >
                <ChevronDown
                  className={cn(
                    'h-3 w-3 text-evari-dimmer/70 transition-transform duration-500 ease-in-out',
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
                'grid transition-all duration-500 ease-in-out',
                (collapsed || groupOpen) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
              )}
            >
              <div className="overflow-hidden">
                <div className="space-y-0.5">
              {(() => {
                // Pre-compute which parent paths have children in this
                // group so the chevron + collapsible logic knows about
                // them. parentRequiresChildren[href] === true means
                // 'show a chevron next to this item; its children
                // should fold out when the user is on this URL'.
                type NavItem = typeof NAV[number] & { parent?: string };
                const childrenByParent = new Map<string, NavItem[]>();
                for (const it of items as NavItem[]) {
                  if ('parent' in it && it.parent) {
                    const list = childrenByParent.get(it.parent) ?? [];
                    list.push(it);
                    childrenByParent.set(it.parent, list);
                  }
                }
                // Active match: query-aware. An item with `?step=foo`
                // in its href is active only when the URL also has
                // step=foo.
                function activeMatch(href: string): boolean {
                  if (href === '/') return pathname === '/';
                  if (href === '/social') {
                    return (
                      pathname === '/social' ||
                      pathname.startsWith('/social?') ||
                      pathname === '/social/new' ||
                      pathname.startsWith('/social/new/')
                    );
                  }
                  const [path, query] = href.split('?');
                  if (pathname !== path && !pathname.startsWith(path + '/')) return false;
                  if (!query) return true;
                  const sp = new URLSearchParams(query);
                  for (const [k, v] of sp.entries()) {
                    if (searchParams?.get(k) !== v) return false;
                  }
                  return true;
                }
                return items.map((item) => {
                  const it = item as NavItem;
                  const isChild = 'child' in it && it.child === true;
                  const itemParent = 'parent' in it ? it.parent : undefined;
                  // Drive child visibility off whether the parent's path
                  // is active. We keep the row mounted and animate the
                  // height via grid-rows-1fr/0fr below so it folds in
                  // smoothly instead of popping in/out.
                  let childVisible = true;
                  if (isChild && itemParent && !collapsed) {
                    childVisible = pathname === itemParent || pathname.startsWith(itemParent + '/');
                  }
                  const childList = childrenByParent.get(it.href) ?? [];
                  const hasChildren = childList.length > 0;
                  const childrenVisible = hasChildren
                    && (pathname === it.href || pathname.startsWith(it.href + '/'));
                  // Parent dims when one of its children is active so
                  // we don't show two highlights at once.
                  let active = activeMatch(it.href);
                  if (active && hasChildren) {
                    if (childList.some((c) => activeMatch(c.href))) active = false;
                  }
                  const Icon = it.icon;
                  const navCount =
                    it.href === '/tasks' && openTaskCount && openTaskCount > 0
                      ? openTaskCount
                      : it.href === '/email/statistics' && followupCount && followupCount > 0
                        ? followupCount
                        : undefined;
                  const linkEl = (
                  <Link
                    key={it.href}
                    href={it.href}
                    title={collapsed ? it.label : undefined}
                    className={cn(
                      'flex items-center rounded-md transition-colors',
                      collapsed ? 'justify-center h-9 w-9 mx-auto' : 'gap-3 px-3 py-1.5',
                      // Children sit indented under their parent.
                      // The ml-3 + border-l draws a faint tree-line so
                      // nesting reads unambiguously; smaller font keeps
                      // them visually subordinate.
                      !collapsed && isChild
                        ? 'ml-3 pl-3 border-l border-evari-edge/30 text-sm'
                        : 'text-base',
                      active
                        ? 'bg-black text-white font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                        : 'text-evari-dim hover:bg-evari-surface/60 hover:text-evari-text',
                    )}
                    aria-label={collapsed ? it.label : undefined}
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
                              'inline-flex items-center justify-center h-5 min-w-[20px] text-[12px] tabular-nums rounded-full',
                              navCount >= 10000
                                ? 'px-2.5'
                                : navCount >= 1000
                                  ? 'px-2'
                                  : navCount >= 100
                                    ? 'px-1.5'
                                    : 'px-1',
                              item.href === '/tasks' || item.href === '/email/statistics'
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
                        {hasChildren ? (
                          <ChevronDown
                            className={cn(
                              'h-3 w-3 shrink-0 transition-transform duration-500 ease-in-out',
                              childrenVisible ? 'text-evari-dim' : '-rotate-90 text-evari-dimmer/70',
                            )}
                          />
                        ) : null}
                      </>
                    ) : navCount ? (
                      /* small dot on the icon when there are open tasks */
                      <span
                        className={cn(
                          'absolute h-1.5 w-1.5 rounded-full -translate-y-2 translate-x-2',
                          item.href === '/tasks' || item.href === '/email/statistics' ? 'bg-evari-warn' : 'bg-evari-dim',
                        )}
                      />
                    ) : null}
                  </Link>
                  );
                  if (isChild && itemParent && !collapsed) {
                    return (
                      <div
                        key={it.href}
                        className={cn(
                          'grid transition-all duration-500 ease-in-out',
                          childVisible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                        )}
                      >
                        <div className="overflow-hidden">{linkEl}</div>
                      </div>
                    );
                  }
                  return linkEl;
                });
              })()}
                </div>
              </div>
            </div>
          </div>
          );
        })}
      </nav>

      {/* System pull-up. Triggered by the gear button in the footer
          row below, so it has no inline trigger of its own anymore.
          Darker bg than the sidebar so it reads as a discrete layer
          floating above. Clicking outside dismisses it (see effect on
          systemPanelRef + systemTriggerRef above). */}
      {(() => {
        const systemItems = groups['system'] ?? [];
        const setupItems = groups['setup'] ?? [];
        if (systemItems.length === 0 && setupItems.length === 0) return null;
        const open = openGroups.has('system');
        return (
          <div ref={systemPanelRef} className="shrink-0">
            {!collapsed ? (
              <div
                className={cn(
                  'overflow-hidden border-t border-evari-edge/30 bg-evari-ink transition-[max-height] duration-500 ease-evari',
                  open ? 'max-h-[700px]' : 'max-h-0 border-t-0',
                )}
                aria-hidden={!open}
              >
                <div className="space-y-0.5 px-2 py-2">
                  {/* Setup sub-section. Lives inside the Settings
                      pull-up so it doesn't clutter the main nav, but
                      keeps its collapsible dropdown so the user can
                      hide it once they've finished initial setup. */}
                  {(groups['setup'] ?? []).length > 0 ? (
                    <div className="mb-1">
                      <button
                        type="button"
                        onClick={() => toggleGroup('setup')}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[12px] uppercase tracking-[0.16em] text-evari-dimmer font-medium hover:text-evari-dim transition-colors"
                        aria-expanded={openGroups.has('setup')}
                      >
                        <ChevronDown
                          className={cn(
                            'h-3 w-3 text-evari-dimmer/70 transition-transform',
                            openGroups.has('setup') ? '' : '-rotate-90',
                          )}
                        />
                        <span className="flex-1 text-left">Setup</span>
                      </button>
                      <div
                        className={cn(
                          'overflow-hidden transition-[max-height] duration-300 ease-evari',
                          openGroups.has('setup') ? 'max-h-[500px]' : 'max-h-0',
                        )}
                      >
                        <div className="space-y-0.5">
                          {(groups['setup'] ?? []).map((item) => {
                            const active = pathname === item.href || pathname.startsWith(item.href + '/');
                            const Icon = item.icon;
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                  'flex items-center gap-3 px-3 py-1.5 rounded-md text-base transition-colors',
                                  active
                                    ? 'bg-evari-surface text-evari-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                                    : 'text-evari-dim hover:bg-evari-surface/60 hover:text-evari-text',
                                )}
                              >
                                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-evari-text' : 'text-evari-dimmer')} />
                                <span className="flex-1">{item.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                      <div className="my-1.5 mx-2 h-px bg-evari-line/20" />
                    </div>
                  ) : null}
                  {systemItems.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + '/');
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-1.5 rounded-md text-base transition-colors',
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
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-evari-edge/40 hover:border-evari-gold/40 transition text-evari-dim hover:text-evari-text text-[12px] uppercase tracking-[0.12em]"
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button
            ref={systemTriggerRef}
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
