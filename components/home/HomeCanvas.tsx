'use client';

/**
 * Bare homepage canvas. Fixed 6×5 grid that always fills the viewport
 * without scroll. Tiles can be 1×1, 1×2, 2×1 or 2×2. Drag any tile to
 * move; drag the corner handle to resize. Layout persists per device.
 *
 * Bottom-left gear opens an edit drawer to add tiles, change widget
 * type, change size, or remove tiles. Top-right pill exits to the app.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Compass,
  Database,
  Inbox,
  Mail,
  Megaphone,
  Plus,
  Radar,
  Search,
  Settings,
  Sparkles,
  Star,
  Target,
  Trash2,
  Upload,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const COLS = 6;
const ROWS = 5;
const GRID_GAP = 10;
const PAGE_GUTTER = 20;

// ─── widget catalog ──────────────────────────────────────────────

type WidgetId =
  | 'empty'
  | 'clock'
  | 'prospecting'
  | 'broadcast'
  | 'marketing'
  | 'briefing'
  | 'ideas'
  | 'discover'
  | 'shortlist'
  | 'enrichment'
  | 'people'
  | 'campaigns'
  | 'audience'
  | 'statistics'
  | 'conversations';

interface WidgetDef {
  id: WidgetId;
  label: string;
  subtitle?: string;
  icon: LucideIcon;
  href?: string;
  accent: 'gold' | 'teal' | 'mute';
}

const WIDGETS: Record<WidgetId, WidgetDef> = {
  empty:         { id: 'empty',         label: 'Empty',          subtitle: 'Click the gear to fill', icon: Sparkles,   accent: 'mute' },
  clock:         { id: 'clock',         label: 'Clock',          subtitle: 'Local time',             icon: Zap,        accent: 'mute' },
  prospecting:   { id: 'prospecting',   label: 'Prospecting',    subtitle: 'Ideas → Discovery',      icon: Target,     href: '/ideas',                accent: 'gold' },
  broadcast:     { id: 'broadcast',     label: 'Broadcast',      subtitle: 'Campaigns + journeys',   icon: Megaphone,  href: '/email/campaigns',      accent: 'teal' },
  marketing:     { id: 'marketing',     label: 'Marketing',      subtitle: 'Audience + statistics',  icon: Compass,    href: '/email',                accent: 'gold' },
  briefing:      { id: 'briefing',      label: 'Briefing',       subtitle: 'Daily snapshot',         icon: Sparkles,   href: '/briefing',             accent: 'gold' },
  ideas:         { id: 'ideas',         label: 'Ideas',          subtitle: 'Targeting concepts',     icon: Sparkles,   href: '/ideas',                accent: 'gold' },
  discover:      { id: 'discover',      label: 'Discover',       subtitle: 'Find companies',         icon: Search,     href: '/discover',             accent: 'teal' },
  shortlist:     { id: 'shortlist',     label: 'Shortlist',      subtitle: 'Curate your buy list',   icon: Star,       href: '/shortlist',            accent: 'gold' },
  enrichment:    { id: 'enrichment',    label: 'Enrichment',     subtitle: 'Contacts + signals',     icon: Database,   href: '/enrichment',           accent: 'teal' },
  people:        { id: 'people',        label: 'People',         subtitle: 'Person-centric inbox',   icon: Users,      href: '/people',               accent: 'mute' },
  campaigns:     { id: 'campaigns',     label: 'Campaigns',      subtitle: 'Sends + reports',        icon: Megaphone,  href: '/email/campaigns',      accent: 'teal' },
  audience:      { id: 'audience',      label: 'Audience',       subtitle: 'Lists + segments',       icon: Users,      href: '/email/audience',       accent: 'gold' },
  statistics:    { id: 'statistics',    label: 'Statistics',     subtitle: 'Aggregate analytics',    icon: Radar,      href: '/email/statistics',     accent: 'teal' },
  conversations: { id: 'conversations', label: 'Conversations',  subtitle: 'Replies inbox',          icon: Inbox,      href: '/email/conversations',  accent: 'mute' },
};

const WIDGET_ORDER: WidgetId[] = [
  'empty', 'clock',
  'prospecting', 'broadcast', 'marketing',
  'briefing', 'ideas', 'discover', 'shortlist', 'enrichment',
  'people', 'campaigns', 'audience', 'statistics', 'conversations',
];

// ─── data model ──────────────────────────────────────────────────

type Size = `${number}x${number}`;

interface Tile {
  id: string;
  col: number;
  row: number;
  w: number;  // 1 or 2
  h: number;  // 1 or 2
  widget: WidgetId;
}

const DEFAULTS: Tile[] = [
  { id: 'tile-1', col: 0, row: 0, w: 1, h: 1, widget: 'prospecting' },
  { id: 'tile-2', col: 1, row: 0, w: 1, h: 1, widget: 'broadcast' },
];

const STORAGE_KEY = 'evari.home.tiles.v3';
const PREFS_KEY = 'evari.home.prefs.v1';

interface HomePrefs {
  showGrid: boolean;
  glass: boolean;
  bgImage: string | null; // data URL
}
const DEFAULT_PREFS: HomePrefs = { showGrid: true, glass: false, bgImage: null };

function sizeOf(t: { w: number; h: number }): Size {
  return `${t.w}x${t.h}` as Size;
}
function applySize(t: Tile, size: Size): Tile {
  const [w, h] = size.split('x').map(Number);
  return { ...t, w, h };
}

// ─── canvas ──────────────────────────────────────────────────────

export function HomeCanvas() {
  const [tiles, setTiles] = useState<Tile[]>(DEFAULTS);
  const [prefs, setPrefs] = useState<HomePrefs>(DEFAULT_PREFS);
  const [hydrated, setHydrated] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Tile[];
        if (Array.isArray(parsed) && parsed.length > 0) setTiles(parsed);
      }
    } catch {}
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<HomePrefs>;
        setPrefs((cur) => ({ ...cur, ...parsed }));
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tiles)); } catch {}
  }, [tiles, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
  }, [prefs, hydrated]);

  const moveTile = useCallback((id: string, toCol: number, toRow: number) => {
    setTiles((cur) => {
      const tile = cur.find((t) => t.id === id);
      if (!tile) return cur;
      const target = clamp(toCol, toRow, tile.w, tile.h);
      const free = nearestFree(cur, id, target.col, target.row, tile.w, tile.h);
      return cur.map((t) => t.id === id ? { ...t, col: free.col, row: free.row } : t);
    });
  }, []);

  const resizeTile = useCallback((id: string, w: number, h: number) => {
    setTiles((cur) => {
      const tile = cur.find((t) => t.id === id);
      if (!tile) return cur;
      const cw = Math.max(1, Math.min(COLS, w));
      const ch = Math.max(1, Math.min(ROWS, h));
      // Try original col/row first; if it overflows or collides, find nearest free.
      const clamped = clamp(tile.col, tile.row, cw, ch);
      const colliders = cur.some((t) => t.id !== id && clamped.col < t.col + t.w && clamped.col + cw > t.col && clamped.row < t.row + t.h && clamped.row + ch > t.row);
      if (!colliders) return cur.map((t) => t.id === id ? { ...t, w: cw, h: ch, col: clamped.col, row: clamped.row } : t);
      const free = nearestFree(cur, id, clamped.col, clamped.row, cw, ch);
      return cur.map((t) => t.id === id ? { ...t, w: cw, h: ch, col: free.col, row: free.row } : t);
    });
  }, []);

  const setWidget = useCallback((id: string, widget: WidgetId) => {
    setTiles((cur) => cur.map((t) => t.id === id ? { ...t, widget } : t));
  }, []);

  const deleteTile = useCallback((id: string) => {
    setTiles((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const addTile = useCallback((widget: WidgetId, size: Size) => {
    const [w, h] = size.split('x').map(Number);
    setTiles((cur) => {
      const spot = firstFree(cur, w, h);
      if (!spot) return cur; // grid is full at that size
      const id = `tile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      return [...cur, { id, col: spot.col, row: spot.row, w, h, widget }];
    });
  }, []);

  return (
    <div
      className="fixed inset-0 bg-evari-ink overflow-hidden text-evari-text"
      style={prefs.bgImage ? { backgroundImage: `url(${prefs.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); /* swallow stray drops so the browser doesn't navigate to the image */ }}
    >
      {/* Top-right exit pill */}
      <Link
        href="/briefing"
        className="absolute top-3 right-3 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-panel border border-evari-edge/40 bg-evari-surface/80 backdrop-blur text-evari-dim hover:text-evari-gold hover:border-evari-gold/40 transition text-[11px] font-semibold"
      >
        <Sparkles className="h-3.5 w-3.5" /> Open app <ArrowRight className="h-3.5 w-3.5" />
      </Link>

      {/* Bottom-left edit gear */}
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        className="absolute bottom-3 left-3 z-30 inline-flex items-center justify-center h-9 w-9 rounded-full border border-evari-edge/40 bg-evari-surface/80 backdrop-blur text-evari-dim hover:text-evari-gold hover:border-evari-gold/40 transition shadow-md"
        title="Edit home"
      >
        <Settings className="h-4 w-4" />
      </button>

      <GridSurface
        tiles={tiles}
        prefs={prefs}
        onMove={moveTile}
        onResize={resizeTile}
      />

      {editorOpen ? (
        <EditDrawer
          tiles={tiles}
          prefs={prefs}
          onPrefs={(patch) => setPrefs((cur) => ({ ...cur, ...patch }))}
          onClose={() => setEditorOpen(false)}
          onSetWidget={setWidget}
          onSetSize={(id, size) => { const [w, h] = size.split('x').map(Number); resizeTile(id, w, h); }}
          onDelete={deleteTile}
          onAdd={addTile}
        />
      ) : null}
    </div>
  );
}

