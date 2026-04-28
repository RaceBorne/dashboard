'use client';

/**
 * Bare homepage canvas. Fixed 6×5 grid that always fills the viewport
 * without scroll, regardless of aspect ratio. Cells flex with 1fr so
 * there is no rounding cut-off. Tiles snap to grid cells on drag end.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, Target } from 'lucide-react';

import { cn } from '@/lib/utils';

const COLS = 6;
const ROWS = 5;
const GRID_GAP = 10;     // matches design token spacing.panel
const PAGE_GUTTER = 20;  // matches design token spacing.gutter

interface Tile {
  id: string;
  col: number;  // 0..(COLS - w)
  row: number;  // 0..(ROWS - h)
  w: number;
  h: number;
  title: string;
  subtitle?: string;
  accent: 'gold' | 'teal';
}

const DEFAULTS: Tile[] = [
  { id: 'tile-1', col: 1, row: 1, w: 1, h: 1, title: 'Square one', subtitle: 'Drag me anywhere on the grid.', accent: 'gold' },
  { id: 'tile-2', col: 3, row: 1, w: 1, h: 1, title: 'Square two', subtitle: 'I snap into place.',          accent: 'teal' },
];

const STORAGE_KEY = 'evari.home.tiles.v1';

export function HomeCanvas() {
  const [tiles, setTiles] = useState<Tile[]>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

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

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tiles)); } catch {}
  }, [tiles, hydrated]);

  const moveTile = useCallback((id: string, toCol: number, toRow: number) => {
    setTiles((cur) => {
      const tile = cur.find((t) => t.id === id);
      if (!tile) return cur;
      const target = clamp(toCol, toRow, tile.w, tile.h);
      const free = nearestFree(cur, id, target.col, target.row, tile.w, tile.h);
      return cur.map((t) => t.id === id ? { ...t, col: free.col, row: free.row } : t);
    });
  }, []);

  return (
    <div className="fixed inset-0 bg-evari-ink overflow-hidden text-evari-text">
      <Link
        href="/briefing"
        className="absolute top-3 right-3 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-panel border border-evari-edge/40 bg-evari-surface/80 backdrop-blur text-evari-dim hover:text-evari-gold hover:border-evari-gold/40 transition text-[11px] font-semibold"
      >
        <Sparkles className="h-3.5 w-3.5" /> Open app <ArrowRight className="h-3.5 w-3.5" />
      </Link>

      <GridSurface tiles={tiles} onMove={moveTile} />
    </div>
  );
}

/**
 * The grid surface is a CSS grid pinned 20px from each viewport edge,
 * with 6 equal-fraction columns and 5 equal-fraction rows. Tiles sit
 * at their grid coordinates when idle. While dragging, a tile is
 * temporarily lifted out of grid flow with absolute positioning so it
 * follows the cursor; on drop it snaps back into a new grid cell.
 */
function GridSurface({ tiles, onMove }: { tiles: Tile[]; onMove: (id: string, col: number, row: number) => void }) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [cellW, setCellW] = useState(120);
  const [cellH, setCellH] = useState(120);

  const recompute = useCallback(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCellW((rect.width  - GRID_GAP * (COLS - 1)) / COLS);
    setCellH((rect.height - GRID_GAP * (ROWS - 1)) / ROWS);
  }, []);

  useLayoutEffect(() => { recompute(); }, [recompute]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => recompute();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recompute]);

  return (
    <div
      ref={surfaceRef}
      className="absolute"
      style={{
        top: PAGE_GUTTER, right: PAGE_GUTTER, bottom: PAGE_GUTTER, left: PAGE_GUTTER,
        display: 'grid',
        gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
        gridTemplateRows:    `repeat(${ROWS}, minmax(0, 1fr))`,
        gap: `${GRID_GAP}px`,
        backgroundImage:
          `linear-gradient(to right, rgb(var(--evari-edge) / 0.20) 1px, transparent 1px),`
          + ` linear-gradient(to bottom, rgb(var(--evari-edge) / 0.20) 1px, transparent 1px)`,
        backgroundSize: `calc((100% + ${GRID_GAP}px) / ${COLS}) calc((100% + ${GRID_GAP}px) / ${ROWS})`,
        backgroundPosition: '0 0',
      }}
    >
      {tiles.map((t) => (
        <DraggableTile key={t.id} tile={t} cellW={cellW} cellH={cellH} onDrop={(col, row) => onMove(t.id, col, row)} />
      ))}
    </div>
  );
}

function DraggableTile({ tile, cellW, cellH, onDrop }: { tile: Tile; cellW: number; cellH: number; onDrop: (col: number, row: number) => void }) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    setDrag({ dx: e.clientX - startRef.current.x, dy: e.clientY - startRef.current.y });
  };
  const onPointerUp = () => {
    if (!startRef.current || !drag) { startRef.current = null; setDrag(null); return; }
    const colDelta = Math.round(drag.dx / (cellW + GRID_GAP));
    const rowDelta = Math.round(drag.dy / (cellH + GRID_GAP));
    onDrop(tile.col + colDelta, tile.row + rowDelta);
    startRef.current = null;
    setDrag(null);
  };

  // Idle: occupy grid cell. Dragging: lift to absolute with translate.
  const dragging = drag !== null;
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { setDrag(null); startRef.current = null; }}
      style={{
        gridColumn: `${tile.col + 1} / span ${tile.w}`,
        gridRow: `${tile.row + 1} / span ${tile.h}`,
        transform: dragging ? `translate(${drag!.dx}px, ${drag!.dy}px)` : undefined,
        transition: dragging ? 'none' : 'transform 200ms cubic-bezier(0.22,0.61,0.36,1)',
        zIndex: dragging ? 20 : 1,
        touchAction: 'none',
      }}
      className={cn(
        'rounded-panel border bg-evari-surface p-5 select-none cursor-grab active:cursor-grabbing',
        tile.accent === 'gold' ? 'border-evari-edge/40 hover:border-evari-gold/50' : 'border-evari-edge/40 hover:border-[#4AA39C]/50',
        dragging ? 'shadow-2xl' : 'shadow-md',
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

function clamp(col: number, row: number, w: number, h: number) {
  return {
    col: Math.max(0, Math.min(COLS - w, col)),
    row: Math.max(0, Math.min(ROWS - h, row)),
  };
}

function nearestFree(tiles: Tile[], movingId: string, col: number, row: number, w: number, h: number) {
  const occupied = (c: number, r: number) =>
    tiles.some((t) => t.id !== movingId && c < t.col + t.w && c + w > t.col && r < t.row + t.h && r + h > t.row);
  if (!occupied(col, row)) return { col, row };
  for (let radius = 1; radius <= 12; radius++) {
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        if (Math.abs(dc) !== radius && Math.abs(dr) !== radius) continue;
        const target = clamp(col + dc, row + dr, w, h);
        if (!occupied(target.col, target.row)) return target;
      }
    }
  }
  return clamp(col, row, w, h);
}
