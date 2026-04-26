'use client';

import { useMemo, useState } from 'react';
import {
  AtSign,
  Box,
  Calendar,
  ChevronDown,
  ChevronUp,
  Code2,
  Columns3,
  FolderOpen,
  GripVertical,
  Heading1,
  Image as ImageIcon,
  Layers,
  Layout,
  Link2,
  Loader2,
  Megaphone,
  Minus,
  MousePointerClick,
  Move,
  PenLine,
  PlaySquare,
  Quote,
  Share2,
  Sparkles,
  Square,
  SquareSplitHorizontal,
  Star,
  Table as TableIcon,
  Tag,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { cn } from '@/lib/utils';
import {
  DEFAULT_EMAIL_DESIGN,
  type EmailAlignment,
  type EmailBlock,
  type EmailDesign,
  type MarketingBrand,
} from '@/lib/marketing/types';
import { renderEmailDesign, renderEmailBlockHtml, normaliseEmailDesign } from '@/lib/marketing/email-design';

interface Props {
  initialBrand: MarketingBrand;
  value: EmailDesign | null;
  onChange: (next: EmailDesign) => void;
  /** Optional — when provided, surfaces a 'Draft with AI' button in the toolbar. */
  onAIDraft?: () => void;
  /** Constrains the canvas iframe width — 'mobile' clamps to 380px so
   *  the operator sees how blocks reflow on a phone. The tools palette
   *  is unaffected by this; only the preview narrows. */
  previewDevice?: 'desktop' | 'mobile';
}

function nid(): string { return Math.random().toString(36).slice(2, 10); }

interface BlockTile {
  type: EmailBlock['type'] | 'columns'; // columns is a placeholder
  label: string;
  Icon: typeof Type;
  group: 'blocks' | 'layout';
  badge?: 'New' | 'Soon';
  comingSoon?: boolean;
  make?: () => EmailBlock;
}

const ADD_BUTTONS: BlockTile[] = [
  // Row 1
  { group: 'blocks', type: 'text',    label: 'Text',    Icon: Type,        make: () => ({ id: nid(), type: 'text', html: 'Write your message here.', alignment: 'left', fontSizePx: 16, lineHeight: 1.55, color: '#333333', fontFamily: '', paddingBottomPx: 16 }) },
  { group: 'blocks', type: 'image',   label: 'Image',   Icon: ImageIcon,   make: () => ({ id: nid(), type: 'image', src: '', alt: '', maxWidthPx: 600, alignment: 'center', paddingBottomPx: 16 }) },
  { group: 'blocks', type: 'split',   label: 'Split',   Icon: SquareSplitHorizontal, make: () => ({ id: nid(), type: 'split', imageSrc: '', imageAlt: '', imagePosition: 'left', html: 'Side-by-side text.', fontSizePx: 16, lineHeight: 1.55, color: '#333333', paddingBottomPx: 16 }) },
  // Row 2
  { group: 'blocks', type: 'button',  label: 'Button',  Icon: MousePointerClick,  make: () => ({ id: nid(), type: 'button', label: 'Click me', url: 'https://evari.cc', alignment: 'center', backgroundColor: '#1a1a1a', textColor: '#ffffff', borderRadiusPx: 4, paddingXPx: 24, paddingYPx: 12, paddingBottomPx: 24 }) },
  { group: 'blocks', type: 'headerBar', label: 'Header bar', Icon: Heading1, make: () => ({ id: nid(), type: 'headerBar', logoUrl: '', tagline: '', linkUrl: '', backgroundColor: '#ffffff', textColor: '#666666', paddingBottomPx: 8 }) },
  { group: 'blocks', type: 'card',    label: 'Drop shadow', Icon: Layers, make: () => ({ id: nid(), type: 'card', html: 'Featured content with a soft shadow.', backgroundColor: '#ffffff', borderRadiusPx: 8, shadow: 'md', paddingPx: 20, paddingBottomPx: 16 }) },
  // Row 3
  { group: 'blocks', type: 'divider', label: 'Divider', Icon: Minus,       make: () => ({ id: nid(), type: 'divider', color: '#e5e5e5', thicknessPx: 1, marginYPx: 16 }) },
  { group: 'blocks', type: 'social',  label: 'Social links', Icon: Share2, make: () => ({ id: nid(), type: 'social', items: [{ platform: 'instagram', url: '' }, { platform: 'linkedin', url: '' }, { platform: 'twitter', url: '' }], alignment: 'center', iconColor: '#1a1a1a', paddingBottomPx: 16 }) },
  { group: 'blocks', type: 'spacer',  label: 'Spacer',  Icon: Move,        make: () => ({ id: nid(), type: 'spacer', heightPx: 24 }) },
  // Row 4
  { group: 'blocks', type: 'product', label: 'Product', Icon: Box,         make: () => ({ id: nid(), type: 'product', imageSrc: '', imageAlt: '', title: 'Product name', price: '£0.00', description: 'Short product description.', buttonLabel: 'Shop now', buttonUrl: 'https://evari.cc', backgroundColor: '#f8f8f8', paddingBottomPx: 16 }) },
  { group: 'blocks', type: 'coupon',  label: 'Coupon',  Icon: Tag, badge: 'New', make: () => ({ id: nid(), type: 'coupon', code: 'SAVE10', title: 'Use code', subtitle: '10% off your next order', expiry: '', backgroundColor: '#fffbea', textColor: '#1a1a1a', borderColor: '#d4a017', paddingBottomPx: 16 }) },
  { group: 'blocks', type: 'table',   label: 'Table',   Icon: TableIcon,   make: () => ({ id: nid(), type: 'table', headerLabel: 'Item', headerValue: 'Detail', rows: [{ label: 'Frame', value: 'Carbon T1100' }, { label: 'Drivetrain', value: 'Rohloff E-14' }], borderColor: '#e5e5e5', stripeColor: '#fafafa', paddingBottomPx: 16 }) },
  // Row 5
  { group: 'blocks', type: 'review',  label: 'Review quote', Icon: Quote,  make: () => ({ id: nid(), type: 'review', quote: 'A genuinely brilliant ride — exactly what I needed.', author: 'Jane Doe', role: 'Customer', rating: 5, backgroundColor: '#f8f8f8', paddingBottomPx: 16 }) },
  { group: 'blocks', type: 'video',   label: 'Video',   Icon: PlaySquare,  make: () => ({ id: nid(), type: 'video', thumbnailSrc: '', videoUrl: '', alt: '', maxWidthPx: 600, alignment: 'center', paddingBottomPx: 16 }) },
  { group: 'blocks', type: 'html',    label: 'HTML',    Icon: Code2,       make: () => ({ id: nid(), type: 'html', html: '<p>Custom HTML here.</p>', paddingBottomPx: 16 }) },
  // Layout group
  { group: 'layout', type: 'columns', label: 'Columns', Icon: Columns3, comingSoon: true },
  { group: 'layout', type: 'section', label: 'Section', Icon: Square, badge: 'New', make: () => ({ id: nid(), type: 'section', blocks: [], backgroundColor: '#1a1a1a', backgroundImage: '', backgroundSize: 'cover', backgroundPosition: 'center', paddingPx: 60, borderRadiusPx: 0, contentColor: '#ffffff', minHeightPx: 320, paddingBottomPx: 16 }) },
];

// Heading still gets a tile but we render it inside the Blocks group ahead of Text in the toolbar.
// We declare it separately to keep the ADD_BUTTONS list grouped by section for clarity.
const HEADING_TILE: BlockTile = { group: 'blocks', type: 'heading', label: 'Heading', Icon: Heading1, make: () => ({ id: nid(), type: 'heading', level: 1, html: 'New heading', alignment: 'left', color: '#111111', fontFamily: '', paddingBottomPx: 12 }) };

/**
 * Klaviyo-style block tile grid. Each tile is a 3-up button with the
 * block type icon centred + label below. Uses a 'New' / 'Soon' badge
 * on the top-right corner when applicable. Coming-soon tiles open a
 * tooltip on click instead of inserting a block.
 */
function BlockTileGroup({ title, tiles, onAdd }: { title: string; tiles: BlockTile[]; onAdd: (make: () => EmailBlock) => void }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-1.5">{title}</h3>
      <ul className="grid grid-cols-2 gap-1.5">
        {tiles.map((t, i) => (
          <li key={`${t.group}-${t.type}-${t.label}`}>
            <PaletteTile tile={t} draggableId={`palette:${t.group}:${i}`} onAdd={onAdd} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Single palette tile. Doubles as a click-to-append button (compatible
 * with the original behaviour) and a draggable source for the unified
 * DnD context — the parent designer routes the drop into an insertion
 * at the matching block position.
 */
function PaletteTile({ tile, draggableId, onAdd }: { tile: BlockTile; draggableId: string; onAdd: (make: () => EmailBlock) => void }) {
  const disabled = !!tile.comingSoon;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: draggableId,
    disabled,
    data: { paletteTile: tile },
  });
  const Icon = tile.Icon;
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      disabled={disabled}
      title={disabled ? 'Coming soon' : `Drag or click to add ${tile.label}`}
      onClick={() => { if (tile.make) onAdd(tile.make); }}
      className={cn(
        'relative w-full aspect-square rounded-md border bg-evari-ink/40 flex flex-col items-center justify-center gap-1 transition-colors duration-200 cursor-grab active:cursor-grabbing',
        disabled
          ? 'border-evari-edge/20 text-evari-dimmer cursor-not-allowed opacity-60'
          : 'border-evari-edge/30 text-evari-dim hover:text-evari-text hover:border-evari-gold/60 hover:bg-evari-ink/70',
        isDragging && 'opacity-30',
      )}
    >
      {tile.badge ? (
        <span className={cn('absolute top-0.5 right-0.5 text-[7px] uppercase tracking-[0.05em] font-bold px-1 py-px rounded', tile.badge === 'New' ? 'bg-blue-500/30 text-blue-200' : 'bg-evari-edge/30 text-evari-dimmer')}>{tile.badge}</span>
      ) : null}
      <Icon className="h-5 w-5" />
      <span className="text-[11px] leading-tight text-center px-1">{tile.label}</span>
    </button>
  );
}

/**
 * Block-based visual email builder. Same architecture as the Footer
 * + Signature designers — the file lives alongside them so the three
 * stay in sync stylistically. Viewer LEFT, tools RIGHT, drag-to-reorder,
 * highlight-selected-block in the preview, common per-block padding.
 */
function labelForBlock(b: EmailBlock): string {
  const tile = ADD_BUTTONS.find((t) => t.type === b.type) ?? (b.type === 'heading' ? HEADING_TILE : null);
  return tile?.label ?? b.type;
}

export function EmailDesigner({ initialBrand, value, onChange, onAIDraft, previewDevice = "desktop" }: Props) {
  const design = normaliseEmailDesign(value) ?? DEFAULT_EMAIL_DESIGN;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOverlay, setDragOverlay] = useState<string | null>(null);

  function updateDesign(patch: Partial<EmailDesign>) {
    onChange({ ...design, ...patch });
  }
  // ─── Recursive tree helpers ───────────────────────────────────
  // The design tree is now nested (sections hold child blocks). All
  // mutations walk the tree so they work whether the target is at the
  // root or inside a section.
  function mapTree(blocks: EmailBlock[], fn: (b: EmailBlock) => EmailBlock | null): EmailBlock[] {
    const out: EmailBlock[] = [];
    for (const b of blocks) {
      const next = fn(b);
      if (!next) continue;
      if (next.type === 'section') {
        out.push({ ...next, blocks: mapTree(next.blocks ?? [], fn) });
      } else {
        out.push(next);
      }
    }
    return out;
  }
  function findContainerOf(blocks: EmailBlock[], id: string, parentId: string | null = null): { parentId: string | null; index: number } | null {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.id === id) return { parentId, index: i };
      if (b.type === 'section') {
        const inner = findContainerOf(b.blocks ?? [], id, b.id);
        if (inner) return inner;
      }
    }
    return null;
  }
  function updateChildren(blocks: EmailBlock[], parentId: string | null, fn: (kids: EmailBlock[]) => EmailBlock[]): EmailBlock[] {
    if (parentId === null) return fn(blocks);
    return blocks.map((b) => {
      if (b.type === 'section' && b.id === parentId) {
        return { ...b, blocks: fn(b.blocks ?? []) };
      }
      if (b.type === 'section') {
        return { ...b, blocks: updateChildren(b.blocks ?? [], parentId, fn) };
      }
      return b;
    });
  }
  function updateBlock(id: string, patch: Partial<EmailBlock>) {
    onChange({
      ...design,
      blocks: mapTree(design.blocks, (b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)),
    });
  }
  function removeBlock(id: string) {
    onChange({ ...design, blocks: mapTree(design.blocks, (b) => (b.id === id ? null : b)) });
  }
  function addBlock(maker: () => EmailBlock) {
    onChange({ ...design, blocks: [...design.blocks, maker()] });
  }
  function insertBlock(parentId: string | null, beforeIndex: number, newBlock: EmailBlock) {
    onChange({
      ...design,
      blocks: updateChildren(design.blocks, parentId, (kids) => {
        const next = [...kids];
        const idx = Math.max(0, Math.min(beforeIndex, next.length));
        next.splice(idx, 0, newBlock);
        return next;
      }),
    });
  }
  function moveBlocks(activeId: string, overId: string) {
    const a = findContainerOf(design.blocks, activeId);
    const o = findContainerOf(design.blocks, overId);
    if (!a || !o) return;
    if (a.parentId !== o.parentId) return; // cross-container moves not yet supported
    if (a.index === o.index) return;
    onChange({
      ...design,
      blocks: updateChildren(design.blocks, a.parentId, (kids) => arrayMove(kids, a.index, o.index)),
    });
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const blockIds = design.blocks.map((b) => b.id);

  const baseHtml = useMemo(
    () => renderEmailDesign(design, initialBrand),
    [design, initialBrand],
  );
  // Inject the selection-highlight CSS INTO the iframe's document so it
  // actually targets the rendered blocks. Doing this in the parent
  // document (as we do for the footer + signature designers) doesn't
  // work for an iframe because shadow boundaries.
  const previewHtml = useMemo(() => {
    if (!selectedId) return baseHtml;
    const style = `<style>[data-block-id="${selectedId}"]{outline:2px solid #d4a649;outline-offset:2px;border-radius:3px;background:rgba(212,166,73,0.08);}</style>`;
    return baseHtml.replace('</head>', `${style}</head>`);
  }, [baseHtml, selectedId]);

  function handleDragStart(ev: DragStartEvent) {
    const id = String(ev.active.id);
    if (id.startsWith('palette:')) {
      const tile = ev.active.data.current?.paletteTile as BlockTile | undefined;
      setDragOverlay(tile?.label ?? null);
    } else {
      const b = design.blocks.find((x) => x.id === id);
      setDragOverlay(b ? labelForBlock(b) : null);
    }
  }

  function handleDragEnd(ev: DragEndEvent) {
    setDragOverlay(null);
    const activeId = String(ev.active.id);
    const overId = ev.over ? String(ev.over.id) : null;
    if (!overId) return;

    // Palette tile → insert. Destination decoded from overId:
    //   'end-of-list'           → append to root
    //   'section-end:<id>'      → append into that section's children
    //   '<blockId>'             → splice before that block in its container
    if (activeId.startsWith('palette:')) {
      const tile = ev.active.data.current?.paletteTile as BlockTile | undefined;
      if (!tile?.make) return;
      const newBlock = tile.make();
      if (overId === 'end-of-list') {
        onChange({ ...design, blocks: [...design.blocks, newBlock] });
        return;
      }
      if (overId.startsWith('section-end:')) {
        const sectionId = overId.slice('section-end:'.length);
        onChange({
          ...design,
          blocks: updateChildren(design.blocks, sectionId, (kids) => [...kids, newBlock]),
        });
        return;
      }
      const loc = findContainerOf(design.blocks, overId);
      if (!loc) {
        onChange({ ...design, blocks: [...design.blocks, newBlock] });
        return;
      }
      insertBlock(loc.parentId, loc.index, newBlock);
      return;
    }

    // Sortable in-list reorder. Same-container only — cross-container moves
    // aren't supported yet (delete + re-add covers that case).
    if (activeId !== overId && overId !== 'end-of-list' && !overId.startsWith('section-end:')) {
      moveBlocks(activeId, overId);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
    <section className="rounded-md bg-evari-surface border border-evari-edge/30 flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b border-evari-edge/20">
        <h2 className="text-sm font-semibold text-evari-text">Visual editor</h2>
        <div className="flex items-center gap-2">
          {onAIDraft ? (
            <button type="button" onClick={onAIDraft} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-colors">
              <Sparkles className="h-3 w-3" /> Draft with AI
            </button>
          ) : null}
          <span className="text-[10px] text-evari-dimmer">Drag blocks · same renderer at preview + send</span>
        </div>
      </header>

      {/* Three-column layout: tile palette LEFT, interactive canvas
          CENTRE, properties RIGHT (when something is selected). */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(220px,260px)_minmax(0,1fr)_minmax(280px,340px)] gap-3 p-3">

        {/* LEFT — palette tiles 3-across */}
        <div className="space-y-3 min-w-0 overflow-y-auto">
          <BlockTileGroup
            title="Blocks"
            tiles={[HEADING_TILE, ...ADD_BUTTONS.filter((t) => t.group === 'blocks')]}
            onAdd={(make) => addBlock(make)}
          />
          <BlockTileGroup
            title="Layout"
            tiles={ADD_BUTTONS.filter((t) => t.group === 'layout')}
            onAdd={(make) => addBlock(make)}
          />
          <div className="rounded-md bg-evari-ink/40 border border-evari-edge/20 p-3">
            <h3 className="text-[11px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-2">Canvas settings</h3>
            <div className="space-y-2">
              <ColourField label="Background" value={design.background} onChange={(v) => updateDesign({ background: v })} />
              <NumField label="Content width (px)" value={design.widthPx} min={320} max={900} onChange={(v) => updateDesign({ widthPx: v })} />
              <NumField label="Outer padding (px)" value={design.paddingPx} min={0} max={96} onChange={(v) => updateDesign({ paddingPx: v })} />
            </div>
          </div>
        </div>

        {/* CENTRE — interactive canvas. Each block is a real React node
            so click + drag work natively (no iframe boundary). */}
        <div className="flex flex-col min-w-0">
          <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1 flex items-center justify-between">
            <span>Canvas</span>
            <span className="text-evari-dim">{previewDevice === 'mobile' ? '360px (mobile)' : `${design.widthPx}px (desktop)`}</span>
          </div>
          <div
            className="rounded-md border border-evari-edge/30 overflow-y-auto"
            style={{ background: design.background, maxHeight: '720px' }}
          >
            <div
              className={cn('mx-auto bg-white transition-[max-width] duration-300', previewDevice === 'mobile' ? '!max-w-[360px]' : '')}
              style={{ maxWidth: `${design.widthPx}px`, padding: `${design.paddingPx}px` }}
            >
              <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
                {design.blocks.length === 0 ? (
                  <EmptyCanvas />
                ) : (
                  <div className="space-y-0">
                    {design.blocks.map((b) => (
                      <CanvasBlock
                        key={b.id}
                        block={b}
                        brand={initialBrand}
                        selected={selectedId === b.id}
                        selectedId={selectedId}
                        onSelect={() => setSelectedId(b.id)}
                        onRemove={() => { setSelectedId(null); removeBlock(b.id); }}
                        onSelectChild={(id) => setSelectedId(id)}
                        onRemoveChild={(id) => { if (selectedId === id) setSelectedId(null); removeBlock(id); }}
                      />
                    ))}
                    <CanvasEndDrop />
                  </div>
                )}
              </SortableContext>
            </div>
          </div>
        </div>

        {/* RIGHT — properties panel (or placeholder when nothing selected) */}
        <div className="min-w-0">
          {selectedId ? (
            (() => {
              const sel = design.blocks.find((b) => b.id === selectedId);
              if (!sel) return null;
              return (
                <BlockPropertiesPanel
                  block={sel}
                  brand={initialBrand}
                  onChange={(patch) => updateBlock(sel.id, patch as Partial<EmailBlock>)}
                  onClose={() => setSelectedId(null)}
                />
              );
            })()
          ) : (
            <aside className="rounded-md bg-evari-surface border border-evari-edge/30 p-6 text-center text-sm text-evari-dimmer h-full flex items-center justify-center">
              Click any block in the canvas to edit it, or drag a tile from the left into the canvas.
            </aside>
          )}
        </div>
      </div>
    </section>
    {/* Drag overlay — chip floats with the cursor while dragging */}
    <DragOverlay>
      {dragOverlay ? (
        <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-evari-gold text-evari-goldInk text-[11px] font-semibold shadow-lg">
          {dragOverlay}
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  );
}

// End-of-list drop target — lets the user drop a palette tile after
// the final block. When `empty` is true we render the bigger placeholder.
function EndOfListDrop({ empty }: { empty?: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'end-of-list' });
  return (
    <li
      ref={setNodeRef}
      className={cn(
        'rounded-md border-2 border-dashed text-center text-evari-dimmer text-sm transition-colors',
        empty ? 'border-evari-edge/30 px-3 py-12' : 'border-transparent px-3 py-2 mt-1.5',
        isOver && 'border-evari-gold/60 bg-evari-gold/5 text-evari-gold',
      )}
    >
      {empty
        ? 'Drag a tile here, or click one to add.'
        : isOver ? 'Drop to add to end' : <span className="opacity-0">_</span>}
    </li>
  );
}

// ─── Sortable wrapper ──────────────────────────────────────────

function SortableBlockRow({
  block, selected, onSelect, onChange, onRemove,
}: {
  block: EmailBlock;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<EmailBlock>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };
  return (
    <li ref={setNodeRef} style={style}>
      <BlockEditor
        block={block}
        selected={selected}
        onSelect={onSelect}
        onChange={onChange}
        onRemove={onRemove}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </li>
  );
}

interface BlockEditorProps {
  block: EmailBlock;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<EmailBlock>) => void;
  onRemove: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLButtonElement>;
  isDragging: boolean;
}

function BlockEditor({ block, selected, onSelect, onChange, onRemove, dragHandleProps, isDragging }: BlockEditorProps) {
  const meta = ADD_BUTTONS.find((b) => b.type === block.type);
  const Icon = meta?.Icon ?? PenLine;
  const label = meta?.label ?? block.type;

  return (
    <div className={cn(
      'rounded-md border bg-evari-ink/30 transition-colors duration-300 ease-in-out',
      isDragging ? 'border-evari-gold/60' : selected ? 'border-evari-gold/70 bg-evari-ink/60' : 'border-evari-edge/30',
    )}>
      <header
        onClick={onSelect}
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none"
      >
        <button type="button" {...dragHandleProps} onClick={(e) => e.stopPropagation()} className="p-1.5 -ml-1 mr-0.5 text-evari-dim hover:text-evari-text hover:bg-evari-ink/60 rounded cursor-grab active:cursor-grabbing" title="Drag to reorder" aria-label="Drag to reorder">
          <GripVertical className="h-4 w-4" />
        </button>
        <Icon className="h-3.5 w-3.5 text-evari-dim shrink-0" />
        <span className="text-sm text-evari-text truncate">{label}</span>
        <span className="ml-auto text-evari-dim">
          {selected ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-evari-dim hover:text-evari-danger px-1" aria-label="Remove">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>

    </div>
  );
}

/**
 * Right-side properties panel — replaces the inline expansion on the
 * row when a block is selected. Renders to the right of the palette +
 * block list column so the thumbnails stay visible at the top.
 */
function BlockPropertiesPanel({ block, brand, onChange, onClose }: { block: EmailBlock; brand: MarketingBrand; onChange: (patch: Partial<EmailBlock>) => void; onClose: () => void }) {
  const meta = ADD_BUTTONS.find((b) => b.type === block.type) ?? (block.type === 'heading' ? HEADING_TILE : null);
  const Icon = meta?.Icon ?? PenLine;
  const label = meta?.label ?? block.type;
  return (
    <aside className="rounded-md bg-evari-surface border border-evari-edge/30 flex flex-col">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-evari-edge/20">
        <Icon className="h-3.5 w-3.5 text-evari-dim shrink-0" />
        <span className="text-sm text-evari-text font-semibold flex-1 truncate">{label}</span>
        <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text p-1 rounded" aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2">
        {block.type === 'heading'   ? <HeadingFields   block={block} brand={brand} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'heading' }>>) => void} /> : null}
        {block.type === 'text'      ? <TextFields      block={block} brand={brand} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'text' }>>) => void} /> : null}
        {block.type === 'image'     ? <ImageFields     block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'image' }>>) => void} /> : null}
        {block.type === 'button'    ? <ButtonFields    block={block} brand={brand} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'button' }>>) => void} /> : null}
        {block.type === 'divider'   ? <DividerFields   block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'divider' }>>) => void} /> : null}
        {block.type === 'spacer'    ? <SpacerFields    block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'spacer' }>>) => void} /> : null}
        {block.type === 'html'      ? <HtmlFields      block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'html' }>>) => void} /> : null}
        {block.type === 'split'     ? <SplitFields     block={block} brand={brand} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'split' }>>) => void} /> : null}
        {block.type === 'headerBar' ? <HeaderBarFields block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'headerBar' }>>) => void} /> : null}
        {block.type === 'card'      ? <CardFields      block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'card' }>>) => void} /> : null}
        {block.type === 'social'    ? <SocialFields    block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'social' }>>) => void} /> : null}
        {block.type === 'coupon'    ? <CouponFields    block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'coupon' }>>) => void} /> : null}
        {block.type === 'table'     ? <TableFields     block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'table' }>>) => void} /> : null}
        {block.type === 'review'    ? <ReviewFields    block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'review' }>>) => void} /> : null}
        {block.type === 'video'     ? <VideoFields     block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'video' }>>) => void} /> : null}
        {block.type === 'product'   ? <ProductFields   block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'product' }>>) => void} /> : null}
        {block.type === 'section'   ? <SectionFields   block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'section' }>>) => void} /> : null}
        <PaddingFields block={block} onChange={onChange as (p: { paddingTopPx?: number; paddingBottomPx?: number }) => void} />
      </div>
    </aside>
  );
}