// ─── grid surface ────────────────────────────────────────────────

function GridSurface({ tiles, prefs, onMove, onResize }: {
  tiles: Tile[];
  prefs: HomePrefs;
  onMove: (id: string, col: number, row: number) => void;
  onResize: (id: string, w: number, h: number) => void;
}) {
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
    const onResizeWin = () => recompute();
    window.addEventListener('resize', onResizeWin);
    return () => window.removeEventListener('resize', onResizeWin);
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
        ...(prefs.showGrid ? {
          backgroundImage:
            `linear-gradient(to right, rgb(var(--evari-edge) / 0.20) 1px, transparent 1px),`
            + ` linear-gradient(to bottom, rgb(var(--evari-edge) / 0.20) 1px, transparent 1px)`,
          backgroundSize: `calc((100% + ${GRID_GAP}px) / ${COLS}) calc((100% + ${GRID_GAP}px) / ${ROWS})`,
          backgroundPosition: '0 0',
        } : {}),
      }}
    >
      {tiles.map((t) => (
        <DraggableTile
          key={t.id}
          tile={t}
          cellW={cellW}
          cellH={cellH}
          glass={prefs.glass}
          onDrop={(col, row) => onMove(t.id, col, row)}
          onResizeDrop={(w, h) => onResize(t.id, w, h)}
        />
      ))}
    </div>
  );
}

