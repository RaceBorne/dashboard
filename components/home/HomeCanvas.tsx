'use client';

/**
 * Bare homepage canvas. No sidebar, no top bar, no AI pane.
 *
 * 6-column responsive grid where each column is (viewport - 2*gutter) / 6
 * wide. Cells are square (auto-rows match column width). Tiles are
 * draggable: press, drag, release. On release the tile snaps to the
 * nearest grid cell. Multiple tiles cannot occupy the same cell —
 * the dragged tile bumps to the closest free neighbour if its target
 * is taken.
 *
 * Two starter tiles. Positions persist to localStorage so the layout
 * survives reloads even before the configurator lands.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, Target } from 'lucide-react';

import { cn } from '@/lib/utils';

interface Tile {
  id: string;
  /** Cell coordinates. col is 0..5 (six columns); row is 0..N. */
  col: number;
  row: number;
  /** Today every tile is 1×1. Reserved for future 2×2 widgets. */
  w: number;
  h: number;
  title: string;
  subtitle?: string;
  href?: string;
  accent: 'gold' | 'teal';
}

const COLS = 6;
const GRID_GAP = 10; // matches design token spacing.panel = 10px
const PAGE_GUTTER = 20; // matches spacing.gutter = 20px

const DEFAULTS: Tile[] = [
  { id: 'tile-1', col: 1, row: 1, w: 1, h: 1, title: 'Square one', subtitle: 'Drag me anywhere on the grid.', accent: 'gold' },
  { id: 'tile-2', col: 3, row: 1, w: 1, h: 1, title: 'Square two', subtitle: 'I snap into place.',          accent: 'teal' },
];

const STORAGE_KEY = 'evari.home.tiles.v1';

export function HomeCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tiles, setTiles] = useState<Tile[]>(DEFAULTS);
  const [cellSize, setCellSize] = useState<number>(120);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Tile[];
        if (Array.isArray(parsed) && parsed.length > 0) setTiles(parsed);
      }
    } catch {}
    setHydrated(true);
  }, []);

  // Persist any change.
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tiles)); } catch {}
  }, [tiles, hydrated]);

  // Compute current cell size based on the container width.
  const recomputeCellSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const inner = rect.width - PAGE_GUTTER * 2;
    const cell = (inner - GRID_GAP * (COLS - 1)) / COLS;
    setCellSize(Math.max(40, Math.floor(cell)));
  }, []);

  useLayoutEffect(() => { recomputeCellSize(); }, [recomputeCellSize]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => recomputeCellSize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recomputeCellSize]);

  const maxRows = useMemo(() => Math.max(8, ...tiles.map((t) => t.row + t.h)), [tiles]);

  function moveTile(id: string, toCol: number, toRow: number) {
    setTiles((cur) => {
      const tile = cur.find((t) => t.id === id);
      if (!tile) return cur;
      const target = clampToGrid(toCol, toRow, tile.w, tile.h);
      // If the destination collides with another tile, find the nearest free cell.
      const free = nearestFreeCell(cur, id, target.col, target.row, tile.w, tile.h);
      return cur.map((t) => t.id === id ? { ...t, col: free.col, row: free.row } : t);
    });
  }

  return (
    <div className="fixed inset-0 bg-evari-ink overflow-hidden text-evari-text">
      <div ref={containerRef} className="absolute inset-0 px-gutter py-gutter">
        {/* Top-right "Back to app" pill */}
        <div className="absolute top-3 right-3 z-20">
          <Link href="/briefing" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-panel border border-evari-edge/40 bg-evari-surface/80 backdrop-blur text-evari-dim hover:text-evari-gold hover:border-evari-gold/40 transition text-[11px] font-semibold">
            <Sparkles className="h-3.5 w-3.5" /> Open app <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <Grid cellSize={cellSize} maxRows={maxRows}>
          {tiles.map((t) => (
            <DraggableTile
              key={t.id}
              tile={t}
              cellSize={cellSize}
              onDrop={(col, row) => moveTile(t.id, col, row)}
            />
          ))}
        </Grid>
      </div>
    </div>
  );
}

