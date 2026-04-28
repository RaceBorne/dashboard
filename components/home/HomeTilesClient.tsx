'use client';

/**
 * Bento-grid homepage. Each tile is a 1×1 or 2×2 square that snaps
 * to a fixed grid. Today the page ships with four 1×1 tiles
 * (Prospecting, Broadcast, Marketing, Clock placeholder) and a
 * stub "Customize" button that will open a pull-up widget
 * configurator in a follow-up.
 *
 * The grid is built on aspect-square tiles inside a CSS grid. Each
 * tile uses rounded-panel + bg-evari-surface so it lines up with the
 * rest of the panel system. Click a tile to navigate to its module.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Compass,
  Megaphone,
  Plus,
  Settings,
  Sparkles,
  Target,
} from 'lucide-react';

import { cn } from '@/lib/utils';

type TileSize = '1x1' | '2x2';

interface Tile {
  id: string;
  size: TileSize;
  href?: string;
  /** Custom render for non-link tiles (e.g. clock widget). */
  render?: () => React.ReactNode;
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: 'gold' | 'teal' | 'mute';
}

const DEFAULT_TILES: Tile[] = [
  { id: 'prospecting', size: '1x1', href: '/ideas',           title: 'Prospecting', subtitle: 'Ideas → Strategy → Discovery',     icon: Target,    accent: 'gold' },
  { id: 'broadcast',   size: '1x1', href: '/email/campaigns', title: 'Broadcast',   subtitle: 'Campaigns, journeys and sends',    icon: Megaphone, accent: 'teal' },
  { id: 'marketing',   size: '1x1', href: '/email',           title: 'Marketing',   subtitle: 'Audience, conversations, statistics', icon: Compass, accent: 'gold' },
  { id: 'clock',       size: '1x1', render: () => <ClockWidget />,                  title: 'Clock', subtitle: 'Placeholder widget', icon: Sparkles, accent: 'mute' },
];

export function HomeTilesClient() {
  const [tiles, setTiles] = useState<Tile[]>(DEFAULT_TILES);
  const [configureOpen, setConfigureOpen] = useState(false);

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink">
      <div className="px-gutter py-gutter">
        <div className="flex items-center justify-end mb-panel">
          <button
            type="button"
            onClick={() => setConfigureOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-panel text-[12px] text-evari-dim border border-evari-edge/40 hover:border-evari-gold/40 hover:text-evari-text transition"
          >
            <Settings className="h-3.5 w-3.5" /> Customize
          </button>
        </div>

        {/* 6-col grid: 1x1 = 3 cols, 2x2 = 6 cols. Two 1x1s side-by-side fill a row.
            Auto-rows match the column width so tiles are square. */}
        <div className="grid grid-cols-6 auto-rows-[1fr] gap-panel" style={{ gridAutoRows: '1fr' }}>
          {tiles.map((t) => <TileCard key={t.id} tile={t} />)}
          {/* Phantom add tile to encourage discovery of the configurator. */}
          <button
            type="button"
            onClick={() => setConfigureOpen(true)}
            className="col-span-3 aspect-square rounded-panel border-2 border-dashed border-evari-edge/40 bg-transparent text-evari-dim hover:text-evari-gold hover:border-evari-gold/40 transition flex flex-col items-center justify-center gap-2"
          >
            <Plus className="h-5 w-5" />
            <span className="text-[12px] font-semibold">Add a widget</span>
          </button>
        </div>
      </div>

      {configureOpen ? <ConfigureDrawer onClose={() => setConfigureOpen(false)} /> : null}
    </div>
  );
}

function TileCard({ tile }: { tile: Tile }) {
  const colSpan = tile.size === '2x2' ? 'col-span-6' : 'col-span-3';
  const rowSpan = tile.size === '2x2' ? 'row-span-2' : 'row-span-1';
  const aspect = tile.size === '2x2' ? 'aspect-[2/1]' : 'aspect-square';
  const Icon = tile.icon;

  const inner = (
    <div className={cn(
      'h-full w-full rounded-panel border bg-evari-surface p-5 flex flex-col justify-between transition group',
      tile.accent === 'gold' ? 'border-evari-edge/30 hover:border-evari-gold/50' :
      tile.accent === 'teal' ? 'border-evari-edge/30 hover:border-[#4AA39C]/50' :
                               'border-evari-edge/30 hover:border-evari-text/40',
    )}>
      {tile.render ? (
        tile.render()
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className={cn(
              'inline-flex items-center justify-center h-9 w-9 rounded-panel',
              tile.accent === 'gold' ? 'bg-evari-gold/15 text-evari-gold' :
              tile.accent === 'teal' ? 'bg-[#4AA39C]/15 text-[#7CCFC2]' :
                                       'bg-evari-ink/40 text-evari-dim',
            )}>
              {Icon ? <Icon className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </span>
          </div>
          <div>
            <div className="text-[28px] font-bold text-evari-text leading-none mb-1.5">{tile.title}</div>
            {tile.subtitle ? <div className="text-[12px] text-evari-dim">{tile.subtitle}</div> : null}
          </div>
        </>
      )}
    </div>
  );

  if (tile.href) {
    return <Link href={tile.href} className={cn(colSpan, rowSpan, aspect)}>{inner}</Link>;
  }
  return <div className={cn(colSpan, rowSpan, aspect)}>{inner}</div>;
}

function ClockWidget() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return <div className="h-full" />;
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const seconds = now.toLocaleTimeString([], { second: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div className="h-full w-full flex flex-col justify-between">
      <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer">Local time</div>
      <div>
        <div className="text-[44px] font-bold text-evari-text leading-none tabular-nums">
          {time}
          <span className="text-evari-dim text-[24px] ml-2 font-mono">:{seconds.padStart(2, '0').slice(-2)}</span>
        </div>
        <div className="text-[12px] text-evari-dim mt-1">{date}</div>
      </div>
    </div>
  );
}

function ConfigureDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-panel bg-evari-surface border border-evari-edge/40 p-5 shadow-2xl animate-[slideUp_400ms_cubic-bezier(0.22,0.61,0.36,1)]" onClick={(e) => e.stopPropagation()}>
        <style jsx>{`
          @keyframes slideUp {
            from { transform: translateY(40px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-panel bg-evari-gold/15 text-evari-gold">
            <Sparkles className="h-4 w-4" />
          </span>
          <h2 className="text-[14px] font-semibold text-evari-text flex-1">Customize home</h2>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text p-1 rounded-panel transition">×</button>
        </div>
        <p className="text-[12px] text-evari-dim mb-4">
          Drag widgets onto the grid to make this dashboard yours. Each tile is a 1×1 square or a 2×2 block. The configurator is coming next; for now you've got the four defaults.
        </p>
        <div className="grid grid-cols-2 gap-panel">
          <PlaceholderRow label="Available widgets" body="Prospecting summary, Broadcast queue, Marketing inbox, Lead pipeline, Sales targets, Clock, Weather, Brand stats." />
          <PlaceholderRow label="Layout sizes" body="1×1 squares for headlines and shortcuts. 2×2 blocks for charts, recent activity, or AI insights." />
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-panel text-[12px] font-semibold bg-evari-text text-evari-ink hover:brightness-110 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function PlaceholderRow({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-panel border border-evari-edge/30 bg-evari-ink/30 p-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">{label}</div>
      <p className="text-[12px] text-evari-text leading-relaxed">{body}</p>
    </div>
  );
}