// ─── tile ────────────────────────────────────────────────────────

function DraggableTile({ tile, cellW, cellH, glass, onDrop, onResizeDrop }: {
  tile: Tile;
  cellW: number;
  cellH: number;
  glass: boolean;
  onDrop: (col: number, row: number) => void;
  onResizeDrop: (w: number, h: number) => void;
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [resize, setResize] = useState<{ dx: number; dy: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  // ── drag (move) ──
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

  // ── resize ──
  const resizeStartRef = useRef<{ x: number; y: number } | null>(null);
  const onResizePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    resizeStartRef.current = { x: e.clientX, y: e.clientY };
    setResize({ dx: 0, dy: 0 });
  };
  const onResizePointerMove = (e: React.PointerEvent) => {
    if (!resizeStartRef.current) return;
    setResize({ dx: e.clientX - resizeStartRef.current.x, dy: e.clientY - resizeStartRef.current.y });
  };
  const onResizePointerUp = () => {
    if (!resizeStartRef.current || !resize) { resizeStartRef.current = null; setResize(null); return; }
    const wDelta = Math.round(resize.dx / (cellW + GRID_GAP));
    const hDelta = Math.round(resize.dy / (cellH + GRID_GAP));
    const newW = Math.max(1, Math.min(COLS, tile.w + wDelta));
    const newH = Math.max(1, Math.min(ROWS, tile.h + hDelta));
    onResizeDrop(newW, newH);
    resizeStartRef.current = null;
    setResize(null);
  };

  const dragging = drag !== null;
  const resizing = resize !== null;
  const widget = WIDGETS[tile.widget] ?? WIDGETS.empty;
  const Icon = widget.icon;

  // Live preview width/height while resizing.
  const previewW = resizing ? Math.max(1, Math.min(COLS, tile.w + Math.round((resize?.dx ?? 0) / (cellW + GRID_GAP)))) : tile.w;
  const previewH = resizing ? Math.max(1, Math.min(ROWS, tile.h + Math.round((resize?.dy ?? 0) / (cellH + GRID_GAP)))) : tile.h;

  return (
    <div
      style={{
        gridColumn: `${tile.col + 1} / span ${previewW}`,
        gridRow:    `${tile.row + 1} / span ${previewH}`,
        transform: dragging ? `translate(${drag!.dx}px, ${drag!.dy}px)` : undefined,
        transition: dragging || resizing ? 'none' : 'transform 200ms cubic-bezier(0.22,0.61,0.36,1)',
        zIndex: dragging || resizing ? 20 : 1,
        touchAction: 'none',
      }}
      className="relative"
    >
      {/* Tile body — the move-drag handle. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { setDrag(null); startRef.current = null; }}
        className={cn(
          'h-full w-full rounded-panel border p-5 select-none cursor-grab active:cursor-grabbing transition-shadow',
          glass ? 'bg-evari-surface/40 backdrop-blur-md backdrop-saturate-150' : 'bg-evari-surface',
          widget.accent === 'gold' ? 'border-evari-edge/40 hover:border-evari-gold/50' :
          widget.accent === 'teal' ? 'border-evari-edge/40 hover:border-[#4AA39C]/50' :
                                     'border-evari-edge/40 hover:border-evari-text/40',
          dragging || resizing ? 'shadow-2xl' : 'shadow-md',
        )}
      >
        <div className="h-full w-full flex flex-col justify-between pointer-events-none">
          <span className={cn(
            'inline-flex items-center justify-center h-9 w-9 rounded-panel',
            widget.accent === 'gold' ? 'bg-evari-gold/15 text-evari-gold' :
            widget.accent === 'teal' ? 'bg-[#4AA39C]/15 text-[#7CCFC2]' :
                                       'bg-evari-ink/40 text-evari-dim',
          )}>
            <Icon className="h-5 w-5" />
          </span>
          <div>
            {widget.id === 'clock' ? <ClockBody /> : (
              <>
                {widget.href ? (
                  <Link href={widget.href} className="text-[20px] font-bold text-evari-text leading-tight hover:text-evari-gold transition pointer-events-auto">{widget.label}</Link>
                ) : (
                  <div className="text-[20px] font-bold text-evari-text leading-tight">{widget.label}</div>
                )}
                {widget.subtitle ? <div className="text-[11px] text-evari-dim mt-0.5">{widget.subtitle}</div> : null}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Resize handle at bottom-right corner. */}
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={() => { setResize(null); resizeStartRef.current = null; }}
        className="absolute bottom-1 right-1 h-5 w-5 rounded-sm cursor-se-resize bg-transparent hover:bg-evari-gold/20 flex items-end justify-end p-0.5 transition"
        title="Drag to resize"
        style={{ touchAction: 'none' }}
      >
        <svg viewBox="0 0 10 10" className="h-3 w-3 text-evari-dim">
          <line x1="2" y1="9" x2="9" y2="2" stroke="currentColor" strokeWidth="1" />
          <line x1="5" y1="9" x2="9" y2="5" stroke="currentColor" strokeWidth="1" />
          <line x1="8" y1="9" x2="9" y2="8" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}

function ClockBody() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return <div className="text-[20px] font-bold text-evari-text">--:--</div>;
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div>
      <div className="text-[28px] font-bold text-evari-text leading-none tabular-nums">{time}</div>
      <div className="text-[11px] text-evari-dim mt-1">{date}</div>
    </div>
  );
}