function Grid({ cellSize, maxRows, children }: { cellSize: number; maxRows: number; children: React.ReactNode }) {
  const totalH = maxRows * cellSize + (maxRows - 1) * GRID_GAP;
  return (
    <div
      className="relative w-full"
      style={{
        height: `${totalH}px`,
        backgroundImage: `linear-gradient(to right, rgb(var(--evari-edge) / 0.20) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--evari-edge) / 0.20) 1px, transparent 1px)`,
        backgroundSize: `${cellSize + GRID_GAP}px ${cellSize + GRID_GAP}px`,
        backgroundPosition: '0 0',
      }}
    >
      {children}
    </div>
  );
}

function DraggableTile({ tile, cellSize, onDrop }: { tile: Tile; cellSize: number; onDrop: (col: number, row: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const startRef = useRef<{ pointerX: number; pointerY: number } | null>(null);

  // Position from grid coords.
  const baseLeft = tile.col * (cellSize + GRID_GAP);
  const baseTop  = tile.row * (cellSize + GRID_GAP);
  const width  = tile.w * cellSize + (tile.w - 1) * GRID_GAP;
  const height = tile.h * cellSize + (tile.h - 1) * GRID_GAP;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    startRef.current = { pointerX: e.clientX, pointerY: e.clientY };
    setDrag({ dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    setDrag({ dx: e.clientX - startRef.current.pointerX, dy: e.clientY - startRef.current.pointerY });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!startRef.current || !drag) { startRef.current = null; setDrag(null); return; }
    const stride = cellSize + GRID_GAP;
    const colDelta = Math.round(drag.dx / stride);
    const rowDelta = Math.round(drag.dy / stride);
    onDrop(tile.col + colDelta, tile.row + rowDelta);
    startRef.current = null;
    setDrag(null);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { setDrag(null); startRef.current = null; }}
      style={{
        position: 'absolute',
        left: `${baseLeft + (drag?.dx ?? 0)}px`,
        top:  `${baseTop  + (drag?.dy ?? 0)}px`,
        width: `${width}px`,
        height: `${height}px`,
        transition: drag ? 'none' : 'left 200ms cubic-bezier(0.22,0.61,0.36,1), top 200ms cubic-bezier(0.22,0.61,0.36,1)',
        zIndex: drag ? 10 : 1,
        touchAction: 'none',
      }}
      className={cn(
        'rounded-panel border bg-evari-surface p-5 select-none cursor-grab active:cursor-grabbing transition-shadow',
        tile.accent === 'gold' ? 'border-evari-edge/40 hover:border-evari-gold/50' : 'border-evari-edge/40 hover:border-[#4AA39C]/50',
        drag ? 'shadow-2xl' : 'shadow-md',
      )}
    >
      <div className="h-full w-full flex flex-col justify-between pointer-events-none">
        <span className={cn(
          'inline-flex items-center justify-center h-9 w-9 rounded-panel',
          tile.accent === 'gold' ? 'bg-evari-gold/15 text-evari-gold' : 'bg-[#4AA39C]/15 text-[#7CCFC2]',
        )}>
          <Target className="h-5 w-5" />
        </span>
        <div>
          <div className="text-[18px] font-bold leading-tight">{tile.title}</div>
          {tile.subtitle ? <div className="text-[11px] text-evari-dim mt-0.5">{tile.subtitle}</div> : null}
        </div>
      </div>
    </div>
  );
}

function clampToGrid(col: number, row: number, w: number, h: number) {
  return {
    col: Math.max(0, Math.min(COLS - w, col)),
    row: Math.max(0, row),
  };
}

function nearestFreeCell(tiles: Tile[], movingId: string, col: number, row: number, w: number, h: number): { col: number; row: number } {
  function occupied(c: number, r: number) {
    return tiles.some((t) => t.id !== movingId && c < t.col + t.w && c + w > t.col && r < t.row + t.h && r + h > t.row);
  }
  if (!occupied(col, row)) return { col, row };
  // Spiral outwards until we find a free spot.
  for (let radius = 1; radius <= 12; radius++) {
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        if (Math.abs(dc) !== radius && Math.abs(dr) !== radius) continue;
        const c = col + dc, r = row + dr;
        const clamped = clampToGrid(c, r, w, h);
        if (!occupied(clamped.col, clamped.row)) return clamped;
      }
    }
  }
  return clampToGrid(col, row, w, h);
}
