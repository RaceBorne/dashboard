'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Image as ImageIcon,
  Minus,
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
import { renderSignatureDesign, normaliseSignatureDesign } from '@/lib/marketing/signature';
import {
  DEFAULT_SIGNATURE_DESIGN,
  type FooterAlignment,
  type MarketingBrand,
  type SignatureBlock,
  type SignatureDesign,
} from '@/lib/marketing/types';

interface Props {
  initialBrand: MarketingBrand;
  value: SignatureDesign | null;
  onChange: (next: SignatureDesign) => void;
}

function nid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const FONT_OPTIONS = [
  '', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana',
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
];

const ADD_BUTTONS: Array<{ type: SignatureBlock['type']; label: string; Icon: typeof Type; make: () => SignatureBlock }> = [
  { type: 'text',    label: 'Text',         Icon: Type,      make: () => ({ id: nid(), type: 'text',    alignment: 'left', html: 'Type your copy here.', fontFamily: '', fontSizePx: 13, color: '#111111', lineHeight: 1.4 }) },
  { type: 'logo',    label: 'Branded logo', Icon: ImageIcon, make: () => ({ id: nid(), type: 'logo',    alignment: 'left', maxWidthPx: 120 }) },
  { type: 'spacer',  label: 'Spacer',       Icon: Move,      make: () => ({ id: nid(), type: 'spacer',  heightPx: 16 }) },
  { type: 'divider', label: 'Line',         Icon: Minus,     make: () => ({ id: nid(), type: 'divider', color: '#cccccc', thicknessPx: 1, marginYPx: 0 }) },
];

/**
 * Signature designer — full-width panel, viewer LEFT and tools RIGHT
 * (mirror of the FooterDesigner). Same block-builder UX restricted
 * to text / logo / spacer / line. Default block list reproduces the
 * existing template byte-for-byte so the preview lands looking the
 * same as before.
 */