// ─── edit drawer ─────────────────────────────────────────────────

function EditDrawer({ tiles, prefs, onPrefs, onClose, onSetWidget, onSetSize, onDelete, onAdd }: {
  tiles: Tile[];
  prefs: HomePrefs;
  onPrefs: (patch: Partial<HomePrefs>) => void;
  onClose: () => void;
  onSetWidget: (id: string, w: WidgetId) => void;
  onSetSize: (id: string, size: Size) => void;
  onDelete: (id: string) => void;
  onAdd: (widget: WidgetId, size: Size) => void;
}) {
  const [addWidget, setAddWidget] = useState<WidgetId>('empty');
  const [addSize, setAddSize] = useState<Size>('1x1');

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-start" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <aside
        className="relative m-3 w-[420px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] rounded-panel bg-evari-surface border border-evari-edge/40 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (!file || !file.type.startsWith('image/')) return;
          const reader = new FileReader();
          reader.onload = () => { if (typeof reader.result === 'string') onPrefs({ bgImage: reader.result }); };
          reader.readAsDataURL(file);
        }}
      >
        <header className="px-4 py-3 border-b border-evari-edge/30 flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-panel bg-evari-gold/15 text-evari-gold">
            <Settings className="h-4 w-4" />
          </span>
          <h2 className="text-[14px] font-semibold text-evari-text flex-1">Edit home</h2>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text p-1 rounded transition" title="Close"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          {/* Display options */}
          <DisplaySection prefs={prefs} onPrefs={onPrefs} />

          {/* Add a tile */}
          <section className="rounded-panel border border-evari-edge/40 bg-evari-ink/30 p-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2">Add a tile</div>
            <div className="flex flex-col gap-2">
              <select value={addWidget} onChange={(e) => setAddWidget(e.target.value as WidgetId)} className="w-full px-2 py-1.5 rounded-panel bg-evari-ink text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none">
                {WIDGET_ORDER.map((id) => <option key={id} value={id}>{WIDGETS[id].label}</option>)}
              </select>
              <SizePicker value={addSize} onChange={setAddSize} />
              <button type="button" onClick={() => onAdd(addWidget, addSize)} className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-panel text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition">
                <Plus className="h-3.5 w-3.5" /> Add tile
              </button>
            </div>
          </section>

          {/* Tile list */}
          <section>
            <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2 px-1">Tiles ({tiles.length})</div>
            <ul className="space-y-2">
              {tiles.length === 0 ? <li className="text-[11px] text-evari-dim px-1">No tiles yet. Add one above.</li> : null}
              {tiles.map((t) => {
                const w = WIDGETS[t.widget];
                const Icon = w.icon;
                return (
                  <li key={t.id} className="rounded-panel border border-evari-edge/30 bg-evari-ink/30 p-2.5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn('inline-flex items-center justify-center h-7 w-7 rounded-panel',
                        w.accent === 'gold' ? 'bg-evari-gold/15 text-evari-gold' :
                        w.accent === 'teal' ? 'bg-[#4AA39C]/15 text-[#7CCFC2]' :
                                              'bg-evari-ink/40 text-evari-dim')}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <select value={t.widget} onChange={(e) => onSetWidget(t.id, e.target.value as WidgetId)} className="flex-1 px-2 py-1 rounded-panel bg-evari-ink text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none">
                        {WIDGET_ORDER.map((id) => <option key={id} value={id}>{WIDGETS[id].label}</option>)}
                      </select>
                      <button type="button" onClick={() => onDelete(t.id)} className="text-evari-dim hover:text-evari-danger p-1 rounded transition" title="Delete tile"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <SizePicker value={sizeOf(t)} onChange={(s) => onSetSize(t.id, s)} compact />
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </aside>
    </div>
  );
}

