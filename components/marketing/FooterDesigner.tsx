'use client';

import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Image as ImageIcon,
  Link2,
  Mail,
  MapPin,
  Minus,
  PenLine,
  Trash2,
  Type,
  PencilLine,
  Move,
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
import { renderFooter, normaliseDesign } from '@/lib/marketing/footer';
import {
  DEFAULT_FOOTER_DESIGN,
  type FooterAlignment,
  type FooterBlock,
  type FooterDesign,
  type FooterSocial,
  type MarketingBrand,
} from '@/lib/marketing/types';

interface Props {
  initialBrand: MarketingBrand;
  value: FooterDesign | null;
  onChange: (next: FooterDesign) => void;
}

const SOCIAL_FIELDS: Array<{ key: keyof FooterSocial; label: string; placeholder: string }> = [
  { key: 'instagram', label: 'Instagram',   placeholder: 'https://instagram.com/evari' },
  { key: 'twitter',   label: 'X / Twitter', placeholder: 'https://x.com/evari' },
  { key: 'linkedin',  label: 'LinkedIn',    placeholder: 'https://linkedin.com/company/evari' },
  { key: 'facebook',  label: 'Facebook',    placeholder: 'https://facebook.com/evari' },
  { key: 'tiktok',    label: 'TikTok',      placeholder: 'https://tiktok.com/@evari' },
  { key: 'youtube',   label: 'YouTube',     placeholder: 'https://youtube.com/@evari' },
  { key: 'website',   label: 'Website',     placeholder: 'https://evari.cc' },
];

function nid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const ADD_BUTTONS: Array<{ type: FooterBlock['type']; label: string; Icon: typeof Type; make: () => FooterBlock }> = [
  { type: 'text',        label: 'Text',         Icon: Type,        make: () => ({ id: nid(), type: 'text',        alignment: 'left',   html: 'Type your copy here. <strong>Bold</strong>, <em>italic</em>, links allowed.', fontFamily: '', fontSizePx: 13, color: '#1a1a1a', lineHeight: 1.5 }) },
  { type: 'logo',        label: 'Branded logo', Icon: ImageIcon,   make: () => ({ id: nid(), type: 'logo',        alignment: 'center', maxWidthPx: 140 }) },
  { type: 'spacer',      label: 'Spacer',       Icon: Move,        make: () => ({ id: nid(), type: 'spacer',      heightPx: 24 }) },
  { type: 'divider',     label: 'Line',         Icon: Minus,       make: () => ({ id: nid(), type: 'divider',     color: '#e5e5e5', thicknessPx: 1, marginYPx: 16 }) },
  { type: 'signature',   label: 'Signature',    Icon: PencilLine,  make: () => ({ id: nid(), type: 'signature',   alignment: 'left' }) },
  { type: 'address',     label: 'Address',      Icon: MapPin,      make: () => ({ id: nid(), type: 'address',     alignment: 'center', color: '#666666' }) },
  { type: 'social',      label: 'Social',       Icon: Link2,       make: () => ({ id: nid(), type: 'social',      alignment: 'center', color: '#1a1a1a', social: {} }) },
  { type: 'unsubscribe', label: 'Unsubscribe',  Icon: Mail,        make: () => ({ id: nid(), type: 'unsubscribe', alignment: 'center', label: 'Unsubscribe from these emails', color: '#666666' }) },
];

const FONT_OPTIONS = [
  '', // = inherit / brand body
  'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana',
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
];