export function SignatureDesigner({ initialBrand, value, onChange }: Props) {
  const design = normaliseSignatureDesign(value) ?? DEFAULT_SIGNATURE_DESIGN;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Click anywhere outside a block row → close the open detail panel.
  // The row's own onClick already handles 'switch to this row' so we
  // only need to deselect when the click landed nowhere meaningful.
  useEffect(() => {
    if (!selectedId) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('[data-sig-row]')) return;
      // Also keep when interacting with a portal modal / native browser
      // dropdown overlay — those land outside the row but mustn't close.
      if (t.closest('[role="dialog"]')) return;
      setSelectedId(null);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [selectedId]);

  function updateDesign(patch: Partial<SignatureDesign>) {
    onChange({ ...design, ...patch });
  }
  function updateBlock(id: string, patch: Partial<SignatureBlock>) {
    const next = design.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as SignatureBlock) : b));
    onChange({ ...design, blocks: next });
  }
  function removeBlock(id: string) {
    onChange({ ...design, blocks: design.blocks.filter((b) => b.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }
  function duplicateBlock(id: string) {
    const idx = design.blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const original = design.blocks[idx];
    const clone = { ...original, id: Math.random().toString(36).slice(2, 10) } as SignatureBlock;
    const next = [...design.blocks];
    next.splice(idx + 1, 0, clone);
    onChange({ ...design, blocks: next });
    setSelectedId(clone.id);
  }
  function addBlock(maker: () => SignatureBlock) {
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

  const previewBrand: MarketingBrand = { ...initialBrand, signatureDesign: design };
  const previewHtml = useMemo(
    () => renderSignatureDesign(design, previewBrand),
    [design, previewBrand],
  );

  return (
    <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 xl:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-evari-text">Email signature</h2>
        <span className="text-[10px] text-evari-dimmer">Drag blocks to reorder · same renderer as the mailbox preview</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,40%)_minmax(0,1fr)] gap-3">

        {/* Viewer LEFT */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Live preview</div>
          <div className="rounded-md border border-evari-edge/30 overflow-hidden bg-zinc-50">
            <style dangerouslySetInnerHTML={{ __html: selectedId ? `[data-sig-preview] [data-block-id="${selectedId}"]{outline:2px solid #d4a649;outline-offset:2px;border-radius:3px;background:rgba(212,166,73,0.08);}` : '' }} />
            <div
              data-sig-preview
              className="text-zinc-900 max-h-[640px] overflow-auto p-4"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
          <p className="text-[10px] text-evari-dimmer">
            Same function the sender uses at send time. Email-safe nested tables, inline CSS only.
          </p>
        </div>

        {/* Tools RIGHT */}
        <div className="space-y-2">
          {/* Add toolbar */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mr-1">Add</span>
            {ADD_BUTTONS.map((b) => {
              const Icon = b.Icon;
              return (
                <button
                  key={b.type}
                  type="button"
                  onClick={() => addBlock(b.make)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-evari-ink text-evari-dim hover:text-evari-text hover:bg-black/40 transition-colors duration-300 ease-in-out"
                >
                  <Icon className="h-3 w-3" />
                  {b.label}
                </button>
              );
            })}
          </div>

          {/* Wrapper styling (just background + padding for signatures) */}
          <div className="rounded-md bg-evari-ink/40 border border-evari-edge/20 p-3">
            <h3 className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2">Wrapper</h3>
            <div className="grid grid-cols-2 gap-2">
              <ColourField label="Background" value={design.background} onChange={(v) => updateDesign({ background: v })} allowTransparent />
              <label className="block">
                <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Padding (px)</span>
                <input type="number" min={0} max={48} value={design.paddingPx} onChange={(e) => updateDesign({ paddingPx: Math.max(0, Math.min(48, Number(e.target.value) || 0)) })} className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm font-mono border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
              </label>
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
                <ul className="space-y-1.5" onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
                  {design.blocks.map((b) => (
                    <SortableBlockRow
                      key={b.id}
                      block={b}
                      selected={selectedId === b.id}
                      onSelect={() => setSelectedId(selectedId === b.id ? null : b.id)}
                      onChange={(p) => updateBlock(b.id, p)}
                      onRemove={() => removeBlock(b.id)}
                      onDuplicate={() => duplicateBlock(b.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          <button
            type="button"
            onClick={() => onChange(DEFAULT_SIGNATURE_DESIGN)}
            className="text-[11px] text-evari-dim hover:text-evari-text underline underline-offset-2 transition-colors"
          >
            Reset to default Evari signature →
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── Sortable wrapper ──────────────────────────────────────────────

function SortableBlockRow({
  block,
  selected,
  onSelect,
  onChange,
  onRemove,
  onDuplicate,
}: {
  block: SignatureBlock;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<SignatureBlock>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} data-sig-row>
      <BlockEditor
        block={block}
        selected={selected}
        onSelect={onSelect}
        onChange={onChange}
        onRemove={onRemove}
        onDuplicate={onDuplicate}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </li>
  );
}

interface BlockEditorProps {
  block: SignatureBlock;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<SignatureBlock>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLButtonElement>;
  isDragging: boolean;
}

/** Whole header acts as a single click target — toggles open AND
 * highlights the corresponding block in the live preview. Drag handle
 * + delete button stop propagation so they don't double-fire. */
function BlockEditor({ block, selected, onSelect, onChange, onRemove, onDuplicate, dragHandleProps, isDragging }: BlockEditorProps) {
  const meta = ADD_BUTTONS.find((b) => b.type === block.type);
  const Icon = meta?.Icon ?? PenLine;
  const label = meta?.label ?? block.type;
  const summary = blockSummary(block);

  return (
    <div className={cn(
      'rounded-md border bg-evari-ink/30 transition-colors duration-300 ease-in-out',
      isDragging ? 'border-evari-gold/60' : selected ? 'border-evari-gold/70 bg-evari-ink/60' : 'border-evari-edge/30',
    )}>
      <header
        onClick={onSelect}
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none"
      >
        <button
          type="button"
          {...dragHandleProps}
          onClick={(e) => e.stopPropagation()}
          className="p-1 text-evari-dim hover:text-evari-text cursor-grab active:cursor-grabbing"
          aria-label="Drag"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <Icon className="h-3.5 w-3.5 text-evari-dim shrink-0" />
        <span className="text-sm text-evari-text truncate">{label}</span>
        {summary ? <span className="text-[10px] text-evari-dimmer truncate ml-2">{summary}</span> : null}
        <span className="ml-auto text-evari-dim">
          {selected ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="text-evari-dim hover:text-evari-text px-1"
          aria-label="Duplicate"
          title="Duplicate block"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-evari-dim hover:text-evari-danger px-1"
          aria-label="Remove"
          title="Delete block"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>
      {selected ? (
        <div className="border-t border-evari-edge/20 px-3 py-2 space-y-2">
          {block.type === 'text'    ? <TextFields    block={block} onChange={onChange} /> : null}
          {block.type === 'logo'    ? <LogoFields    block={block} onChange={onChange} /> : null}
          {block.type === 'spacer'  ? <SpacerFields  block={block} onChange={onChange} /> : null}
          {block.type === 'divider' ? <DividerFields block={block} onChange={onChange} /> : null}
          <PaddingFields block={block} onChange={onChange as (p: { paddingTopPx?: number; paddingBottomPx?: number }) => void} />
        </div>
      ) : null}
    </div>
  );
}

function blockSummary(b: SignatureBlock): string {
  switch (b.type) {
    case 'text':    return `${b.fontSizePx}px · ${b.alignment}`;
    case 'logo':    return `${b.maxWidthPx}px · ${b.alignment}`;
    case 'spacer':  return `${b.heightPx}px`;
    case 'divider': return `${b.thicknessPx}px line`;
    default:        return '';
  }
}

// ─── Reused field components ──────────────────────────────────────

function ColourField({ label, value, onChange, allowTransparent }: { label: string; value: string; onChange: (v: string) => void; allowTransparent?: boolean }) {
  const isTransparent = value === 'transparent';
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="color"
          value={isTransparent ? '#ffffff' : value}
          disabled={isTransparent}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 rounded-md border border-evari-edge/30 bg-evari-ink cursor-pointer disabled:opacity-50"
        />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text font-mono text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none w-full" />
      </div>
      {allowTransparent ? (
        <button type="button" onClick={() => onChange(isTransparent ? '#ffffff' : 'transparent')} className="mt-1 text-[10px] text-evari-dim hover:text-evari-text underline underline-offset-2">
          {isTransparent ? 'Set colour' : 'Use transparent'}
        </button>
      ) : null}
    </label>
  );
}

function AlignmentField({ block, onChange }: { block: { alignment: FooterAlignment }; onChange: (p: { alignment: FooterAlignment }) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Alignment</span>
      <div className="inline-flex rounded-md bg-evari-ink border border-evari-edge/30 p-0.5">
        {(['left', 'center', 'right'] as FooterAlignment[]).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => onChange({ alignment: a })}
            className={cn(
              'px-3 py-1 rounded text-xs font-medium capitalize transition-colors duration-300 ease-in-out',
              block.alignment === a ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text',
            )}
          >{a}</button>
        ))}
      </div>
    </label>
  );
}

function TextFields({ block, onChange }: { block: Extract<SignatureBlock, { type: 'text' }>; onChange: (p: Partial<Extract<SignatureBlock, { type: 'text' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Content (HTML allowed)</span>
        <textarea value={block.html} onChange={(e) => onChange({ html: e.target.value })} className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text font-mono text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none min-h-[80px]" />
      </label>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Font</span>
          <select value={block.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })} className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none">
            {FONT_OPTIONS.map((f) => <option key={f || 'inherit'} value={f}>{f || '— inherit brand body —'}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Size (px)</span>
          <input type="number" min={8} max={64} value={block.fontSizePx} onChange={(e) => onChange({ fontSizePx: Math.max(8, Math.min(64, Number(e.target.value) || 13)) })} className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text font-mono text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Line height</span>
          <input type="number" step={0.1} min={1} max={3} value={block.lineHeight} onChange={(e) => onChange({ lineHeight: Math.max(1, Math.min(3, Number(e.target.value) || 1.4)) })} className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text font-mono text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
        </label>
        <ColourField label="Color" value={block.color} onChange={(v) => onChange({ color: v })} />
      </div>
      <AlignmentField block={block} onChange={onChange as never} />
    </div>
  );
}

function LogoFields({ block, onChange }: { block: Extract<SignatureBlock, { type: 'logo' }>; onChange: (p: Partial<Extract<SignatureBlock, { type: 'logo' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Max width (px)</span>
        <input type="range" min={40} max={400} value={block.maxWidthPx} onChange={(e) => onChange({ maxWidthPx: Number(e.target.value) })} className="w-full accent-evari-gold" />
        <span className="text-[10px] text-evari-dimmer font-mono tabular-nums">{block.maxWidthPx}px (height auto)</span>
      </label>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Override URL (defaults to brand light logo)</span>
        <input type="url" value={block.srcOverride ?? ''} onChange={(e) => onChange({ srcOverride: e.target.value || null })} placeholder="(use brand kit logo)" className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text font-mono text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
      </label>
      <AlignmentField block={block} onChange={onChange as never} />
    </div>
  );
}

function SpacerFields({ block, onChange }: { block: Extract<SignatureBlock, { type: 'spacer' }>; onChange: (p: Partial<Extract<SignatureBlock, { type: 'spacer' }>>) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Height (px)</span>
      <input type="range" min={4} max={120} value={block.heightPx} onChange={(e) => onChange({ heightPx: Number(e.target.value) })} className="w-full accent-evari-gold" />
      <span className="text-[10px] text-evari-dimmer font-mono tabular-nums">{block.heightPx}px</span>
    </label>
  );
}

function DividerFields({ block, onChange }: { block: Extract<SignatureBlock, { type: 'divider' }>; onChange: (p: Partial<Extract<SignatureBlock, { type: 'divider' }>>) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <ColourField label="Colour" value={block.color} onChange={(v) => onChange({ color: v })} />
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Thickness (px)</span>
        <input type="number" min={1} max={8} value={block.thicknessPx} onChange={(e) => onChange({ thicknessPx: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })} className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text font-mono text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
      </label>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Margin Y (px)</span>
        <input type="number" min={0} max={64} value={block.marginYPx} onChange={(e) => onChange({ marginYPx: Math.max(0, Math.min(64, Number(e.target.value) || 0)) })} className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text font-mono text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
      </label>
    </div>
  );
}

/**
 * Per-block padding-above + padding-below sliders, identical contract
 * to the FooterDesigner version. Wraps every block at render time so
 * the user can space items without dropping in spacer blocks.
 */
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