function DisplaySection({ prefs, onPrefs }: { prefs: HomePrefs; onPrefs: (patch: Partial<HomePrefs>) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [drop, setDrop] = useState(false);

  function handleFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onPrefs({ bgImage: reader.result });
    };
    reader.readAsDataURL(file);
  }

  return (
    <section className="rounded-panel border border-evari-edge/40 bg-evari-ink/30 p-3 space-y-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Display</div>

      <ToggleRow label="Show grid lines" sub="Faint guides behind the tiles." value={prefs.showGrid} onChange={(v) => onPrefs({ showGrid: v })} />
      <ToggleRow label="Glass effect" sub="Translucent tiles with backdrop blur." value={prefs.glass} onChange={(v) => onPrefs({ glass: v })} />

      {/* Background image */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1.5">Background image</div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrop(true); }}
          onDragLeave={() => setDrop(false)}
          onDrop={(e) => { e.preventDefault(); setDrop(false); handleFile(e.dataTransfer.files?.[0] ?? null); }}
          className={cn('rounded-panel border-2 border-dashed p-3 text-center transition cursor-pointer',
            drop ? 'border-evari-gold bg-evari-gold/10' : 'border-evari-edge/50 bg-evari-ink/40 hover:border-evari-gold/40')}
          onClick={() => inputRef.current?.click()}
        >
          {prefs.bgImage ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={prefs.bgImage} alt="" className="h-12 w-20 object-cover rounded-panel border border-evari-edge/40" />
              <div className="flex-1 text-left">
                <div className="text-[12px] text-evari-text font-semibold">Background set</div>
                <div className="text-[10px] text-evari-dim">Drop a new image to replace, or remove.</div>
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); onPrefs({ bgImage: null }); }} className="text-evari-dim hover:text-evari-danger p-1 rounded transition" title="Remove background"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Upload className="h-5 w-5 text-evari-dim" />
              <div className="text-[12px] text-evari-text font-semibold">Drop an image here</div>
              <div className="text-[10px] text-evari-dim">or click to choose a file</div>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
    </section>
  );
}

