'use client';

import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Heading1,
  Image as ImageIcon,
  Link2,
  Loader2,
  Minus,
  MousePointerClick,
  Move,
  PenLine,
  Trash2,
  Type,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
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
import { renderEmailDesign, normaliseEmailDesign } from '@/lib/marketing/email-design';

interface Props {
  initialBrand: MarketingBrand;
  value: EmailDesign | null;
  onChange: (next: EmailDesign) => void;
}

function nid(): string { return Math.random().toString(36).slice(2, 10); }

const ADD_BUTTONS: Array<{ type: EmailBlock['type']; label: string; Icon: typeof Type; make: () => EmailBlock }> = [
  { type: 'heading', label: 'Heading', Icon: Heading1,           make: () => ({ id: nid(), type: 'heading', level: 1, html: 'New heading', alignment: 'left', color: '#111111', fontFamily: '', paddingBottomPx: 12 }) },
  { type: 'text',    label: 'Text',    Icon: Type,               make: () => ({ id: nid(), type: 'text', html: 'Write your message here.', alignment: 'left', fontSizePx: 16, lineHeight: 1.55, color: '#333333', fontFamily: '', paddingBottomPx: 16 }) },
  { type: 'image',   label: 'Image',   Icon: ImageIcon,          make: () => ({ id: nid(), type: 'image', src: '', alt: '', maxWidthPx: 600, alignment: 'center', paddingBottomPx: 16 }) },
  { type: 'button',  label: 'Button',  Icon: MousePointerClick,  make: () => ({ id: nid(), type: 'button', label: 'Click me', url: 'https://evari.cc', alignment: 'center', backgroundColor: '#1a1a1a', textColor: '#ffffff', borderRadiusPx: 4, paddingXPx: 24, paddingYPx: 12, paddingBottomPx: 24 }) },
  { type: 'divider', label: 'Divider', Icon: Minus,              make: () => ({ id: nid(), type: 'divider', color: '#e5e5e5', thicknessPx: 1, marginYPx: 16 }) },
  { type: 'spacer',  label: 'Spacer',  Icon: Move,               make: () => ({ id: nid(), type: 'spacer', heightPx: 24 }) },
];

/**
 * Block-based visual email builder. Same architecture as the Footer
 * + Signature designers — the file lives alongside them so the three
 * stay in sync stylistically. Viewer LEFT, tools RIGHT, drag-to-reorder,
 * highlight-selected-block in the preview, common per-block padding.
 */
