import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { TopBar } from '@/components/sidebar/TopBar';

/**
 * Generic landing card for a top-level Shopify sub-section
 * (Growth / Content / Ops). Lists each child route so the user has a
 * single place to jump from when they land on the parent without
 * picking a tab in the sub-nav.
 */
export interface SectionTile {
  href: string;
  title: string;
  description: string;
}

export function SectionOverview({
  title,
  subtitle,
  tiles,
}: {
  title: string;
  subtitle?: string;
  tiles: SectionTile[];
}) {
  return (
    <>
      <TopBar title={title} subtitle={subtitle} />
      <div className="p-6 max-w-[1100px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="group rounded-xl bg-evari-surface p-5 ring-1 ring-evari-edge/40 hover:ring-evari-gold/40 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-medium text-evari-text">{tile.title}</h3>
                <ArrowRight className="h-4 w-4 text-evari-dimmer group-hover:text-evari-gold transition-colors" />
              </div>
              <p className="text-xs text-evari-dim leading-relaxed">
                {tile.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
