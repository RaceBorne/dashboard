import { TopBar } from '@/components/sidebar/TopBar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Hammer } from 'lucide-react';

/**
 * Placeholder rendered for every Shopify sub-route that hasn't been
 * built yet (Milestones 2–8 in docs/shopify-install-handoff.md). Keeps
 * the sub-nav navigable so users don't hit 404s.
 *
 * Pages pass:
 *   - title    — top-bar title (matches the sub-nav label)
 *   - milestone — "Milestone 2 · Products" etc.
 *   - intent    — single sentence describing what the section will do
 *   - planned   — bullet list lifted from the build spec
 *   - tabs      — optional tab labels for sections that will be tabbed
 */
export function ShopifySectionStub({
  title,
  subtitle,
  milestone,
  intent,
  planned,
  tabs,
}: {
  title: string;
  subtitle?: string;
  milestone: string;
  intent: string;
  planned: string[];
  tabs?: string[];
}) {
  return (
    <>
      <TopBar
        title={title}
        subtitle={subtitle}
        rightSlot={
          <Badge variant="muted" className="gap-1.5">
            <Hammer className="h-3 w-3" />
            {milestone}
          </Badge>
        }
      />

      <div className="p-6 max-w-[900px] space-y-6">
        <p className="text-sm text-evari-dim leading-relaxed">{intent}</p>

        {tabs && tabs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <span
                key={t}
                className={cn(
                  'inline-flex items-center px-3 h-8 rounded-md text-xs uppercase tracking-[0.06em]',
                  'bg-evari-surface text-evari-dim ring-1 ring-evari-edge/40',
                )}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <section className="rounded-xl bg-evari-surface p-5">
          <header className="mb-3">
            <h2 className="text-sm font-medium text-evari-text tracking-tight">
              What lands when this ships
            </h2>
          </header>
          <ul className="space-y-1.5">
            {planned.map((line) => (
              <li
                key={line}
                className="text-sm text-evari-dim leading-relaxed flex gap-2"
              >
                <span className="text-evari-dimmer mt-1.5 h-1 w-1 rounded-full bg-evari-dimmer shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-xs text-evari-dimmer leading-relaxed">
          Backend (Shopify GraphQL adapter, mutations, validators) for this
          section is already in <code className="font-mono">lib/integrations/shopify.ts</code>.
          Only the UI is pending.
        </p>
      </div>
    </>
  );
}
