'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme/ThemeProvider';

// Pages that are inside the pipeline — used to keep the Pipeline link
// highlighted across every stage page, not only /plays.
const PIPELINE_PREFIXES = ['/plays', '/discover', '/prospects', '/leads', '/conversations'];

const NAV = [
  { href: '/', label: 'Briefing', icon: LayoutDashboard, group: 'today' },
  { href: '/tasks', label: 'To-do', icon: ListTodo, group: 'today' },
  { href: '/plays', label: 'Pipeline', icon: Rocket, group: 'pipeline' },
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

const GROUP_LABELS: Record<string, string> = {
  today: 'Today',
  pipeline: 'Pipeline',
  web: 'Website',
  broadcast: 'Broadcast',
  marketing: 'Marketing',
  commerce: 'Commerce',
  system: 'System',
};

export function AppSidebar() {
  const pathname = usePathname();
  const { theme, logoLight, logoDark } = useTheme();
  const [openTaskCount, setOpenTaskCount] = useState<number | null>(null);

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
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-4">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-evari-dimmer font-medium">
              {GROUP_LABELS[group]}
            </div>
            <div className="space-y-0.5">
              {items.map((item) => {
                // Pipeline stays highlighted across every stage page — the
                // project rail inside the page handles per-project context.
                const active =
                  item.group === 'pipeline'
                    ? PIPELINE_PREFIXES.some((px) => pathname === px || pathname.startsWith(px + '/') || pathname.startsWith(px + '?'))
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
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
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
