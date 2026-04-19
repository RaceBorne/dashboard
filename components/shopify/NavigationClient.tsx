'use client';

import * as React from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ShopifyMenu, ShopifyMenuItem } from '@/lib/integrations/shopify';
import { cn } from '@/lib/utils';

/**
 * Read-only navigation viewer.
 *
 * Shopify exposes the online-store menus as nested ID/title/url/type
 * trees. We render them as expandable lists; a full drag-to-reorder
 * editor is a future milestone (it needs the menuUpdate mutation +
 * optimistic UI which is non-trivial).
 */
export function NavigationClient({
  menus,
  mock,
}: {
  menus: ShopifyMenu[];
  mock: boolean;
}) {
  const [active, setActive] = React.useState<string>(menus[0]?.id ?? '');

  const current = menus.find((m) => m.id === active) ?? menus[0];

  return (
    <>
      {mock && (
        <div className="rounded-md bg-evari-warn/15 ring-1 ring-evari-warn/30 px-4 py-2.5 text-xs text-evari-text mb-4">
          Showing mock data — Shopify is not connected.
        </div>
      )}

      {menus.length === 0 ? (
        <div className="rounded-md bg-evari-surface p-6 text-sm text-evari-dim italic text-center">
          No menus configured in Shopify yet.
        </div>
      ) : (
        <div className="grid grid-cols-[200px_1fr] gap-6">
          <aside className="space-y-1">
            {menus.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setActive(m.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                  m.id === current?.id
                    ? 'bg-evari-surface text-evari-text'
                    : 'text-evari-dim hover:bg-evari-surface/50 hover:text-evari-text',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{m.title}</span>
                  <span className="text-[10px] text-evari-dimmer font-mono">
                    {countItems(m.items)}
                  </span>
                </div>
                <div className="text-[10px] text-evari-dimmer font-mono truncate">
                  {m.handle}
                </div>
              </button>
            ))}
          </aside>

          <div className="rounded-xl bg-evari-surface p-5">
            {current ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-medium text-evari-text">{current.title}</h2>
                    <div className="text-[10px] text-evari-dimmer font-mono uppercase tracking-[0.08em] mt-0.5">
                      handle: {current.handle}
                    </div>
                  </div>
                  <a
                    href={`https://admin.shopify.com/menus/${current.handle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-evari-gold hover:text-evari-gold/80 inline-flex items-center gap-1"
                  >
                    Edit in Shopify <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <MenuTree items={current.items} depth={0} />
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

function MenuTree({ items, depth }: { items: ShopifyMenuItem[]; depth: number }) {
  if (items.length === 0) {
    return <div className="text-xs text-evari-dim italic">No items.</div>;
  }
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.id}>
          <div
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-evari-surfaceSoft/40"
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            {depth > 0 && <ChevronRight className="h-3 w-3 text-evari-dimmer shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="text-sm text-evari-text truncate">{item.title}</div>
              <div className="text-[10px] text-evari-dimmer font-mono truncate">{item.url}</div>
            </div>
            <Badge variant="muted" className="text-[10px] uppercase">
              {item.type.toLowerCase()}
            </Badge>
          </div>
          {item.items.length > 0 && (
            <div className="mt-1">
              <MenuTree items={item.items} depth={depth + 1} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function countItems(items: ShopifyMenuItem[]): number {
  return items.reduce((acc, i) => acc + 1 + countItems(i.items), 0);
}
