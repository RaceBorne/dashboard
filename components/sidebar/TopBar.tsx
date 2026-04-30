import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ContextPicker } from '@/components/context/ContextPicker';
import { listContexts, getActiveContext } from '@/lib/context/activeContext';

interface TopBarProps {
  title: string;
  /** Optional. Kept for callers that already pass a subtitle, but the
   *  current visual treatment hides it: the sidebar already tells the
   *  operator which section they're in, so this read as redundant. */
  subtitle?: string;
  rightSlot?: React.ReactNode;
}

export async function TopBar({ title, rightSlot }: TopBarProps) {
  // Server-fetch active + list of contexts so the picker is correct
  // on first paint. Errors degrade to no-picker.
  let contexts: Awaited<ReturnType<typeof listContexts>> = [];
  let activeId: string | null = null;
  try {
    const [all, active] = await Promise.all([listContexts(), getActiveContext()]);
    contexts = all;
    activeId = active?.id ?? null;
  } catch {
    // Render without the picker rather than throwing.
  }

  return (
    <header className="sticky top-0 z-30 px-4 pt-3">
      <div className="rounded-panel bg-evari-surface border border-evari-edge/30 flex h-12 items-center gap-3 px-4">
        <h1 className="text-[14px] font-semibold tracking-tight text-evari-text truncate flex-1 min-w-0">
          {title}
        </h1>
        {contexts.length > 0 ? (
          <ContextPicker contexts={contexts} activeId={activeId} />
        ) : null}
        <div className="hidden md:flex items-center gap-2 w-64">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dimmer" />
            <Input
              placeholder="Search leads, pages, keywords…"
              className="pl-8 h-8 text-[12px]"
            />
          </div>
        </div>
        {rightSlot}
      </div>
    </header>
  );
}
