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
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Briefing', icon: LayoutDashboard, group: 'today' },
  { href: '/leads', label: 'Leads', icon: Inbox, group: 'pipeline', count: 12 },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare, group: 'pipeline', count: 4 },
  { href: '/traffic', label: 'Traffic', icon: TrendingUp, group: 'web' },
  { href: '/seo', label: 'SEO Health', icon: Search, group: 'web', warn: true },
  { href: '/pages', label: 'Pages', icon: FileText, group: 'web' },
  { href: '/keywords', label: 'Keywords', icon: Hash, group: 'web' },
  { href: '/social', label: 'Social', icon: CalendarDays, group: 'broadcast' },
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

  // Group items
  const groups = NAV.reduce<Record<string, typeof NAV[number][]>>((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-evari-edge bg-evari-carbon">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-evari-edge flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-md bg-gradient-to-br from-primary to-evari-accentSoft flex items-center justify-center shadow-sm">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-medium text-evari-text tracking-tight">Evari</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer">
            Dashboard
          </div>
        </div>
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
                        ? 'bg-evari-surface text-evari-text shadow-[inset_0_0_0_1px_hsl(0_0%_18%)]'
                        : 'text-evari-dim hover:bg-evari-surface/60 hover:text-evari-text',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        active ? 'text-primary' : 'text-evari-dimmer',
                      )}
                    />
                    <span className="flex-1">{item.label}</span>
                    {'count' in item && item.count ? (
                      <span
                        className={cn(
                          'text-[10px] tabular-nums px-1.5 py-0.5 rounded',
                          active
                            ? 'bg-primary/20 text-primary'
                            : 'bg-evari-edge text-evari-dim',
                        )}
                      >
                        {item.count}
                      </span>
                    ) : null}
                    {'warn' in item && item.warn ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-evari-edge text-[11px] text-evari-dimmer leading-tight">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>Mock data — no APIs wired</span>
        </div>
        <div className="mt-1 text-evari-dimmer/80 font-mono">v0.1.0</div>
      </div>
    </aside>
  );
}