// ─── Field helpers ──────────────────────────────────────────────

const inputCls = 'w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none';

/**
 * Font dropdown that pulls in the brand kit's uploaded custom fonts +
 * brand defaults + the standard system / Google fonts. Used by every
 * block type with typography (Heading / Text / Button / Split).
 */
const SYSTEM_FONTS = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS'];
const GOOGLE_FONTS = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Playfair Display', 'Merriweather', 'Raleway'];

function FontDropdown({ value, onChange, brand, label = 'Font (override)' }: { value: string; onChange: (v: string) => void; brand?: MarketingBrand; label?: string }) {
  const customFamilies = brand?.customFonts
    ? [...new Set(brand.customFonts.map((f) => f.name))].sort()
    : [];
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">— inherit brand body —</option>
        {customFamilies.length > 0 ? (
          <optgroup label="Brand fonts (uploaded)">
            {customFamilies.map((n) => <option key={`c-${n}`} value={n}>{n}</option>)}
          </optgroup>
        ) : null}
        {brand?.fonts ? (
          <optgroup label="Brand defaults">
            {brand.fonts.heading ? <option value={brand.fonts.heading}>{brand.fonts.heading} (heading)</option> : null}
            {brand.fonts.body && brand.fonts.body !== brand.fonts.heading ? <option value={brand.fonts.body}>{brand.fonts.body} (body)</option> : null}
          </optgroup>
        ) : null}
        <optgroup label="System">
          {SYSTEM_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </optgroup>
        <optgroup label="Google Fonts">
          {GOOGLE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </optgroup>
      </select>
    </label>
  );
}

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">{label}</span>
      <div className="flex items-center gap-1">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-9 rounded border border-evari-edge/30 bg-evari-ink cursor-pointer" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 px-2 py-1 rounded bg-evari-ink text-evari-text text-[11px] font-mono border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
      </div>
    </label>
  );
}