function ToggleRow({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className="w-full flex items-center gap-3 text-left">
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-evari-text font-semibold">{label}</div>
        {sub ? <div className="text-[10px] text-evari-dim">{sub}</div> : null}
      </div>
      <span className={cn('inline-flex h-5 w-9 rounded-full border transition shrink-0',
        value ? 'bg-evari-gold border-evari-gold justify-end' : 'bg-evari-ink border-evari-edge/40 justify-start')}>
        <span className={cn('h-4 w-4 rounded-full m-0.5 transition',
          value ? 'bg-evari-goldInk' : 'bg-evari-dim')} />
      </span>
    </button>
  );
}

function SizePicker({ value, onChange }: { value: Size; onChange: (s: Size) => void; compact?: boolean }) {
  // Interactive 6×5 mini-grid: click a cell at (c, r) to set size to (c+1)×(r+1).
  // Hover to preview the size that would be applied.
  const [hover, setHover] = useState<{ c: number; r: number } | null>(null);
  const [vw, vh] = value.split('x').map(Number) as [number, number];
  const aw = hover ? hover.c + 1 : vw;
  const ah = hover ? hover.r + 1 : vh;
  return (
    <div className="flex items-center gap-2">
      <div className="inline-grid" style={{ gridTemplateColumns: `repeat(${COLS}, 14px)`, gridTemplateRows: `repeat(${ROWS}, 14px)`, gap: 2 }} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: ROWS }).map((_, r) =>
          Array.from({ length: COLS }).map((_, c) => {
            const inside = c < aw && r < ah;
            return (
              <button
                key={`${c}-${r}`}
                type="button"
                onMouseEnter={() => setHover({ c, r })}
                onClick={() => onChange(`${c + 1}x${r + 1}` as Size)}
                className={cn('rounded-[3px] border transition',
                  inside ? 'bg-evari-gold border-evari-gold' : 'bg-evari-ink border-evari-edge/40 hover:border-evari-gold/40')}
              />
            );
          })
        )}
      </div>
      <span className="font-mono tabular-nums text-[11px] text-evari-dim">{aw} × {ah}</span>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────

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

function firstFree(tiles: Tile[], w: number, h: number): { col: number; row: number } | null {
  for (let r = 0; r <= ROWS - h; r++) {
    for (let c = 0; c <= COLS - w; c++) {
      const occupied = tiles.some((t) => c < t.col + t.w && c + w > t.col && r < t.row + t.h && r + h > t.row);
      if (!occupied) return { col: c, row: r };
    }
  }
  return null;
}