export function EmailDesigner({ initialBrand, value, onChange }: Props) {
  const design = normaliseEmailDesign(value) ?? DEFAULT_EMAIL_DESIGN;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function updateDesign(patch: Partial<EmailDesign>) {
    onChange({ ...design, ...patch });
  }
  function updateBlock(id: string, patch: Partial<EmailBlock>) {
    onChange({
      ...design,
      blocks: design.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)),
    });
  }
  function removeBlock(id: string) {
    onChange({ ...design, blocks: design.blocks.filter((b) => b.id !== id) });
  }
  function addBlock(maker: () => EmailBlock) {
    onChange({ ...design, blocks: [...design.blocks, maker()] });
  }
  function moveBlocks(activeId: string, overId: string) {
    const from = design.blocks.findIndex((b) => b.id === activeId);
    const to   = design.blocks.findIndex((b) => b.id === overId);
    if (from < 0 || to < 0 || from === to) return;
    onChange({ ...design, blocks: arrayMove(design.blocks, from, to) });
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

  return (
    <section className="rounded-md bg-evari-surface border border-evari-edge/30 flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b border-evari-edge/20">
        <h2 className="text-sm font-semibold text-evari-text">Visual editor</h2>
        <span className="text-[10px] text-evari-dimmer">Drag blocks to reorder · same renderer at preview + send</span>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(320px,40%)] gap-3 p-3">
        {/* Viewer LEFT */}
        <div className="flex flex-col">
          <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Live preview</div>
          <div className="rounded-md border border-evari-edge/30 overflow-hidden bg-zinc-100">
            <iframe
              title="Email preview"
              className="w-full bg-white block"
              style={{ height: '720px' }}
              srcDoc={previewHtml}
            />
          </div>
        </div>

        {/* Tools RIGHT */}
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mr-1">Add</span>
            {ADD_BUTTONS.map((b) => {
              const Icon = b.Icon;
              return (
                <button
                  key={b.type}
                  type="button"
                  onClick={() => addBlock(b.make)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-evari-ink text-evari-dim hover:text-evari-text hover:bg-black/40 transition-colors duration-300"
                >
                  <Icon className="h-3 w-3" />
                  {b.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-md bg-evari-ink/40 border border-evari-edge/20 p-3">
            <h3 className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2">Canvas</h3>
            <div className="grid grid-cols-3 gap-2">
              <ColourField label="Background" value={design.background} onChange={(v) => updateDesign({ background: v })} />
              <NumField label="Width (px)" value={design.widthPx} min={320} max={900} onChange={(v) => updateDesign({ widthPx: v })} />
              <NumField label="Padding (px)" value={design.paddingPx} min={0} max={96} onChange={(v) => updateDesign({ paddingPx: v })} />
            </div>
          </div>

          {design.blocks.length === 0 ? (
            <div className="rounded-md border-2 border-dashed border-evari-edge/30 px-3 py-12 text-center text-evari-dimmer text-sm">
              No blocks yet — pick something from the toolbar above.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(ev) => {
                if (ev.over && ev.active.id !== ev.over.id) {
                  moveBlocks(String(ev.active.id), String(ev.over.id));
                }
              }}
            >
              <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
                <ul className="space-y-1.5">
                  {design.blocks.map((b) => (
                    <SortableBlockRow
                      key={b.id}
                      block={b}
                      selected={selectedId === b.id}
                      onSelect={() => setSelectedId(selectedId === b.id ? null : b.id)}
                      onChange={(p) => updateBlock(b.id, p)}
                      onRemove={() => { setSelectedId(null); removeBlock(b.id); }}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </section>
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
        <button type="button" {...dragHandleProps} onClick={(e) => e.stopPropagation()} className="p-1 text-evari-dim hover:text-evari-text cursor-grab active:cursor-grabbing" aria-label="Drag">
          <GripVertical className="h-3.5 w-3.5" />
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
      {selected ? (
        <div className="border-t border-evari-edge/20 px-3 py-2 space-y-2">
          {block.type === 'heading' ? <HeadingFields block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'heading' }>>) => void} /> : null}
          {block.type === 'text'    ? <TextFields    block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'text' }>>) => void} /> : null}
          {block.type === 'image'   ? <ImageFields   block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'image' }>>) => void} /> : null}
          {block.type === 'button'  ? <ButtonFields  block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'button' }>>) => void} /> : null}
          {block.type === 'divider' ? <DividerFields block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'divider' }>>) => void} /> : null}
          {block.type === 'spacer'  ? <SpacerFields  block={block} onChange={onChange as (p: Partial<Extract<EmailBlock, { type: 'spacer' }>>) => void} /> : null}
          <PaddingFields block={block} onChange={onChange as (p: { paddingTopPx?: number; paddingBottomPx?: number }) => void} />
        </div>
      ) : null}
    </div>
  );
}

// ─── Field helpers ──────────────────────────────────────────────

const inputCls = 'w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none';

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

function HeadingFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'heading' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'heading' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Heading text (HTML allowed)</span>
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
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Font (override)</span>
          <input type="text" value={block.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })} placeholder="(brand body)" className={inputCls} />
        </label>
      </div>
      <AlignmentField value={block.alignment} onChange={(v) => onChange({ alignment: v })} />
    </div>
  );
}

function TextFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'text' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'text' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Content (HTML allowed)</span>
        <textarea value={block.html} onChange={(e) => onChange({ html: e.target.value })} className={cn(inputCls, 'min-h-[100px] font-mono text-[12px]')} />
      </label>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <NumField label="Size (px)" value={block.fontSizePx} min={10} max={48} onChange={(v) => onChange({ fontSizePx: v })} />
        <NumField label="Line height" value={block.lineHeight} step={0.05} min={1} max={3} onChange={(v) => onChange({ lineHeight: v })} />
        <ColourField label="Colour" value={block.color} onChange={(v) => onChange({ color: v })} />
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Font (override)</span>
          <input type="text" value={block.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })} placeholder="(brand body)" className={inputCls} />
        </label>
      </div>
      <AlignmentField value={block.alignment} onChange={(v) => onChange({ alignment: v })} />
    </div>
  );
}

function ImageFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'image' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'image' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Image URL</span>
        <input type="url" value={block.src} onChange={(e) => onChange({ src: e.target.value })} placeholder="https://…" className={cn(inputCls, 'font-mono text-[12px]')} />
      </label>
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

function ButtonFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'button' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'button' }>>) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Label</span>
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
