'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Inbox,
  MessageSquare,
  TrendingUp,
  Search,
  FileText,
  Hash,
  CalendarDays,
  Settings,
  ListTodo,
  Plug,
  Rocket,
  Flag,
  Users,
  Network,
} from 'lucide-react';
import { MOCK_PLAYS } from '@/lib/mock/plays';
import { MOCK_PROSPECTS } from '@/lib/mock/prospects';
import { cn } from '@/lib/utils';
import { MOCK_TASKS } from '@/lib/mock/tasks';
import { useTheme } from '@/components/theme/ThemeProvider';

const OPEN_TASKS = MOCK_TASKS.filter((t) => t.status !== 'done').length;

const NAV = [
  { href: '/', label: 'Briefing', icon: LayoutDashboard, group: 'today' },
  { href: '/tasks', label: 'To-do', icon: ListTodo, group: 'today', count: OPEN_TASKS },
  { href: '/plays', label: 'Plays', icon: Rocket, group: 'pipeline', count: MOCK_PLAYS.length },
  { href: '/prospects', label: 'Prospects', icon: Flag, group: 'pipeline', count: MOCK_PROSPECTS.filter((p) => p.status !== 'archived' && p.status !== 'qualified').length },
  { href: '/leads', label: 'Leads', icon: Inbox, group: 'pipeline', count: 12 },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare, group: 'pipeline', count: 4 },
  { href: '/traffic', label: 'Traffic', icon: TrendingUp, group: 'web' },
  { href: '/seo', label: 'SEO Health', icon: Search, group: 'web', warn: true },
  { href: '/pages', label: 'Pages', icon: FileText, group: 'web' },
  { href: '/keywords', label: 'Keywords', icon: Hash, group: 'web' },
  { href: '/social', label: 'Social & blogs', icon: CalendarDays, group: 'broadcast' },
  { href: '/wireframe', label: 'Wireframe', icon: Network, group: 'system' },
  { href: '/connections', label: 'Connections', icon: Plug, group: 'system' },
  { href: '/users', label: 'Users', icon: Users, group: 'system' },
  { href: '/settings', label: 'Settings', icon: Settings, group: 'system' },
] as const;

const GROUP_LABELS: Record<string, string> = {
  today: 'Today',
  pipeline: 'Pipeline',
  web: 'Website',
  broadcast: 'Broadcast',
  system: 'System',
};

export function AppSidebar() {
  const pathname = usePathname();
  const { theme } = useTheme();

  // Group items
  const groups = NAV.reduce<Record<string, typeof NAV[number][]>>((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  // Light-on-dark logo for dark theme, dark-on-light logo for light theme.
  const logoSrc =
    theme === 'dark' ? '/evari-logo-on-dark.svg' : '/evari-logo-on-light.svg';

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
                const active =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
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
                    {'count' in item && item.count ? (
                      <span
                        className={cn(
                          'inline-flex items-center justify-center h-5 min-w-[20px] px-1 text-[10px] tabular-nums rounded-full',
                          // To-do is the only amber count in the nav — it's the
                          // personal action list, everything else is pipeline state.
                          item.href === '/tasks'
                            ? 'bg-evari-warn text-evari-ink font-semibold'
                            : active
                              ? 'bg-evari-surfaceSoft text-evari-dim'
                              : 'bg-evari-surface/60 text-evari-dimmer',
                        )}
                      >
                        {item.count > 99 ? '99+' : item.count}
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
          <span>Mock data — no APIs wired</span>
        </div>
        <div className="mt-1 text-evari-dimmer/80 font-mono">v0.1.0</div>
      </div>
    </aside>
  );
}