export function FooterDesigner({ initialBrand, value, onChange }: Props) {
  const design = normaliseDesign(value);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function updateDesign(patch: Partial<FooterDesign>) {
    onChange({ ...design, ...patch });
  }
  function updateBlock(id: string, patch: Partial<FooterBlock>) {
    const next = design.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as FooterBlock) : b));
    onChange({ ...design, blocks: next });
  }
  function removeBlock(id: string) {
    onChange({ ...design, blocks: design.blocks.filter((b) => b.id !== id) });
  }
  function addBlock(maker: () => FooterBlock) {
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

  const previewBrand: MarketingBrand = { ...initialBrand, footerDesign: design };
  const previewHtml = useMemo(
    () =>
      renderFooter({
        brand: previewBrand,
        unsubscribeUrl: 'https://dashboard-raceborne.vercel.app/unsubscribe?u=preview',
      }),
    [previewBrand],
  );

  const inputCls =
    'px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none transition-colors duration-500 ease-in-out w-full';

  return (
    <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 xl:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-evari-text">Branded footer</h2>
        <span className="text-[10px] text-evari-dimmer">Drag blocks to reorder · same renderer as the mailbox preview</span>
      </div>

      {/* Add-block toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-1">
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

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(320px,40%)] gap-3">

        {/* Block list */}
        <div className="space-y-2">
          {/* Wrapper styling controls */}
          <div className="rounded-md bg-evari-ink/40 border border-evari-edge/20 p-3">
            <h3 className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2">Wrapper</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <ColourField label="Background" value={design.background} onChange={(v) => updateDesign({ background: v })} />
              <ColourField label="Border" value={design.borderColor} onChange={(v) => updateDesign({ borderColor: v })} />
              <label className="block">
                <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Padding (px)</span>
                <input type="number" min={0} max={96} value={design.paddingPx} onChange={(e) => updateDesign({ paddingPx: Math.max(0, Math.min(96, Number(e.target.value) || 0)) })} className={cn(inputCls, 'font-mono text-[11px]')} />
              </label>
              <label className="flex items-center gap-2 cursor-pointer mt-5">
                <input type="checkbox" checked={design.borderTop} onChange={(e) => updateDesign({ borderTop: e.target.checked })} className="h-4 w-4 rounded accent-evari-gold" />
                <span className="text-sm text-evari-text">Top border</span>
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
                <ul className="space-y-1.5">
                  {design.blocks.map((b) => (
                    <SortableBlockRow
                      key={b.id}
                      block={b}
                      selected={selectedId === b.id}
                      onSelect={() => setSelectedId(selectedId === b.id ? null : b.id)}
                      onChange={(p) => updateBlock(b.id, p)}
                      onRemove={() => removeBlock(b.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Live preview */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Live preview</div>
          <div className="rounded-md border border-evari-edge/30 overflow-hidden bg-zinc-50">
            <style dangerouslySetInnerHTML={{ __html: selectedId ? `[data-footer-preview] [data-block-id="${selectedId}"]{outline:2px solid #d4a649;outline-offset:2px;border-radius:3px;background:rgba(212,166,73,0.08);}` : '' }} />
            <div
              data-footer-preview
              className="text-zinc-900 max-h-[640px] overflow-auto"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
          <p className="text-[10px] text-evari-dimmer">
            Same function the sender uses at send time. Email-safe nested tables, inline CSS only.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Sortable wrapper around a block row ─────────────────────────

function SortableBlockRow({
  block,
  selected,
  onSelect,
  onChange,
  onRemove,
}: {
  block: FooterBlock;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<FooterBlock>) => void;
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

// ─── Per-block editor card ────────────────────────────────────────

interface BlockEditorProps {
  block: FooterBlock;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<FooterBlock>) => void;
  onRemove: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLButtonElement>;
  isDragging: boolean;
}

/** Whole header acts as a single click target — toggles open AND
 * highlights the corresponding block in the live preview. Drag handle
 * + delete button stop propagation so they don't double-fire. */
function BlockEditor({ block, selected, onSelect, onChange, onRemove, dragHandleProps, isDragging }: BlockEditorProps) {
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
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-evari-dim hover:text-evari-danger px-1"
          aria-label="Remove"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>
      {selected ? (
        <div className="border-t border-evari-edge/20 px-3 py-2">
          {block.type === 'text'        ? <TextFields        block={block} onChange={onChange} /> : null}
          {block.type === 'logo'        ? <LogoFields        block={block} onChange={onChange} /> : null}
          {block.type === 'spacer'      ? <SpacerFields      block={block} onChange={onChange} /> : null}
          {block.type === 'divider'     ? <DividerFields     block={block} onChange={onChange} /> : null}
          {block.type === 'signature'   ? <AlignmentFieldOnly block={block} onChange={onChange} /> : null}
          {block.type === 'address'     ? <AddressFields     block={block} onChange={onChange} /> : null}
          {block.type === 'social'      ? <SocialFields      block={block} onChange={onChange} /> : null}
          {block.type === 'unsubscribe' ? <UnsubscribeFields block={block} onChange={onChange} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function blockSummary(b: FooterBlock): string {
  switch (b.type) {
    case 'text':        return `${b.fontSizePx}px · ${b.alignment}`;
    case 'logo':        return `${b.maxWidthPx}px · ${b.alignment}`;
    case 'spacer':      return `${b.heightPx}px`;
    case 'divider':     return `${b.thicknessPx}px line`;
    case 'signature':
    case 'address':
    case 'unsubscribe': return b.alignment;
    case 'social':      return `${Object.values(b.social).filter(Boolean).length} link(s) · ${b.alignment}`;
    default:            return '';
  }
}

// ─── Field components ─────────────────────────────────────────────

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">{label}</span>
      <div className="flex items-center gap-1">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-9 rounded-md border border-evari-edge/30 bg-evari-ink cursor-pointer" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text font-mono text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none w-full" />
      </div>
    </label>
  );
}

function AlignmentField<T extends FooterBlock & { alignment: FooterAlignment }>({ block, onChange }: { block: T; onChange: (p: Partial<T>) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Alignment</span>
      <div className="inline-flex rounded-md bg-evari-ink border border-evari-edge/30 p-0.5">
        {(['left', 'center', 'right'] as FooterAlignment[]).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => onChange({ alignment: a } as Partial<T>)}
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

function AlignmentFieldOnly({ block, onChange }: { block: Extract<FooterBlock, { type: 'signature' }>; onChange: (p: Partial<Extract<FooterBlock, { type: 'signature' }>>) => void }) {
  return <AlignmentField block={block} onChange={onChange as never} />;
}

function TextFields({ block, onChange }: { block: Extract<FooterBlock, { type: 'text' }>; onChange: (p: Partial<Extract<FooterBlock, { type: 'text' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Content (HTML allowed)</span>
        <textarea value={block.html} onChange={(e) => onChange({ html: e.target.value })} className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text font-mono text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none min-h-[100px]" />
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
          <input type="number" step={0.1} min={1} max={3} value={block.lineHeight} onChange={(e) => onChange({ lineHeight: Math.max(1, Math.min(3, Number(e.target.value) || 1.5)) })} className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text font-mono text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
        </label>
        <ColourField label="Color" value={block.color} onChange={(v) => onChange({ color: v })} />
      </div>
      <AlignmentField block={block} onChange={onChange as never} />
    </div>
  );
}

function LogoFields({ block, onChange }: { block: Extract<FooterBlock, { type: 'logo' }>; onChange: (p: Partial<Extract<FooterBlock, { type: 'logo' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Max width (px)</span>
        <input type="range" min={40} max={400} value={block.maxWidthPx} onChange={(e) => onChange({ maxWidthPx: Number(e.target.value) })} className="w-full accent-evari-gold" />
        <span className="text-[10px] text-evari-dimmer font-mono tabular-nums">{block.maxWidthPx}px (height auto)</span>
      </label>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Override URL (optional — defaults to brand light logo)</span>
        <input type="url" value={block.srcOverride ?? ''} onChange={(e) => onChange({ srcOverride: e.target.value || null })} placeholder="(use brand kit logo)" className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text font-mono text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
      </label>
      <AlignmentField block={block} onChange={onChange as never} />
    </div>
  );
}

function SpacerFields({ block, onChange }: { block: Extract<FooterBlock, { type: 'spacer' }>; onChange: (p: Partial<Extract<FooterBlock, { type: 'spacer' }>>) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Height (px)</span>
      <input type="range" min={4} max={120} value={block.heightPx} onChange={(e) => onChange({ heightPx: Number(e.target.value) })} className="w-full accent-evari-gold" />
      <span className="text-[10px] text-evari-dimmer font-mono tabular-nums">{block.heightPx}px</span>
    </label>
  );
}

function DividerFields({ block, onChange }: { block: Extract<FooterBlock, { type: 'divider' }>; onChange: (p: Partial<Extract<FooterBlock, { type: 'divider' }>>) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <ColourField label="Colour" value={block.color} onChange={(v) => onChange({ color: v })} />
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Thickness (px)</span>
        <input type="number" min={1} max={8} value={block.thicknessPx} onChange={(e) => onChange({ thicknessPx: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })} className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text font-mono text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
      </label>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Margin Y (px)</span>
        <input type="number" min={0} max={64} value={block.marginYPx} onChange={(e) => onChange({ marginYPx: Math.max(0, Math.min(64, Number(e.target.value) || 16)) })} className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text font-mono text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
      </label>
    </div>
  );
}

function AddressFields({ block, onChange }: { block: Extract<FooterBlock, { type: 'address' }>; onChange: (p: Partial<Extract<FooterBlock, { type: 'address' }>>) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-evari-dimmer">Pulls company name + postal address from the brand kit Identity panel above.</p>
      <div className="grid grid-cols-2 gap-2">
        <ColourField label="Colour" value={block.color} onChange={(v) => onChange({ color: v })} />
        <AlignmentField block={block} onChange={onChange as never} />
      </div>
    </div>
  );
}

function SocialFields({ block, onChange }: { block: Extract<FooterBlock, { type: 'social' }>; onChange: (p: Partial<Extract<FooterBlock, { type: 'social' }>>) => void }) {
  function setSocial(k: keyof FooterSocial, v: string) {
    onChange({ social: { ...block.social, [k]: v } });
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <ColourField label="Colour" value={block.color} onChange={(v) => onChange({ color: v })} />
        <AlignmentField block={block} onChange={onChange as never} />
      </div>
      <div className="space-y-1.5 mt-2">
        {SOCIAL_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="block text-[10px] text-evari-dimmer mb-0.5">{f.label}</span>
            <input type="url" value={block.social[f.key] ?? ''} onChange={(e) => setSocial(f.key, e.target.value)} placeholder={f.placeholder} className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text font-mono text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
          </label>
        ))}
      </div>
    </div>
  );
}

function UnsubscribeFields({ block, onChange }: { block: Extract<FooterBlock, { type: 'unsubscribe' }>; onChange: (p: Partial<Extract<FooterBlock, { type: 'unsubscribe' }>>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Link label</span>
        <input type="text" value={block.label} onChange={(e) => onChange({ label: e.target.value })} className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <ColourField label="Colour" value={block.color} onChange={(v) => onChange({ color: v })} />
        <AlignmentField block={block} onChange={onChange as never} />
      </div>
      <p className="text-[10px] text-evari-dimmer italic">Required by law for marketing email — keep at least one Unsubscribe block in the footer.</p>
    </div>
  );
}