function NumField({ label, value, min, max, onChange, step }: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">{label}</span>
      <input
        type="number" value={value}
        min={min} max={max} step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm font-mono border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
      />
    </label>
  );
}

function AlignmentField({ value, onChange }: { value: EmailAlignment; onChange: (v: EmailAlignment) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Alignment</span>
      <div className="inline-flex rounded-md bg-evari-ink border border-evari-edge/30 p-0.5">
        {(['left', 'center', 'right'] as EmailAlignment[]).map((a) => (
          <button key={a} type="button" onClick={() => onChange(a)} className={cn('px-3 py-1 rounded text-xs font-medium capitalize transition-colors duration-300', value === a ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text')}>{a}</button>
        ))}
      </div>
    </label>
  );
}

function HeadingFields({ block, brand, onChange }: { block: Extract<EmailBlock, { type: 'heading' }>; brand: MarketingBrand; onChange: (p: Partial<Extract<EmailBlock, { type: 'heading' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">
          <span>Heading text (HTML allowed)</span>
          <VariableMenu onPick={(token) => onChange({ html: block.html + token })} />
        </span>
        <textarea value={block.html} onChange={(e) => onChange({ html: e.target.value })} className={cn(inputCls, 'min-h-[60px] font-mono text-[12px]')} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Level</span>
          <select value={block.level} onChange={(e) => onChange({ level: Number(e.target.value) as 1 | 2 | 3 })} className={inputCls}>
            <option value={1}>H1 (28px)</option>
            <option value={2}>H2 (22px)</option>
            <option value={3}>H3 (18px)</option>
          </select>
        </label>
        <ColourField label="Colour" value={block.color} onChange={(v) => onChange({ color: v })} />
        <FontDropdown value={block.fontFamily} brand={brand} onChange={(v) => onChange({ fontFamily: v })} />
      </div>
      <AlignmentField value={block.alignment} onChange={(v) => onChange({ alignment: v })} />
    </div>
  );
}

function TextFields({ block, brand, onChange }: { block: Extract<EmailBlock, { type: 'text' }>; brand: MarketingBrand; onChange: (p: Partial<Extract<EmailBlock, { type: 'text' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">
          <span>Content (HTML allowed)</span>
          <VariableMenu onPick={(token) => onChange({ html: block.html + token })} />
        </span>
        <textarea value={block.html} onChange={(e) => onChange({ html: e.target.value })} className={cn(inputCls, 'min-h-[100px] font-mono text-[12px]')} />
      </label>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <NumField label="Size (px)" value={block.fontSizePx} min={10} max={48} onChange={(v) => onChange({ fontSizePx: v })} />
        <NumField label="Line height" value={block.lineHeight} step={0.05} min={1} max={3} onChange={(v) => onChange({ lineHeight: v })} />
        <ColourField label="Colour" value={block.color} onChange={(v) => onChange({ color: v })} />
        <FontDropdown value={block.fontFamily} brand={brand} onChange={(v) => onChange({ fontFamily: v })} />
      </div>
      <AlignmentField value={block.alignment} onChange={(v) => onChange({ alignment: v })} />
    </div>
  );
}

function ImageFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'image' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'image' }>>) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">
          <span>Image URL</span>
          <button type="button" onClick={() => setPickerOpen(true)} className="normal-case tracking-normal text-[10px] text-evari-gold hover:underline inline-flex items-center gap-1">
            <FolderOpen className="h-3 w-3" /> Browse library
          </button>
        </span>
        <input type="url" value={block.src} onChange={(e) => onChange({ src: e.target.value })} placeholder="https://…" className={cn(inputCls, 'font-mono text-[12px]')} />
      </label>
      {pickerOpen ? (
        <AssetPickerModal
          onClose={() => setPickerOpen(false)}
          onPick={(url, alt) => {
            onChange({ src: url, alt: alt || block.alt });
            setPickerOpen(false);
          }}
        />
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Alt text</span>
          <input type="text" value={block.alt} onChange={(e) => onChange({ alt: e.target.value })} className={inputCls} />
        </label>
        <NumField label="Max width (px)" value={block.maxWidthPx} min={40} max={1200} onChange={(v) => onChange({ maxWidthPx: v })} />
      </div>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Click-through URL (optional)</span>
        <input type="url" value={block.linkUrl ?? ''} onChange={(e) => onChange({ linkUrl: e.target.value || undefined })} placeholder="https://…" className={cn(inputCls, 'font-mono text-[12px]')} />
      </label>
      <AlignmentField value={block.alignment} onChange={(v) => onChange({ alignment: v })} />
    </div>
  );
}

function ButtonFields({ block, brand, onChange }: { block: Extract<EmailBlock, { type: 'button' }>; brand: MarketingBrand; onChange: (p: Partial<Extract<EmailBlock, { type: 'button' }>>) => void }) {
  // brand reserved for future button-font support
  void brand;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">
            <span>Label</span>
            <VariableMenu onPick={(token) => onChange({ label: block.label + token })} />
          </span>
          <input type="text" value={block.label} onChange={(e) => onChange({ label: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">URL</span>
          <input type="url" value={block.url} onChange={(e) => onChange({ url: e.target.value })} className={cn(inputCls, 'font-mono text-[12px]')} />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ColourField label="Background" value={block.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
        <ColourField label="Text" value={block.textColor} onChange={(v) => onChange({ textColor: v })} />
        <NumField label="Radius (px)" value={block.borderRadiusPx} min={0} max={40} onChange={(v) => onChange({ borderRadiusPx: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Padding X (px)" value={block.paddingXPx} min={4} max={64} onChange={(v) => onChange({ paddingXPx: v })} />
        <NumField label="Padding Y (px)" value={block.paddingYPx} min={4} max={48} onChange={(v) => onChange({ paddingYPx: v })} />
      </div>
      <AlignmentField value={block.alignment} onChange={(v) => onChange({ alignment: v })} />
    </div>
  );
}

function DividerFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'divider' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'divider' }>>) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <ColourField label="Colour" value={block.color} onChange={(v) => onChange({ color: v })} />
      <NumField label="Thickness (px)" value={block.thicknessPx} min={1} max={8} onChange={(v) => onChange({ thicknessPx: v })} />
      <NumField label="Margin Y (px)" value={block.marginYPx} min={0} max={64} onChange={(v) => onChange({ marginYPx: v })} />
    </div>
  );
}

function SpacerFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'spacer' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'spacer' }>>) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Height (px)</span>
      <input type="range" min={4} max={120} value={block.heightPx} onChange={(e) => onChange({ heightPx: Number(e.target.value) })} className="w-full accent-evari-gold" />
      <span className="text-[10px] text-evari-dimmer font-mono tabular-nums">{block.heightPx}px</span>
    </label>
  );
}

function PaddingFields({ block, onChange }: { block: { paddingTopPx?: number; paddingBottomPx?: number }; onChange: (p: { paddingTopPx?: number; paddingBottomPx?: number }) => void }) {
  const top = block.paddingTopPx ?? 0;
  const bot = block.paddingBottomPx ?? 0;
  return (
    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-evari-edge/10">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Padding above</span>
        <input type="range" min={0} max={120} value={top} onChange={(e) => onChange({ paddingTopPx: Number(e.target.value) })} className="w-full accent-evari-gold" />
        <span className="text-[10px] text-evari-dimmer font-mono tabular-nums">{top}px</span>
      </label>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Padding below</span>
        <input type="range" min={0} max={120} value={bot} onChange={(e) => onChange({ paddingBottomPx: Number(e.target.value) })} className="w-full accent-evari-gold" />
        <span className="text-[10px] text-evari-dimmer font-mono tabular-nums">{bot}px</span>
      </label>
    </div>
  );
}

// ─── Variable insertion menu ────────────────────────────────────

const VARIABLES: Array<{ token: string; label: string; hint: string }> = [
  { token: '{{firstName}}',     label: 'First name',     hint: 'Recipient first name' },
  { token: '{{lastName}}',      label: 'Last name',      hint: 'Recipient last name' },
  { token: '{{email}}',         label: 'Email',          hint: 'Recipient email address' },
  { token: '{{companyName}}',   label: 'Company',        hint: 'Recipient company name' },
  { token: '{{jobTitle}}',      label: 'Role',           hint: 'Recipient job title' },
  { token: '{{unsubscribeUrl}}', label: 'Unsubscribe URL', hint: 'Personalised unsubscribe link' },
];

function VariableMenu({ onPick }: { onPick: (token: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="normal-case tracking-normal text-[10px] text-evari-gold hover:underline inline-flex items-center gap-1"
      >
        <AtSign className="h-3 w-3" /> Insert variable
      </button>
      {open ? (
        <div className="absolute top-5 right-0 z-20 rounded-md bg-evari-surface border border-evari-edge/40 shadow-lg py-1 min-w-[200px]">
          {VARIABLES.map((v) => (
            <button
              key={v.token}
              type="button"
              onClick={() => { onPick(v.token); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 hover:bg-evari-ink text-evari-text"
            >
              <div className="text-[12px]">{v.label}</div>
              <div className="text-[10px] text-evari-dimmer font-mono">{v.token}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Asset library picker ───────────────────────────────────────

interface MktAssetLite { id: string; url: string; filename: string; altText: string | null; }

function AssetPickerModal({ onClose, onPick }: { onClose: () => void; onPick: (url: string, alt: string) => void }) {
  const [assets, setAssets] = useState<MktAssetLite[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useMemo(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const url = search.trim() ? `/api/marketing/assets?search=${encodeURIComponent(search.trim())}` : '/api/marketing/assets';
    fetch(url, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setAssets(((d?.assets ?? []) as Array<{ id: string; url: string; filename: string; altText?: string | null }>).map((a) => ({ id: a.id, url: a.url, filename: a.filename, altText: a.altText ?? null }))))
      .catch((e) => { if (e?.name !== 'AbortError') setError(e instanceof Error ? e.message : 'Load failed'); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-5xl h-[80vh] rounded-md bg-evari-surface border border-evari-edge/40 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2 px-4 py-3 border-b border-evari-edge/20">
          <h3 className="text-sm font-semibold text-evari-text">Asset library</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search filename…"
            className="flex-1 max-w-xs px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none ml-3"
          />
          <a href="/email/assets" target="_blank" rel="noopener" className="text-[11px] text-evari-dim hover:text-evari-text underline underline-offset-2">Manage library →</a>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text inline-flex items-center gap-1 px-2 py-1 rounded">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="py-12 text-center text-sm text-evari-dimmer inline-flex items-center gap-2 w-full justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-evari-danger">{error}</div>
          ) : assets.length === 0 ? (
            <div className="py-12 text-center text-sm text-evari-dimmer">
              No assets {search ? 'match that filter' : 'yet'}. Upload some at <a href="/email/assets" className="text-evari-gold underline">/email/assets</a>.
            </div>
          ) : (
            <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {assets.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onPick(a.url, a.altText ?? a.filename)}
                    className="block w-full text-left rounded-md border border-evari-edge/30 bg-evari-ink overflow-hidden hover:border-evari-gold/60 transition-colors"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.altText ?? a.filename} className="w-full aspect-square object-cover bg-zinc-100" />
                    <div className="p-1.5 text-[10px] text-evari-dim truncate font-mono">{a.filename}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Interactive canvas blocks ─────────────────────────────────

function EmptyCanvas() {
  const { isOver, setNodeRef } = useDroppable({ id: 'end-of-list' });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md border-2 border-dashed text-center text-evari-dimmer text-sm py-16 px-3 transition-colors',
        isOver ? 'border-evari-gold/60 bg-evari-gold/5 text-evari-gold' : 'border-zinc-300 text-zinc-400',
      )}
    >
      Drag a tile from the palette to start, or click one to add.
    </div>
  );
}

function CanvasEndDrop() {
  const { isOver, setNodeRef } = useDroppable({ id: 'end-of-list' });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'h-3 rounded transition-colors',
        isOver && 'h-8 bg-evari-gold/15 border-2 border-dashed border-evari-gold/60',
      )}
    />
  );
}

/**
 * One block rendered into the interactive canvas. Clicking selects;
 * hovering reveals a small toolbar with the drag handle + delete.
 *
 * Sections are special — they render as a styled wrapper with a
 * background image / colour, and recursively render their children
 * as nested CanvasBlocks inside their own SortableContext. Every
 * block is its own React node so click + drag work natively.
 */
function CanvasBlock({ block, brand, selected, selectedId, onSelect, onRemove, onSelectChild, onRemoveChild }: {
  block: EmailBlock;
  brand: MarketingBrand;
  selected: boolean;
  selectedId: string | null;
  onSelect: () => void;
  onRemove: () => void;
  onSelectChild: (id: string) => void;
  onRemoveChild: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Sections render as a real DOM wrapper so children can layer on top.
  // Everything else uses the renderer's email-safe HTML directly.
  const isSection = block.type === 'section';
  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <CanvasInsertionZone overId={block.id} />
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        className={cn(
          'relative cursor-pointer transition-shadow',
          selected ? 'ring-2 ring-evari-gold ring-offset-1 ring-offset-white' : 'hover:ring-2 hover:ring-evari-gold/30 hover:ring-offset-1 hover:ring-offset-white',
        )}
      >
        {isSection ? (
          <SectionCanvasWrapper
            block={block as Extract<EmailBlock, { type: 'section' }>}
            brand={brand}
            selectedId={selectedId}
            onSelectChild={onSelectChild}
            onRemoveChild={onRemoveChild}
          />
        ) : (
          <div className="pointer-events-none" dangerouslySetInnerHTML={{ __html: renderEmailBlockHtml(block, brand) }} />
        )}
        <div className={cn(
          'absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-md bg-evari-ink border border-evari-edge/40 shadow-lg transition-opacity',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}>
          <button type="button" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} className="p-1.5 text-evari-dim hover:text-evari-text cursor-grab active:cursor-grabbing" title="Drag to reorder" aria-label="Drag to reorder">
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1.5 text-evari-dim hover:text-evari-danger" title="Delete block" aria-label="Delete block">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionCanvasWrapper({ block, brand, selectedId, onSelectChild, onRemoveChild }: {
  block: Extract<EmailBlock, { type: 'section' }>;
  brand: MarketingBrand;
  selectedId: string | null;
  onSelectChild: (id: string) => void;
  onRemoveChild: (id: string) => void;
}) {
  const wrapperStyle: React.CSSProperties = {
    backgroundColor: block.backgroundColor,
    backgroundImage: block.backgroundImage ? `url(${block.backgroundImage})` : undefined,
    backgroundSize: block.backgroundSize ?? 'cover',
    backgroundPosition: block.backgroundPosition ?? 'center',
    backgroundRepeat: 'no-repeat',
    borderRadius: `${block.borderRadiusPx}px`,
    padding: `${block.paddingPx}px`,
    minHeight: block.minHeightPx ? `${block.minHeightPx}px` : undefined,
    color: block.contentColor ?? undefined,
  };
  const childIds = (block.blocks ?? []).map((c) => c.id);
  return (
    <div style={wrapperStyle} className="relative">
      <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
        {(block.blocks ?? []).length === 0 ? (
          <SectionEmptyDrop sectionId={block.id} />
        ) : (
          <div className="space-y-0">
            {(block.blocks ?? []).map((c) => (
              <CanvasBlock
                key={c.id}
                block={c}
                brand={brand}
                selected={selectedId === c.id}
                selectedId={selectedId}
                onSelect={() => onSelectChild(c.id)}
                onRemove={() => onRemoveChild(c.id)}
                onSelectChild={onSelectChild}
                onRemoveChild={onRemoveChild}
              />
            ))}
            <SectionEndDrop sectionId={block.id} />
          </div>
        )}
      </SortableContext>
    </div>
  );
}

function SectionEmptyDrop({ sectionId }: { sectionId: string }) {
  const { isOver, setNodeRef } = useDroppable({ id: `section-end:${sectionId}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded border-2 border-dashed text-center text-sm py-12 px-3 transition-colors',
        isOver ? 'border-evari-gold/70 bg-evari-gold/10 text-evari-gold' : 'border-white/30 text-white/60',
      )}
    >
      Drop blocks here to layer on top of this section.
    </div>
  );
}

function SectionEndDrop({ sectionId }: { sectionId: string }) {
  const { isOver, setNodeRef } = useDroppable({ id: `section-end:${sectionId}` });
  return (
    <div ref={setNodeRef} className={cn('h-3 rounded transition-colors', isOver && 'h-8 bg-evari-gold/15 border-2 border-dashed border-evari-gold/60')} />
  );
}

function CanvasInsertionZone({ overId }: { overId: string }) {
  const { isOver, setNodeRef } = useDroppable({ id: overId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'h-1 -my-px rounded transition-all',
        isOver && 'h-3 bg-evari-gold/15 border-y-2 border-dashed border-evari-gold/70',
      )}
    />
  );
}

// ─── Field editors for the extended block library ───────────────

function HtmlFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'html' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'html' }>>) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Custom HTML (escape hatch)</span>
      <textarea value={block.html} onChange={(e) => onChange({ html: e.target.value })} className={cn(inputCls, 'min-h-[140px] font-mono text-[12px]')} />
    </label>
  );
}

function SplitFields({ block, brand, onChange }: { block: Extract<EmailBlock, { type: 'split' }>; brand: MarketingBrand; onChange: (p: Partial<Extract<EmailBlock, { type: 'split' }>>) => void }) {
  // brand reserved for future split-font support
  void brand;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Image URL</span>
          <input type="url" value={block.imageSrc} onChange={(e) => onChange({ imageSrc: e.target.value })} className={cn(inputCls, 'font-mono text-[12px]')} />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Image position</span>
          <select value={block.imagePosition} onChange={(e) => onChange({ imagePosition: e.target.value as 'left' | 'right' })} className={inputCls}>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Text (HTML)</span>
        <textarea value={block.html} onChange={(e) => onChange({ html: e.target.value })} className={cn(inputCls, 'min-h-[80px] font-mono text-[12px]')} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Button label</span>
          <input type="text" value={block.buttonLabel ?? ''} onChange={(e) => onChange({ buttonLabel: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Button URL</span>
          <input type="url" value={block.buttonUrl ?? ''} onChange={(e) => onChange({ buttonUrl: e.target.value })} className={cn(inputCls, 'font-mono text-[12px]')} />
        </label>
      </div>
    </div>
  );
}

function HeaderBarFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'headerBar' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'headerBar' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Logo URL (blank = brand light logo)</span>
        <input type="url" value={block.logoUrl} onChange={(e) => onChange({ logoUrl: e.target.value })} className={cn(inputCls, 'font-mono text-[12px]')} />
      </label>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Tagline (right side)</span>
        <input type="text" value={block.tagline} onChange={(e) => onChange({ tagline: e.target.value })} className={inputCls} />
      </label>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Click-through URL (optional)</span>
        <input type="url" value={block.linkUrl} onChange={(e) => onChange({ linkUrl: e.target.value })} className={cn(inputCls, 'font-mono text-[12px]')} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <ColourField label="Background" value={block.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
        <ColourField label="Text" value={block.textColor} onChange={(v) => onChange({ textColor: v })} />
      </div>
    </div>
  );
}

function CardFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'card' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'card' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Card content (HTML)</span>
        <textarea value={block.html} onChange={(e) => onChange({ html: e.target.value })} className={cn(inputCls, 'min-h-[100px] font-mono text-[12px]')} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <ColourField label="Background" value={block.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
        <NumField label="Radius (px)" value={block.borderRadiusPx} min={0} max={40} onChange={(v) => onChange({ borderRadiusPx: v })} />
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Shadow</span>
          <select value={block.shadow} onChange={(e) => onChange({ shadow: e.target.value as 'sm' | 'md' | 'lg' })} className={inputCls}>
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </select>
        </label>
      </div>
      <NumField label="Inner padding (px)" value={block.paddingPx} min={4} max={64} onChange={(v) => onChange({ paddingPx: v })} />
    </div>
  );
}

const SOCIAL_PLATFORMS: Extract<EmailBlock, { type: 'social' }>['items'][number]['platform'][] = ['instagram', 'twitter', 'linkedin', 'facebook', 'tiktok', 'youtube', 'website'];

function SocialFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'social' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'social' }>>) => void }) {
  function setItem(i: number, patch: Partial<typeof block.items[number]>) {
    const next = block.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    onChange({ items: next });
  }
  function addItem() {
    onChange({ items: [...block.items, { platform: 'instagram', url: '' }] });
  }
  function removeItem(i: number) {
    onChange({ items: block.items.filter((_, idx) => idx !== i) });
  }
  return (
    <div className="space-y-2">
      {block.items.map((it, i) => (
        <div key={i} className="grid grid-cols-[120px_1fr_auto] gap-1.5 items-start">
          <select value={it.platform} onChange={(e) => setItem(i, { platform: e.target.value as typeof SOCIAL_PLATFORMS[number] })} className={inputCls}>
            {SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="url" value={it.url} onChange={(e) => setItem(i, { url: e.target.value })} placeholder="https://…" className={cn(inputCls, 'font-mono text-[12px]')} />
          <button type="button" onClick={() => removeItem(i)} className="text-evari-dim hover:text-evari-danger px-1 py-1">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button type="button" onClick={addItem} className="text-[11px] text-evari-gold hover:underline">+ Add platform</button>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <AlignmentField value={block.alignment} onChange={(v) => onChange({ alignment: v })} />
        <ColourField label="Icon colour" value={block.iconColor} onChange={(v) => onChange({ iconColor: v })} />
      </div>
    </div>
  );
}

function CouponFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'coupon' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'coupon' }>>) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Code</span>
          <input type="text" value={block.code} onChange={(e) => onChange({ code: e.target.value })} className={cn(inputCls, 'font-mono uppercase tracking-wider')} />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Title (above code)</span>
          <input type="text" value={block.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Subtitle (below code)</span>
        <input type="text" value={block.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} className={inputCls} />
      </label>
      <label className="block">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">
          <Calendar className="h-3 w-3" /> Expiry (free text)
        </span>
        <input type="text" value={block.expiry} onChange={(e) => onChange({ expiry: e.target.value })} placeholder="31 Dec 2026" className={inputCls} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <ColourField label="Background" value={block.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
        <ColourField label="Text" value={block.textColor} onChange={(v) => onChange({ textColor: v })} />
        <ColourField label="Border" value={block.borderColor} onChange={(v) => onChange({ borderColor: v })} />
      </div>
    </div>
  );
}

function TableFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'table' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'table' }>>) => void }) {
  function setRow(i: number, patch: Partial<typeof block.rows[number]>) {
    const next = block.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange({ rows: next });
  }
  function addRow() {
    onChange({ rows: [...block.rows, { label: 'New row', value: '' }] });
  }
  function removeRow(i: number) {
    onChange({ rows: block.rows.filter((_, idx) => idx !== i) });
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Header — label column</span>
          <input type="text" value={block.headerLabel} onChange={(e) => onChange({ headerLabel: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Header — value column</span>
          <input type="text" value={block.headerValue} onChange={(e) => onChange({ headerValue: e.target.value })} className={inputCls} />
        </label>
      </div>
      {block.rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-start">
          <input type="text" value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} className={inputCls} />
          <input type="text" value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} className={inputCls} />
          <button type="button" onClick={() => removeRow(i)} className="text-evari-dim hover:text-evari-danger px-1 py-1">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow} className="text-[11px] text-evari-gold hover:underline">+ Add row</button>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <ColourField label="Border" value={block.borderColor} onChange={(v) => onChange({ borderColor: v })} />
        <ColourField label="Stripe" value={block.stripeColor} onChange={(v) => onChange({ stripeColor: v })} />
      </div>
    </div>
  );
}

function ReviewFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'review' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'review' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Quote</span>
        <textarea value={block.quote} onChange={(e) => onChange({ quote: e.target.value })} className={cn(inputCls, 'min-h-[80px] italic')} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Author</span>
          <input type="text" value={block.author} onChange={(e) => onChange({ author: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Role / company</span>
          <input type="text" value={block.role} onChange={(e) => onChange({ role: e.target.value })} className={inputCls} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">
            <Star className="h-3 w-3" /> Rating (0–5)
          </span>
          <input type="number" min={0} max={5} step={0.5} value={block.rating} onChange={(e) => onChange({ rating: Number(e.target.value) })} className={cn(inputCls, 'font-mono')} />
        </label>
        <ColourField label="Background" value={block.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
      </div>
    </div>
  );
}

function VideoFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'video' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'video' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Thumbnail URL</span>
        <input type="url" value={block.thumbnailSrc} onChange={(e) => onChange({ thumbnailSrc: e.target.value })} className={cn(inputCls, 'font-mono text-[12px]')} />
      </label>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Video URL (where the play button goes)</span>
        <input type="url" value={block.videoUrl} onChange={(e) => onChange({ videoUrl: e.target.value })} className={cn(inputCls, 'font-mono text-[12px]')} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Alt text</span>
          <input type="text" value={block.alt} onChange={(e) => onChange({ alt: e.target.value })} className={inputCls} />
        </label>
        <NumField label="Max width (px)" value={block.maxWidthPx} min={120} max={1200} onChange={(v) => onChange({ maxWidthPx: v })} />
      </div>
      <AlignmentField value={block.alignment} onChange={(v) => onChange({ alignment: v })} />
    </div>
  );
}

function ProductFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'product' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'product' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Image URL</span>
        <input type="url" value={block.imageSrc} onChange={(e) => onChange({ imageSrc: e.target.value })} className={cn(inputCls, 'font-mono text-[12px]')} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Title</span>
          <input type="text" value={block.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Price</span>
          <input type="text" value={block.price} onChange={(e) => onChange({ price: e.target.value })} className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Description (HTML)</span>
        <textarea value={block.description} onChange={(e) => onChange({ description: e.target.value })} className={cn(inputCls, 'min-h-[60px] font-mono text-[12px]')} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Button label</span>
          <input type="text" value={block.buttonLabel} onChange={(e) => onChange({ buttonLabel: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Button URL</span>
          <input type="url" value={block.buttonUrl} onChange={(e) => onChange({ buttonUrl: e.target.value })} className={cn(inputCls, 'font-mono text-[12px]')} />
        </label>
      </div>
      <ColourField label="Card background" value={block.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
    </div>
  );
}

function SectionFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'section' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'section' }>>) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const childCount = (block.blocks ?? []).length;
  return (
    <div className="space-y-3">
      {/* Background image — header bar style with drop / pick / clear */}
      <section>
        <h4 className="text-[11px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-1.5">Background image</h4>
        {block.backgroundImage ? (
          <div className="rounded-md border border-evari-edge/30 bg-evari-ink overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={block.backgroundImage} alt="" className="w-full aspect-video object-cover bg-zinc-900" />
            <div className="flex items-center gap-1 p-1.5">
              <button type="button" onClick={() => setPickerOpen(true)} className="text-[10px] text-evari-gold hover:underline px-1">Replace</button>
              <button type="button" onClick={() => onChange({ backgroundImage: '' })} className="text-[10px] text-evari-dim hover:text-evari-danger px-1 ml-auto">Remove</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full rounded-md border-2 border-dashed border-evari-edge/30 px-3 py-6 text-center text-[11px] text-evari-dim hover:text-evari-text hover:border-evari-gold/60 transition-colors"
          >
            <FolderOpen className="h-4 w-4 mx-auto mb-1" />
            Browse asset library
          </button>
        )}
        <label className="block mt-1.5">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Or paste a URL</span>
          <input type="url" value={block.backgroundImage ?? ''} onChange={(e) => onChange({ backgroundImage: e.target.value })} className={cn(inputCls, 'font-mono text-[12px]')} />
        </label>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Image size</span>
            <select value={block.backgroundSize ?? 'cover'} onChange={(e) => onChange({ backgroundSize: e.target.value as 'cover' | 'contain' | 'auto' })} className={inputCls}>
              <option value="cover">Cover (fill)</option>
              <option value="contain">Contain (fit)</option>
              <option value="auto">Auto (native)</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Position</span>
            <select value={block.backgroundPosition ?? 'center'} onChange={(e) => onChange({ backgroundPosition: e.target.value })} className={inputCls}>
              <option value="center">Center</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="top left">Top left</option>
              <option value="top right">Top right</option>
              <option value="bottom left">Bottom left</option>
              <option value="bottom right">Bottom right</option>
            </select>
          </label>
        </div>
      </section>

      {/* Colours */}
      <section>
        <h4 className="text-[11px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-1.5">Colours</h4>
        <div className="grid grid-cols-2 gap-2">
          <ColourField label="Background" value={block.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
          <ColourField label="Text on top" value={block.contentColor ?? '#ffffff'} onChange={(v) => onChange({ contentColor: v })} />
        </div>
      </section>

      {/* Spacing */}
      <section>
        <h4 className="text-[11px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-1.5">Spacing</h4>
        <div className="grid grid-cols-3 gap-2">
          <NumField label="Inner padding" value={block.paddingPx} min={0} max={120} onChange={(v) => onChange({ paddingPx: v })} />
          <NumField label="Min height" value={block.minHeightPx ?? 0} min={0} max={800} onChange={(v) => onChange({ minHeightPx: v })} />
          <NumField label="Radius (px)" value={block.borderRadiusPx} min={0} max={40} onChange={(v) => onChange({ borderRadiusPx: v })} />
        </div>
      </section>

      <p className="text-[10px] text-evari-dimmer">
        {childCount === 0
          ? 'Empty section — drag tiles from the left palette into the section\'s body in the canvas to layer blocks on top of the background.'
          : `${childCount} block${childCount === 1 ? '' : 's'} layered on top.`}
      </p>

      {pickerOpen ? (
        <AssetPickerModal
          onClose={() => setPickerOpen(false)}
          onPick={(url) => { onChange({ backgroundImage: url }); setPickerOpen(false); }}
        />
      ) : null}
    </div>
  );
}
