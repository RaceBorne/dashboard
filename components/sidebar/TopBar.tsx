import { format } from 'date-fns';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface TopBarProps {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}

export function TopBar({ title, subtitle, rightSlot }: TopBarProps) {
  const today = new Date();
  return (
    <header className="sticky top-0 z-30 border-b border-evari-edge bg-evari-ink/85 backdrop-blur supports-[backdrop-filter]:bg-evari-ink/65">
      <div className="flex h-14 items-center gap-4 px-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-medium tracking-tight text-evari-text truncate">
              {title}
            </h1>
            {subtitle && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                {subtitle}
              </Badge>
            )}
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 w-72">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dimmer" />
            <Input
              placeholder="Search leads, pages, keywords…"
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>
        <div className="text-xs text-evari-dim font-mono tabular-nums hidden lg:block">
          {format(today, "EEE d LLL yyyy · HH:mm")}
        </div>
        {rightSlot}
      </div>
    </header>
  );
}
