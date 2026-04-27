'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  Box,
  Calendar,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Copy,
  Code2,
  Columns3,
  FolderOpen,
  GripVertical,
  Heading1,
  Image as ImageIcon,
  Layers,
  Layout,
  Link2,
  Lock,
  Loader2,
  Maximize2,
  Megaphone,
  Minus,
  MousePointerClick,
  Move,
  PenLine,
  Pin,
  PlaySquare,
  Quote,
  RefreshCw,
  Share2,
  Smartphone,
  Sparkles,
  Square,
  SquareSplitHorizontal,
  Star,
  Table as TableIcon,
  Tag,
  Trash2,
  Type,
  Undo2,
  Unlock,
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
  type TypographyPreset,
  type ButtonPreset,
} from '@/lib/marketing/types';
import { renderEmailDesign, renderEmailBlockHtml, normaliseEmailDesign, bgFillCss, effectiveBlock } from '@/lib/marketing/email-design';

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
  /** Manual brand kit refresh — called from the auto-footer affordance
   *  so users don't have to switch tabs to see footer / logo edits. */
  onRefreshBrand?: () => void | Promise<void>;
  refreshingBrand?: boolean;
}

function nid(): string { return Math.random().toString(36).slice(2, 10); }

interface BlockTile {
  type: EmailBlock['type'] | 'columns' | 'announcementBar'; // announcementBar = section variant
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
  { group: 'blocks', type: 'text',    label: 'Paragraph', Icon: PenLine,    make: () => ({ id: nid(), type: 'text', html: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.', alignment: 'left', fontSizePx: 14, lineHeight: 1.6, color: '#333333', fontFamily: '', paddingBottomPx: 16 }) },
  { group: 'blocks', type: 'image',   label: 'Image',   Icon: ImageIcon,   make: () => ({ id: nid(), type: 'image', src: '', alt: '', maxWidthPx: 600, alignment: 'center', paddingBottomPx: 16 }) },
  { group: 'blocks', type: 'split',   label: 'Split',   Icon: SquareSplitHorizontal, make: () => ({ id: nid(), type: 'split', imageSrc: '', imageAlt: '', imagePosition: 'left', html: 'Side-by-side text.', fontSizePx: 16, lineHeight: 1.55, color: '#333333', paddingBottomPx: 16 }) },
  // Row 2
  { group: 'blocks', type: 'button',  label: 'Button',  Icon: MousePointerClick,  make: () => ({ id: nid(), type: 'button', label: 'Click me', url: 'https://evari.cc', alignment: 'center', backgroundColor: '#1a1a1a', textColor: '#ffffff', borderRadiusPx: 4, paddingXPx: 24, paddingYPx: 12, paddingBottomPx: 24 }) },
  { group: 'blocks', type: 'headerBar', label: 'Header bar', Icon: Heading1, make: () => ({ id: nid(), type: 'headerBar', logoUrl: '', tagline: '', linkUrl: '', backgroundColor: '#ffffff', textColor: '#666666', paddingBottomPx: 8 }) },
  { group: 'blocks', type: 'brandLogo', label: 'Brand logo', Icon: ImageIcon, badge: 'New', make: () => ({ id: nid(), type: 'brandLogo', variant: 'light', srcOverride: null, widthPx: 160, opacity: 1, alignment: 'center', linkUrl: '', paddingBottomPx: 16 }) },
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
  // Announcement bar is a section under the hood — pinned to the top,
  // thin defaults, with one centred uppercase text child by default.
  { group: 'layout', type: 'announcementBar', label: 'Announcement bar', Icon: Megaphone, badge: 'New', make: () => ({
      id: nid(),
      type: 'section',
      kind: 'announcementBar',
      pinTo: 'top',
      blocks: [{
        id: nid(),
        type: 'text',
        html: 'Free shipping on orders over £50',
        alignment: 'center',
        fontSizePx: 12,
        lineHeight: 1.3,
        color: '#ffffff',
        fontFamily: '',
        fontWeight: 600,
        letterSpacingEm: 0.05,
        textTransform: 'uppercase',
        paddingBottomPx: 0,
      }],
      backgroundColor: '#1a1a1a',
      backgroundImage: '',
      backgroundSize: 'fill',
      backgroundPosition: 'center',
      paddingPx: 8,
      borderRadiusPx: 0,
      contentColor: '#ffffff',
      minHeightPx: 36,
      contentAlignY: 'middle',
      paddingBottomPx: 0,
    }) },
  { group: 'layout', type: 'columns', label: 'Columns', Icon: Columns3, comingSoon: true },
  { group: 'layout', type: 'section', label: 'Section', Icon: Square, badge: 'New', make: () => ({ id: nid(), type: 'section', blocks: [], backgroundColor: '#1a1a1a', backgroundImage: '', backgroundSize: 'fill', backgroundPosition: 'center', paddingPx: 0, borderRadiusPx: 0, contentColor: '#ffffff', minHeightPx: 320, paddingBottomPx: 0 }) },
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

/**
 * Always-visible brand-kit summary in the LEFT palette: logo thumbnail,
 * a strip of brand colour swatches, and the heading/body font names.
 * Lets the user see what the design is supposed to inherit at a glance.
 */
function BrandKitPreview({ brand }: { brand: MarketingBrand }) {
  const logo = brand.logoLightUrl || brand.logoDarkUrl;
  const swatches = Array.from(new Set([
    brand.colors.primary,
    brand.colors.accent,
    brand.colors.buttonBg,
    brand.colors.text,
    brand.colors.link,
    brand.colors.bg,
    brand.colors.muted,
  ].filter(Boolean)));
  return (
    <div className="rounded-md bg-evari-ink/40 border border-evari-edge/20 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-semibold text-evari-text uppercase tracking-[0.1em]">Brand kit</h3>
        <a href="/brand" className="text-[10px] text-evari-gold hover:underline">Edit</a>
      </div>
      {/* Brand image thumbnail */}
      <div className="rounded-md overflow-hidden mb-2 bg-zinc-900">
        {logo ? (
          <div className="w-full aspect-[5/3] flex items-center justify-center" style={{ background: brand.colors.bg || '#0a0a0a' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={brand.companyName ?? 'Brand logo'} className="max-h-[80%] max-w-[80%] object-contain" />
          </div>
        ) : (
          <div className="w-full aspect-[5/3] flex items-center justify-center text-[10px] text-evari-dim">
            No brand logo set
          </div>
        )}
      </div>
      {/* Colour swatches */}
      {swatches.length > 0 ? (
        <div className="flex flex-wrap gap-1 mb-2" aria-label="Brand colours">
          {swatches.map((c) => (
            <span
              key={c}
              className="h-5 w-5 rounded-sm border border-black/30"
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
      ) : null}
      {/* Fonts */}
      <div className="space-y-1">
        {brand.fonts?.heading ? (
          <div
            className="text-[13px] text-evari-text leading-tight truncate"
            style={{ fontFamily: `'${brand.fonts.heading}', sans-serif`, fontWeight: 700 }}
            title={`Heading: ${brand.fonts.heading}`}
          >
            {brand.fonts.heading}
          </div>
        ) : null}
        {brand.fonts?.body ? (
          <div
            className="text-[12px] text-evari-dim leading-tight truncate"
            style={{ fontFamily: `'${brand.fonts.body}', sans-serif` }}
            title={`Body: ${brand.fonts.body}`}
          >
            {brand.fonts.body}
          </div>
        ) : null}
      </div>
    </div>
  );
}


/**
 * Layers panel — recursive tree view of every section + child block in
 * the design. Each row shows the block's icon, type label, and a content
 * snippet. Click a row to select that block (opens the property panel
 * in the right rail). Sections always expanded so background-image
 * sections show their layered children inline.
 */

/**
 * Presets tab — every saved typography + button preset across the brand
 * kit, grouped by type. Click a tile to insert a matching block at the
 * end of the canvas with that preset applied. Lets the user reach for
 * 'Hero headline' or 'Primary CTA' without rebuilding from sliders.
 */
function PresetsPanel({ brand, onAddBlock }: { brand: MarketingBrand; onAddBlock: (b: EmailBlock) => void }) {
  const typo = brand.fonts.presets ?? [];
  const buttons = brand.fonts.buttonPresets ?? [];

  function addFromTypoPreset(p: TypographyPreset, target: 'heading' | 'text') {
    if (target === 'heading') {
      const size = p.fontSizePx ?? 28;
      const level: 1 | 2 | 3 = size >= 24 ? 1 : size >= 18 ? 2 : 3;
      const block: EmailBlock = {
        id: nid(),
        type: 'heading',
        level,
        html: p.name,
        alignment: 'left',
        color: p.color,
        fontFamily: p.fontFamily ?? '',
        fontSizePx: p.fontSizePx,
        fontWeight: p.fontWeight,
        letterSpacingEm: p.letterSpacingEm,
        textTransform: p.textTransform ?? 'none',
        paddingBottomPx: 12,
      };
      onAddBlock(block);
    } else {
      const block: EmailBlock = {
        id: nid(),
        type: 'text',
        html: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        alignment: 'left',
        fontSizePx: p.fontSizePx ?? 16,
        lineHeight: p.lineHeight ?? 1.55,
        color: p.color,
        fontFamily: p.fontFamily ?? '',
        fontWeight: p.fontWeight,
        letterSpacingEm: p.letterSpacingEm,
        textTransform: p.textTransform ?? 'none',
        paddingBottomPx: 16,
      };
      onAddBlock(block);
    }
  }

  function addFromButtonPreset(p: ButtonPreset) {
    const block: EmailBlock = {
      id: nid(),
      type: 'button',
      label: p.label || 'Click me',
      url: 'https://evari.cc',
      alignment: 'center',
      backgroundColor: p.backgroundColor,
      textColor: p.textColor,
      borderRadiusPx: p.borderRadiusPx,
      paddingXPx: p.paddingXPx,
      paddingYPx: p.paddingYPx,
      fontFamily: p.fontFamily ?? '',
      fontSizePx: p.fontSizePx,
      fontWeight: p.fontWeight,
      letterSpacingEm: p.letterSpacingEm,
      textTransform: p.textTransform,
      widthMode: p.widthMode,
      widthPx: p.widthPx,
      paddingBottomPx: 24,
    };
    onAddBlock(block);
  }

  if (typo.length === 0 && buttons.length === 0) {
    return (
      <div className="text-[11px] text-evari-dim px-2 py-6 text-center leading-relaxed">
        No presets saved yet. Style a heading, body or button block, then click <span className="text-evari-gold">Save as style</span> in its properties to reuse it here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {typo.length > 0 ? (
        <section>
          <h3 className="text-[10px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-1.5">Typography</h3>
          <ul className="space-y-1">
            {typo.map((p) => (
              <li key={p.id} className="rounded-md border border-evari-edge/30 bg-evari-ink/40 hover:border-evari-gold/50 transition-colors">
                <div className="px-2 pt-1.5 pb-0.5">
                  <span
                    className="block text-evari-text leading-tight truncate"
                    style={{
                      fontFamily: p.fontFamily ? `'${p.fontFamily}', sans-serif` : undefined,
                      fontSize: `${Math.min(p.fontSizePx, 22)}px`,
                      fontWeight: p.fontWeight,
                      letterSpacing: `${p.letterSpacingEm}em`,
                      color: p.color,
                      textTransform: p.textTransform && p.textTransform !== 'none' ? p.textTransform : undefined,
                    }}
                  >
                    {p.name}
                  </span>
                  <span className="block text-[9px] text-evari-dimmer font-mono tabular-nums">
                    {p.fontSizePx}px · {p.fontWeight} · {p.letterSpacingEm}em
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 px-1.5 pb-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => addFromTypoPreset(p, 'heading')}
                    className="text-[10px] py-1 rounded bg-evari-edge/30 text-evari-text hover:bg-evari-gold/20 hover:text-evari-gold transition-colors"
                    title="Add as a heading block"
                  >
                    + Heading
                  </button>
                  <button
                    type="button"
                    onClick={() => addFromTypoPreset(p, 'text')}
                    className="text-[10px] py-1 rounded bg-evari-edge/30 text-evari-text hover:bg-evari-gold/20 hover:text-evari-gold transition-colors"
                    title="Add as a text block"
                  >
                    + Text
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {buttons.length > 0 ? (
        <section>
          <h3 className="text-[10px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-1.5">Buttons</h3>
          <ul className="space-y-1">
            {buttons.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => addFromButtonPreset(p)}
                  className="w-full flex items-center gap-2 rounded-md border border-evari-edge/30 bg-evari-ink/40 hover:border-evari-gold/50 hover:bg-evari-ink/70 transition-colors px-2 py-1.5"
                  title={`Insert a button using "${p.name}"`}
                >
                  <span
                    className="inline-block px-2 py-1 rounded text-[10px] font-medium shrink-0"
                    style={{
                      background: p.backgroundColor,
                      color: p.textColor,
                      borderRadius: `${p.borderRadiusPx}px`,
                      fontFamily: p.fontFamily ? `'${p.fontFamily}', sans-serif` : undefined,
                      fontWeight: p.fontWeight ?? 700,
                      letterSpacing: p.letterSpacingEm != null ? `${p.letterSpacingEm}em` : undefined,
                      textTransform: p.textTransform && p.textTransform !== 'none' ? p.textTransform : undefined,
                    }}
                  >
                    {p.label || 'Button'}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-[11px] text-evari-text leading-tight truncate">{p.name}</span>
                    <span className="block text-[9px] text-evari-dimmer font-mono tabular-nums">{p.paddingYPx}×{p.paddingXPx} · r{p.borderRadiusPx}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function LayersTree({ blocks, selectedId, onSelect, onRemove }: {
  blocks: EmailBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (blocks.length === 0) {
    return (
      <div className="text-[11px] text-evari-dim px-2 py-6 text-center leading-relaxed">
        No blocks yet. Switch to the Blocks tab and drag a tile into the canvas.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {blocks.map((b) => (
        <LayerRow key={b.id} block={b} depth={0} selectedId={selectedId} onSelect={onSelect} onRemove={onRemove} />
      ))}
    </ul>
  );
}

function snippetForBlock(b: EmailBlock): string {
  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, '').trim();
  switch (b.type) {
    case 'heading':         return stripHtml(b.html) || `H${b.level}`;
    case 'text':            return stripHtml(b.html) || 'Text';
    case 'image':           return b.alt || (b.src ? new URL(b.src, 'https://evari.cc').pathname.split('/').pop() ?? 'Image' : 'Image');
    case 'brandLogo':       return `${b.variant} logo · ${b.widthPx}px`;
    case 'button':          return b.label || 'Button';
    case 'divider':         return 'Divider';
    case 'spacer':          return `Spacer · ${b.heightPx}px`;
    case 'html':            return 'Custom HTML';
    case 'split':           return stripHtml(b.html) || 'Split layout';
    case 'headerBar':       return b.tagline || 'Header bar';
    case 'card':            return stripHtml(b.html) || 'Drop-shadow card';
    case 'social':          return `${b.items.length} social link${b.items.length === 1 ? '' : 's'}`;
    case 'coupon':          return b.code || 'Coupon';
    case 'table':           return `${b.rows.length} row${b.rows.length === 1 ? '' : 's'}`;
    case 'review':          return b.author || 'Review';
    case 'video':           return b.alt || 'Video';
    case 'product':         return b.title || 'Product';
    case 'section': {
      const isAnnounce = b.kind === 'announcementBar';
      const bg = b.backgroundImage ? 'with bg image' : '';
      const label = isAnnounce ? 'Announcement bar' : 'Section';
      return [label, bg].filter(Boolean).join(' · ');
    }
  }
}

function LayerRow({ block, depth, selectedId, onSelect, onRemove }: {
  block: EmailBlock;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const tile = ADD_BUTTONS.find((t) => t.type === block.type) ?? (block.type === 'heading' ? HEADING_TILE : null);
  const Icon = tile?.Icon ?? Square;
  const selected = selectedId === block.id;
  const label = tile?.label ?? block.type;
  const snippet = snippetForBlock(block);
  const isSection = block.type === 'section';
  const isPinned = isSection && (block as Extract<EmailBlock, { type: 'section' }>).pinTo === 'top';
  // Each nested level lifts the surface ~3% brighter (white tint over the
  // panel) so depth reads visually without depending on indent alone.
  // Sections render as a filled rounded rectangle with their children
  // sitting INSIDE the rectangle (their own brighter cards).
  const tint = Math.min(0.06 + depth * 0.03, 0.30);
  const cardBg = selected ? 'rgba(212,166,73,0.18)' : `rgba(255,255,255,${tint.toFixed(3)})`;
  const children = isSection ? (block as Extract<EmailBlock, { type: 'section' }>).blocks : [];
  return (
    <li>
      <div
        className={cn(
          'group rounded-lg cursor-pointer transition-shadow',
          selected ? 'ring-2 ring-evari-gold' : 'hover:ring-1 hover:ring-white/15',
        )}
        style={{ background: cardBg }}
        onClick={(e) => { e.stopPropagation(); onSelect(block.id); }}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Icon className={cn('h-4 w-4 shrink-0', selected ? 'text-evari-gold' : 'text-evari-dim')} />
          <div className="min-w-0 flex-1">
            <div className={cn('text-[12px] font-semibold leading-tight truncate flex items-center gap-1', selected ? 'text-evari-gold' : 'text-evari-text')}>
              {label}
              {isPinned ? <Pin className="h-2.5 w-2.5 text-evari-gold/70" aria-label="Pinned to top" /> : null}
            </div>
            <div className={cn('text-[10px] leading-tight truncate mt-0.5', selected ? 'text-evari-gold/70' : 'text-evari-dim')}>{snippet}</div>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(block.id); }}
            className="opacity-0 group-hover:opacity-100 p-1 text-evari-dim hover:text-evari-danger transition-opacity"
            title="Delete block"
            aria-label={`Delete ${label}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {isSection && children && children.length > 0 ? (
          <ul className="space-y-1.5 px-2 pb-2">
            {children.map((c) => (
              <LayerRow key={c.id} block={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} onRemove={onRemove} />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function BlockTileGroup({ title, tiles, brand }: { title: string; tiles: BlockTile[]; brand: MarketingBrand; onAdd?: (make: () => EmailBlock) => void }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-1.5">{title}</h3>
      <ul className="grid grid-cols-2 gap-1.5">
        {tiles.map((t, i) => (
          <li key={`${t.group}-${t.type}-${t.label}`}>
            <PaletteTile tile={t} brand={brand} draggableId={`palette:${t.group}:${i}`} />
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
function PaletteTile({ tile, brand, draggableId }: { tile: BlockTile; brand: MarketingBrand; draggableId: string }) {
  const disabled = !!tile.comingSoon;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: draggableId,
    disabled,
    data: { paletteTile: tile },
  });
  const Icon = tile.Icon;
  // Brand-logo tile shows the actual logo in the tile so users recognise
  // it instantly in the palette. Fallback to the icon if no logo is set.
  const isBrandLogo = tile.type === 'brandLogo';
  const brandLogoSrc = isBrandLogo ? (brand.logoLightUrl || brand.logoDarkUrl || '') : '';
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      disabled={disabled}
      title={disabled ? 'Coming soon' : `Drag onto the canvas to add ${tile.label}`}
      className={cn(
        'relative w-full aspect-[5/3] rounded-md border bg-evari-ink/40 flex flex-col items-center justify-center gap-1 transition-colors duration-200 cursor-grab active:cursor-grabbing overflow-hidden',
        disabled
          ? 'border-evari-edge/20 text-evari-dimmer cursor-not-allowed opacity-60'
          : 'border-evari-edge/30 text-evari-dim hover:text-evari-text hover:border-evari-gold/60 hover:bg-evari-ink/70',
        isDragging && 'opacity-30',
      )}
    >
      {tile.badge ? (
        <span className={cn('absolute top-0.5 right-0.5 z-10 text-[7px] uppercase tracking-[0.05em] font-bold px-1 py-px rounded', tile.badge === 'New' ? 'bg-blue-500/30 text-blue-200' : 'bg-evari-edge/30 text-evari-dimmer')}>{tile.badge}</span>
      ) : null}
      {isBrandLogo && brandLogoSrc ? (
        <>
          <span className="absolute inset-0 flex items-center justify-center px-2 py-3" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brandLogoSrc} alt="" className="max-h-[60%] max-w-[80%] object-contain" />
          </span>
          <span className="relative mt-auto text-[10px] leading-tight text-center bg-evari-ink/80 px-1.5 py-0.5 rounded">{tile.label}</span>
        </>
      ) : (
        <>
          <Icon className="h-5 w-5" />
          <span className="text-[11px] leading-tight text-center px-1">{tile.label}</span>
        </>
      )}
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

export function EmailDesigner({ initialBrand, value, onChange, onAIDraft, previewDevice = "desktop", onRefreshBrand, refreshingBrand }: Props) {
  const design = normaliseEmailDesign(value) ?? DEFAULT_EMAIL_DESIGN;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOverlay, setDragOverlay] = useState<string | null>(null);
  const [paletteTab, setPaletteTab] = useState<'blocks' | 'rows' | 'presets'>('blocks');

  // ─── Undo history ─────────────────────────────────────────────
  // Every designer-initiated mutation goes through commit(), which pushes
  // the prior design onto historyRef before calling onChange. undo() pops
  // the last entry and replays it. The version state is purely so the
  // Undo button re-renders enabled/disabled when history grows/shrinks.
  const historyRef = useRef<EmailDesign[]>([]);
  const lastSerializedRef = useRef<string>(JSON.stringify(design));
  const skipNextSnapshotRef = useRef<boolean>(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const commit = useCallback((next: EmailDesign) => {
    historyRef.current.push(JSON.parse(lastSerializedRef.current));
    // Cap history at 200 entries to keep memory bounded.
    if (historyRef.current.length > 200) historyRef.current.shift();
    lastSerializedRef.current = JSON.stringify(next);
    skipNextSnapshotRef.current = true;
    setHistoryVersion((v) => v + 1);
    onChange(next);
  }, [onChange]);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    lastSerializedRef.current = JSON.stringify(prev);
    skipNextSnapshotRef.current = true;
    setHistoryVersion((v) => v + 1);
    setSelectedId(null);
    onChange(prev);
  }, [onChange]);

  // Keyboard: Cmd/Ctrl+Z anywhere on the page (when not in a contenteditable)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName || '').toLowerCase();
      // Don't hijack undo while the user is editing text in an input
      if (tag === 'input' || tag === 'textarea' || (t?.isContentEditable ?? false)) return;
      e.preventDefault();
      undo();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  // Register every brand custom font with document.fonts so the canvas
  // (which renders blocks via dangerouslySetInnerHTML, not a styled
  // iframe) can actually resolve `font-family: 'BrandFont'`. Without
  // this the canvas silently falls back to Arial. Same pattern as
  // FontDropzone — dedupe by URL and keep loaded fonts across renders.
  const loadedFontUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
    const fonts = initialBrand.customFonts ?? [];
    fonts.forEach((f) => {
      if (loadedFontUrlsRef.current.has(f.url)) return;
      loadedFontUrlsRef.current.add(f.url);
      const ff = new FontFace(f.name, `url(${f.url}) format('${f.format}')`, {
        weight: String(f.weight),
        style: f.style,
        display: 'swap',
      });
      ff.load().then((loaded) => {
        (document as Document & { fonts: FontFaceSet }).fonts.add(loaded);
      }).catch(() => { /* preview falls back to system stack */ });
    });
  }, [initialBrand.customFonts]);

  // Inject a Google Fonts <link> that loads every named font from the
  // dropdown that ISN'T a system font and ISN'T uploaded as a custom
  // brand font. Without this, picking 'Inter' or 'Playfair Display'
  // in the dropdown only sets the family name — the font itself never
  // loads, and the canvas falls back to Arial.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const customNames = new Set((initialBrand.customFonts ?? []).map((f) => f.name));
    const systemFonts = new Set(['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS']);
    const families = new Set<string>();
    // Brand defaults that need loading
    if (initialBrand.fonts?.heading) families.add(initialBrand.fonts.heading);
    if (initialBrand.fonts?.body)    families.add(initialBrand.fonts.body);
    // The full Google fonts list shown in the dropdown
    ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Playfair Display', 'Merriweather', 'Raleway']
      .forEach((f) => families.add(f));
    const toLoad = [...families].filter((f) => f && !systemFonts.has(f) && !customNames.has(f));
    if (toLoad.length === 0) return;
    const id = 'evari-designer-google-fonts';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    const href = `https://fonts.googleapis.com/css2?${toLoad.map((n) => `family=${encodeURIComponent(n).replace(/%20/g, '+')}:wght@400;500;600;700`).join('&')}&display=swap`;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }, [initialBrand.fonts?.heading, initialBrand.fonts?.body, initialBrand.customFonts]);

  function updateDesign(patch: Partial<EmailDesign>) {
    commit({ ...design, ...patch });
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
  function findBlockById(blocks: EmailBlock[], id: string): EmailBlock | null {
    for (const b of blocks) {
      if (b.id === id) return b;
      if (b.type === 'section') {
        const inner = findBlockById(b.blocks ?? [], id);
        if (inner) return inner;
      }
    }
    return null;
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
  /**
   * Re-sort the root-level blocks so anything with pinTo='top' (e.g. the
   * Announcement bar section) is forced to index 0. Stable for everything
   * else. Run this at the end of every mutation that touches the root
   * blocks array.
   */
  function enforcePins(blocks: EmailBlock[]): EmailBlock[] {
    const isPinTop = (b: EmailBlock) => b.type === 'section' && (b as Extract<EmailBlock, { type: 'section' }>).pinTo === 'top';
    const pins = blocks.filter(isPinTop);
    const rest = blocks.filter((b) => !isPinTop(b));
    return [...pins, ...rest];
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
    commit({
      ...design,
      blocks: mapTree(design.blocks, (b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)),
    });
  }
  function removeBlock(id: string) {
    commit({ ...design, blocks: enforcePins(mapTree(design.blocks, (b) => (b.id === id ? null : b))) });
  }
  /**
   * Insert a clone of the block (with a fresh id, recursive) immediately
   * after the original — at root or inside its parent section.
   */
  function duplicateBlock(id: string): void {
    function cloneBlock(b: EmailBlock): EmailBlock {
      const fresh = { ...b, id: nid() } as EmailBlock;
      if (fresh.type === 'section') {
        const sec = fresh as Extract<EmailBlock, { type: 'section' }>;
        return { ...sec, blocks: (sec.blocks ?? []).map(cloneBlock) };
      }
      return fresh;
    }
    const loc = findContainerOf(design.blocks, id);
    if (!loc) return;
    const original = (() => {
      const found = findBlockById(design.blocks, id);
      return found ?? null;
    })();
    if (!original) return;
    const clone = cloneBlock(original);
    const nextBlocks = updateChildren(design.blocks, loc.parentId, (kids) => {
      const next = [...kids];
      next.splice(loc.index + 1, 0, clone);
      return next;
    });
    commit({ ...design, blocks: enforcePins(nextBlocks) });
    setSelectedId(clone.id);
  }
  function addBlock(maker: () => EmailBlock) {
    commit({ ...design, blocks: enforcePins([...design.blocks, maker()]) });
  }
  function insertBlock(parentId: string | null, beforeIndex: number, newBlock: EmailBlock) {
    commit({
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
    commit({
      ...design,
      blocks: updateChildren(design.blocks, a.parentId, (kids) => arrayMove(kids, a.index, o.index)),
    });
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const blockIds = design.blocks.map((b) => b.id);

  const baseHtml = useMemo(
    () => renderEmailDesign(design, initialBrand, { device: previewDevice }),
    [design, initialBrand, previewDevice],
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
      const b = findBlockById(design.blocks, id);
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
      // Pinned-to-top blocks always land at root index 0, regardless of
      // where the user dropped them, and refuse to be nested inside a
      // section. Only one pinned-top section is allowed per email — if
      // one already exists, reject the add.
      const isNewPinTop = newBlock.type === 'section' && (newBlock as Extract<EmailBlock, { type: 'section' }>).pinTo === 'top';
      if (isNewPinTop) {
        const alreadyHas = design.blocks.some(
          (b) => b.type === 'section' && (b as Extract<EmailBlock, { type: 'section' }>).pinTo === 'top',
        );
        if (alreadyHas) return;
        commit({ ...design, blocks: enforcePins([newBlock, ...design.blocks]) });
        return;
      }
      if (overId === 'end-of-list') {
        commit({ ...design, blocks: enforcePins([...design.blocks, newBlock]) });
        return;
      }
      if (overId.startsWith('section-end:')) {
        const sectionId = overId.slice('section-end:'.length);
        commit({
          ...design,
          blocks: updateChildren(design.blocks, sectionId, (kids) => [...kids, newBlock]),
        });
        return;
      }
      if (overId.startsWith('section-body:')) {
        const sectionId = overId.slice('section-body:'.length);
        commit({
          ...design,
          blocks: updateChildren(design.blocks, sectionId, (kids) => [...kids, newBlock]),
        });
        return;
      }
      const loc = findContainerOf(design.blocks, overId);
      if (!loc) {
        commit({ ...design, blocks: enforcePins([...design.blocks, newBlock]) });
        return;
      }
      // Inserting at root: don't let the new block jump above a pinned-top
      // sibling. If it would, bump the index past it.
      if (loc.parentId === null) {
        const root = design.blocks;
        const before = root[loc.index];
        const beforeIsPinned = before && before.type === 'section' && (before as Extract<EmailBlock, { type: 'section' }>).pinTo === 'top';
        const safeIdx = beforeIsPinned ? loc.index + 1 : loc.index;
        commit({
          ...design,
          blocks: enforcePins(updateChildren(design.blocks, null, (kids) => {
            const next = [...kids];
            next.splice(Math.max(0, Math.min(safeIdx, next.length)), 0, newBlock);
            return next;
          })),
        });
        return;
      }
      insertBlock(loc.parentId, loc.index, newBlock);
      return;
    }

    // Sortable in-list reorder. Same-container only — cross-container moves
    // aren't supported yet (delete + re-add covers that case). Pinned-top
    // sections also refuse to be moved (or to be displaced by another move).
    if (activeId !== overId && overId !== 'end-of-list' && !overId.startsWith('section-end:') && !overId.startsWith('section-body:')) {
      const active = findBlockById(design.blocks, activeId);
      const over   = findBlockById(design.blocks, overId);
      const isPinTop = (b: EmailBlock | null) => !!b && b.type === 'section' && (b as Extract<EmailBlock, { type: 'section' }>).pinTo === 'top';
      if (isPinTop(active) || isPinTop(over)) return;
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
    <section className="rounded-md bg-evari-surface border border-evari-edge/30 flex flex-col flex-1 min-h-0 w-full">
      <header className="flex items-center justify-between px-4 py-2 border-b border-evari-edge/20">
        <h2 className="text-sm font-semibold text-evari-text">Visual editor</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={historyRef.current.length === 0}
            title={historyRef.current.length === 0 ? 'Nothing to undo' : `Undo (${historyRef.current.length} steps available) · ⌘Z`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-evari-edge/30 text-evari-text hover:border-evari-gold/40 hover:text-evari-gold disabled:opacity-30 disabled:hover:border-evari-edge/30 disabled:hover:text-evari-text disabled:cursor-not-allowed transition-colors"
          >
            <Undo2 className="h-3 w-3" /> Undo
            {historyRef.current.length > 0 ? <span className="text-evari-dim font-mono tabular-nums text-[10px]">({historyRef.current.length})</span> : null}
          </button>
          {/* keep historyVersion in this scope so the disabled state reacts */}
          <span className="hidden">{historyVersion}</span>
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
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(220px,260px)_minmax(0,1fr)_minmax(280px,340px)] gap-3 p-3 flex-1 min-h-0 overflow-hidden">

        {/* LEFT — tab strip + palette / layers */}
        <div className="flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Tab strip */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-evari-ink/40 border border-evari-edge/30 mb-2 shrink-0" role="tablist" aria-label="Palette / layers / presets">
            {(['blocks', 'rows', 'presets'] as const).map((t) => {
              const active = paletteTab === t;
              const label = t === 'blocks' ? 'Blocks' : t === 'rows' ? 'Rows' : 'Presets';
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPaletteTab(t)}
                  className={cn(
                    'text-[11px] font-medium py-1 rounded transition-colors',
                    active ? 'bg-evari-gold/20 text-evari-gold' : 'text-evari-dim hover:text-evari-text',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Tab content — independently scrollable */}
          {paletteTab === 'presets' ? (
            <div className="space-y-1 min-w-0 overflow-y-auto pr-1 flex-1 min-h-0" role="tabpanel">
              <PresetsPanel
                brand={initialBrand}
                onAddBlock={(b) => commit({ ...design, blocks: enforcePins([...design.blocks, b]) })}
              />
            </div>
          ) : paletteTab === 'blocks' ? (
            <div className="space-y-3 min-w-0 overflow-y-auto pr-1 flex-1 min-h-0" role="tabpanel">
              <BlockTileGroup
                title="Blocks"
                tiles={[HEADING_TILE, ...ADD_BUTTONS.filter((t) => t.group === 'blocks')]}
                brand={initialBrand}
                onAdd={(make) => addBlock(make)}
              />
              <BlockTileGroup
                title="Layout"
                tiles={ADD_BUTTONS.filter((t) => t.group === 'layout')}
                brand={initialBrand}
                onAdd={(make) => addBlock(make)}
              />
              <div className="rounded-md bg-evari-ink/40 border border-evari-edge/20 p-3">
                <h3 className="text-[11px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-2">Canvas settings</h3>
                <div className="space-y-2">
                  <ColourField label="Background" value={design.background} onChange={(v) => updateDesign({ background: v })} brand={initialBrand} />
                  <NumField label="Content width (px)" value={design.widthPx} min={320} max={900} onChange={(v) => updateDesign({ widthPx: v })} />
                  <NumField label="Outer padding (px)" value={design.paddingPx} min={0} max={96} onChange={(v) => updateDesign({ paddingPx: v })} />
                </div>
              </div>
              <BrandKitPreview brand={initialBrand} />
            </div>
          ) : (
            <div className="space-y-1 min-w-0 overflow-y-auto pr-1 flex-1 min-h-0" role="tabpanel">
              <LayersTree
                blocks={design.blocks}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(id)}
                onRemove={(id) => { if (selectedId === id) setSelectedId(null); removeBlock(id); }}
              />
            </div>
          )}
        </div>

        {/* CENTRE — interactive canvas. The OUTER frame always fills
            the available width + height of this column (even on mobile),
            so the design.background is visible as page chrome. The INNER
            email is centred and constrained to the chosen content width
            (360px on mobile preview). */}
        <div className="flex flex-col min-w-0 min-h-0 overflow-hidden -mr-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1 flex items-center justify-between shrink-0">
            <span>Canvas</span>
            <span className="text-evari-dim">{previewDevice === 'mobile' ? `360px (mobile) · ${design.widthPx}px content` : `${design.widthPx}px (desktop)`}</span>
          </div>
          <div
            className="flex-1 min-h-0 overflow-y-auto transition-colors"
            style={{ background: design.background }}
            onClick={() => setSelectedId(null)}
          >
            {/* Inner padded layer — moves the canvas's chrome padding
                INSIDE the scroll container so the scrollbar sits flush
                with the far right edge of the canvas instead of 24px
                inset. The first child is the outer-padded mirror of
                the email HTML's outer table cell. */}
            <div className="p-6" onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }} style={{ background: design.background }}>
            <div
              style={{ padding: `${design.paddingPx}px 0`, background: design.background }}
              onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
            >
            <div
              className={cn('mx-auto transition-[max-width] duration-300', previewDevice === 'mobile' ? '!max-w-[360px]' : '')}
              style={{
                maxWidth: `${design.widthPx}px`,
                background: '#ffffff',
              }}
              onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
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
                        device={previewDevice}
                        selected={selectedId === b.id}
                        selectedId={selectedId}
                        editing={selectedId !== null}
                        onSelect={() => setSelectedId(b.id)}
                        onRemove={() => { setSelectedId(null); removeBlock(b.id); }}
                        onDuplicate={() => duplicateBlock(b.id)}
                        onSelectChild={(id) => setSelectedId(id)}
                        onRemoveChild={(id) => { if (selectedId === id) setSelectedId(null); removeBlock(id); }}
                        onDuplicateChild={(id) => duplicateBlock(id)}
                      />
                    ))}
                    <CanvasEndDrop />
                  </div>
                )}
              </SortableContext>
              <CanvasFooterPreview brand={initialBrand} onRefresh={onRefreshBrand} refreshing={refreshingBrand} />
            </div>
            </div>
            </div>
          </div>
        </div>

        {/* RIGHT — properties panel (or placeholder when nothing selected) */}
        <div className="min-w-0 min-h-0 overflow-y-auto">
          {selectedId ? (
            (() => {
              const sel = findBlockById(design.blocks, selectedId);
              if (!sel) return null;
              return (
                <BlockPropertiesPanel
                  block={sel}
                  brand={initialBrand}
                  designWidthPx={design.widthPx}
                  device={previewDevice}
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
function BlockPropertiesPanel({ block, brand, designWidthPx, device, onChange, onClose }: { block: EmailBlock; brand: MarketingBrand; designWidthPx: number; device: 'desktop' | 'mobile'; onChange: (patch: Partial<EmailBlock>) => void; onClose: () => void }) {
  // Display the effective (merged) block so the field editors show the
  // values that will actually render for the current device.
  const view = effectiveBlock(block, device);
  // Route writes — desktop writes to the root, mobile writes go into
  // block.mobile so desktop values are preserved.
  const routedOnChange = (patch: Partial<EmailBlock>) => {
    if (device !== 'mobile') {
      onChange(patch);
      return;
    }
    const prevMobile = (block.mobile ?? {}) as Record<string, unknown>;
    onChange({ mobile: { ...prevMobile, ...(patch as Record<string, unknown>) } } as Partial<EmailBlock>);
  };
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
        {device === 'mobile' ? <DeviceOverrideBanner blockHasMobile={!!block.mobile} onClear={() => onChange({ mobile: undefined } as unknown as Partial<EmailBlock>)} /> : null}
        {view.type === 'heading'   ? <HeadingFields   block={view} brand={brand} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'heading' }>>) => void} /> : null}
        {view.type === 'text'      ? <TextFields      block={view} brand={brand} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'text' }>>) => void} /> : null}
        {view.type === 'image'     ? <ImageFields     block={view} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'image' }>>) => void} /> : null}
        {view.type === 'button'    ? <ButtonFields    block={view} brand={brand} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'button' }>>) => void} /> : null}
        {view.type === 'divider'   ? <DividerFields   block={view} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'divider' }>>) => void} /> : null}
        {view.type === 'spacer'    ? <SpacerFields    block={view} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'spacer' }>>) => void} /> : null}
        {view.type === 'html'      ? <HtmlFields      block={view} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'html' }>>) => void} /> : null}
        {view.type === 'split'     ? <SplitFields     block={view} brand={brand} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'split' }>>) => void} /> : null}
        {view.type === 'headerBar' ? <HeaderBarFields block={view} brand={brand} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'headerBar' }>>) => void} /> : null}
        {view.type === 'brandLogo' ? <BrandLogoFields block={view} brand={brand} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'brandLogo' }>>) => void} /> : null}
        {view.type === 'card'      ? <CardFields      block={view} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'card' }>>) => void} /> : null}
        {view.type === 'social'    ? <SocialFields    block={view} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'social' }>>) => void} /> : null}
        {view.type === 'coupon'    ? <CouponFields    block={view} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'coupon' }>>) => void} /> : null}
        {view.type === 'table'     ? <TableFields     block={view} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'table' }>>) => void} /> : null}
        {view.type === 'review'    ? <ReviewFields    block={view} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'review' }>>) => void} /> : null}
        {view.type === 'video'     ? <VideoFields     block={view} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'video' }>>) => void} /> : null}
        {view.type === 'product'   ? <ProductFields   block={view} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'product' }>>) => void} /> : null}
        {view.type === 'section'   ? <SectionFields   block={view} brand={brand} designWidthPx={designWidthPx} onChange={routedOnChange as (p: Partial<Extract<EmailBlock, { type: 'section' }>>) => void} /> : null}
        <PaddingFields block={view} onChange={routedOnChange as (p: PaddingPatch) => void} />
      </div>
    </aside>
  );
}


/**
 * When the user is editing a block in mobile preview, surface a banner
 * indicating any change here only affects mobile and offering a single
 * click to wipe all mobile overrides for that block (revert to desktop).
 */
function DeviceOverrideBanner({ blockHasMobile, onClear }: { blockHasMobile: boolean; onClear: () => void }) {
  return (
    <div className="rounded-md border border-evari-gold/40 bg-evari-gold/10 px-2.5 py-2 flex items-start gap-2 text-[11px] text-evari-gold">
      <Smartphone className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <div className="flex-1 leading-snug">
        <span className="font-semibold">Editing mobile only.</span>
        <span className="text-evari-gold/80"> Changes here override the desktop version on small screens.</span>
      </div>
      {blockHasMobile ? (
        <button
          type="button"
          onClick={onClear}
          className="text-evari-gold/80 hover:text-evari-gold underline text-[10px]"
          title="Remove all mobile overrides for this block"
        >
          Reset
        </button>
      ) : null}
    </div>
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

function ColourField({ label, value, onChange, brand }: { label: string; value: string; onChange: (v: string) => void; brand?: MarketingBrand }) {
  // Brand palette swatches (de-duped, in stable order). Only show if brand is provided.
  const brandSwatches = brand
    ? Array.from(new Set([
        brand.colors.primary,
        brand.colors.accent,
        brand.colors.buttonBg,
        brand.colors.text,
        brand.colors.link,
        brand.colors.bg,
        brand.colors.muted,
        brand.colors.buttonText,
      ].filter(Boolean)))
    : [];

  // The native <input type="color"> trigger sits inline — clicking opens
  // the OS colour picker directly with no popover step in between.
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 rounded border border-evari-edge/30 bg-transparent cursor-pointer p-0"
          aria-label={`${label} colour picker`}
          title="Click to open the colour picker"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1 rounded bg-evari-ink text-evari-text text-[11px] font-mono border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none uppercase"
        />
      </div>
      {brandSwatches.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-1.5" aria-label="Brand kit swatches">
          {brandSwatches.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={cn(
                'h-5 w-5 rounded-sm border border-black/20 transition-transform hover:scale-110',
                value.toLowerCase() === c.toLowerCase() && 'ring-2 ring-evari-gold ring-offset-1 ring-offset-evari-surface',
              )}
              style={{ background: c }}
              title={c}
              aria-label={`Use brand colour ${c}`}
            />
          ))}
        </div>
      ) : null}
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


/**
 * Range slider with a numeric readout. Used for font size + tracking
 * + line-height where dragging is more natural than typing.
 */
function SliderField({ label, value, min, max, step, suffix, onChange }: {
  label: string; value: number; min: number; max: number; step?: number;
  suffix?: string; onChange: (v: number) => void;
}) {
  const stepPrecision = (step ?? 1).toString().split('.')[1]?.length ?? 0;
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-1.5 rounded-full bg-evari-ink accent-evari-gold cursor-pointer"
        />
        <div className="flex items-center gap-0.5 shrink-0">
          <input
            type="number"
            value={Number(value.toFixed(stepPrecision))}
            min={min}
            max={max}
            step={step ?? 1}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              onChange(clamp(stepPrecision > 0 ? Number(v.toFixed(stepPrecision)) : Math.round(v)));
            }}
            className="w-14 px-1.5 py-0.5 rounded bg-evari-ink text-evari-text text-[11px] font-mono tabular-nums border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none text-right"
          />
          {suffix ? <span className="text-[10px] text-evari-dimmer font-mono">{suffix}</span> : null}
        </div>
      </div>
    </label>
  );
}


/**
 * Per-block typography preset UI: dropdown to APPLY a saved style and
 * a small "Save current as style…" button. Persists straight to
 * brand.fonts.presets via PATCH /api/marketing/brand. Used on heading
 * + text blocks so they can be styled in one click instead of touching
 * five sliders every time.
 */
function TypographyStyles({
  brand,
  current,
  onApply,
}: {
  brand: MarketingBrand;
  current: { fontFamily: string; fontSizePx: number; fontWeight: number; letterSpacingEm: number; lineHeight: number; color: string; textTransform?: 'none' | 'lowercase' | 'uppercase' | 'capitalize' };
  onApply: (preset: TypographyPreset) => void;
}) {
  const [presets, setPresets] = useState<TypographyPreset[]>(brand.fonts.presets ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reflect external brand updates (e.g. on first load).
  useEffect(() => {
    setPresets(brand.fonts.presets ?? []);
  }, [brand.fonts.presets]);

  async function persist(next: TypographyPreset[]) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/marketing/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fonts: { ...brand.fonts, presets: next } }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setPresets(next);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save style';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  function handleSaveNew() {
    const name = window.prompt('Name this style', `Style ${presets.length + 1}`);
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `style-${Date.now()}`;
    const preset: TypographyPreset = {
      id,
      name: name.trim(),
      fontFamily: current.fontFamily ?? '',
      fontSizePx: current.fontSizePx,
      fontWeight: current.fontWeight,
      letterSpacingEm: current.letterSpacingEm,
      lineHeight: current.lineHeight,
      color: current.color,
      textTransform: current.textTransform ?? 'none',
      createdAt: new Date().toISOString(),
    };
    // De-dupe by id (overwrite if name collides).
    const next = [...presets.filter((p) => p.id !== id), preset];
    persist(next);
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this saved style?')) return;
    persist(presets.filter((p) => p.id !== id));
  }

  return (
    <div className="rounded-md border border-evari-edge/30 bg-evari-ink/40 p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Typography style</span>
        <button
          type="button"
          onClick={handleSaveNew}
          disabled={saving}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-evari-gold hover:bg-evari-gold/10 disabled:opacity-50"
          title="Save the current font + size + tracking + weight + line height + colour as a reusable style"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bookmark className="h-3 w-3" />}
          Save as style
        </button>
      </div>
      {presets.length === 0 ? (
        <p className="text-[10px] text-evari-dimmer leading-snug">
          No saved styles yet. Tweak the sliders above, then click <span className="text-evari-gold">Save as style</span> to make it reusable across every email and template.
        </p>
      ) : (
        <ul className="space-y-1">
          {presets.map((p) => (
            <li key={p.id} className="flex items-center gap-1 group">
              <button
                type="button"
                onClick={() => onApply(p)}
                className="flex-1 text-left px-2 py-1 rounded hover:bg-evari-edge/30 transition-colors"
                title={`${p.fontFamily || 'inherit'} · ${p.fontSizePx}px · ${p.fontWeight} · ${p.letterSpacingEm}em · ${p.lineHeight}`}
              >
                <span
                  className="block text-[12px] text-evari-text leading-tight truncate"
                  style={{
                    fontFamily: p.fontFamily ? `'${p.fontFamily}', sans-serif` : undefined,
                    fontWeight: p.fontWeight,
                    letterSpacing: `${p.letterSpacingEm}em`,
                    color: p.color,
                    textTransform: p.textTransform && p.textTransform !== 'none' ? p.textTransform : undefined,
                  }}
                >
                  {p.name}
                </span>
                <span className="block text-[9px] text-evari-dimmer font-mono tabular-nums">
                  {p.fontSizePx}px · {p.fontWeight} · {p.letterSpacingEm}em
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-evari-dim hover:text-evari-danger transition-opacity"
                title="Delete style"
                aria-label={`Delete style ${p.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="text-[10px] text-evari-danger">{error}</p> : null}
    </div>
  );
}


/** Text-case dropdown — maps to CSS text-transform on heading/text blocks. */
function CaseField({ value, onChange }: { value: 'none' | 'lowercase' | 'uppercase' | 'capitalize' | undefined; onChange: (v: 'none' | 'lowercase' | 'uppercase' | 'capitalize') => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Case</span>
      <select
        value={value ?? 'none'}
        onChange={(e) => onChange(e.target.value as 'none' | 'lowercase' | 'uppercase' | 'capitalize')}
        className={inputCls}
      >
        <option value="none">As typed</option>
        <option value="lowercase">all small case</option>
        <option value="uppercase">ALL CAPS</option>
        <option value="capitalize">Title Case</option>
      </select>
    </label>
  );
}


/** Named font-weight dropdown — maps display labels to numeric weights. */
const FONT_WEIGHTS: Array<{ value: number; label: string }> = [
  { value: 100, label: 'Thin' },
  { value: 200, label: 'Extra-light' },
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semi-bold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'Extra-bold' },
  { value: 900, label: 'Black' },
];

function WeightField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // If the saved weight isn't one of the canonical 100-step values
  // (e.g. user picked 450 on the old slider), still match the closest.
  const closest = FONT_WEIGHTS.reduce((acc, w) => Math.abs(w.value - value) < Math.abs(acc - value) ? w.value : acc, FONT_WEIGHTS[0].value);
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Weight</span>
      <select
        value={closest}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputCls}
      >
        {FONT_WEIGHTS.map((w) => (
          <option key={w.value} value={w.value} style={{ fontWeight: w.value }}>
            {w.label} ({w.value})
          </option>
        ))}
      </select>
    </label>
  );
}

function HeadingFields({ block, brand, onChange }: { block: Extract<EmailBlock, { type: 'heading' }>; brand: MarketingBrand; onChange: (p: Partial<Extract<EmailBlock, { type: 'heading' }>>) => void }) {
  const defaultSize = block.level === 1 ? 28 : block.level === 2 ? 22 : 18;
  const size = block.fontSizePx ?? defaultSize;
  const tracking = block.letterSpacingEm ?? 0;
  const weight = block.fontWeight ?? 700;
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">
          <span>Heading text (HTML allowed)</span>
          <VariableMenu onPick={(token) => onChange({ html: block.html + token })} />
        </span>
        <textarea value={block.html} onChange={(e) => onChange({ html: e.target.value })} className={cn(inputCls, 'min-h-[60px] font-mono text-[12px]')} />
      </label>
      <TypographyStyles
        brand={brand}
        current={{ fontFamily: block.fontFamily, fontSizePx: size, fontWeight: weight, letterSpacingEm: tracking, lineHeight: 1.25, color: block.color, textTransform: block.textTransform }}
        onApply={(p) => onChange({ fontFamily: p.fontFamily, fontSizePx: p.fontSizePx, fontWeight: p.fontWeight, letterSpacingEm: p.letterSpacingEm, color: p.color, textTransform: p.textTransform ?? 'none' })}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Level</span>
          <select value={block.level} onChange={(e) => onChange({ level: Number(e.target.value) as 1 | 2 | 3 })} className={inputCls}>
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
        </label>
        <FontDropdown value={block.fontFamily} brand={brand} onChange={(v) => onChange({ fontFamily: v })} />
      </div>
      <SliderField label="Size" value={size} min={10} max={96} suffix="px" onChange={(v) => onChange({ fontSizePx: v })} />
      <SliderField label="Tracking" value={tracking} min={-0.1} max={0.4} step={0.005} suffix="em" onChange={(v) => onChange({ letterSpacingEm: Number(v.toFixed(3)) })} />
      <WeightField value={weight} onChange={(v) => onChange({ fontWeight: v })} />
      <div className="grid grid-cols-2 gap-2">
        <ColourField label="Colour" value={block.color} onChange={(v) => onChange({ color: v })} brand={brand} />
        <AlignmentField value={block.alignment} onChange={(v) => onChange({ alignment: v })} />
      </div>
      <CaseField value={block.textTransform} onChange={(v) => onChange({ textTransform: v })} />
    </div>
  );
}

function TextFields({ block, brand, onChange }: { block: Extract<EmailBlock, { type: 'text' }>; brand: MarketingBrand; onChange: (p: Partial<Extract<EmailBlock, { type: 'text' }>>) => void }) {
  const tracking = block.letterSpacingEm ?? 0;
  const weight = block.fontWeight ?? 400;
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">
          <span>Content (HTML allowed)</span>
          <VariableMenu onPick={(token) => onChange({ html: block.html + token })} />
        </span>
        <textarea value={block.html} onChange={(e) => onChange({ html: e.target.value })} className={cn(inputCls, 'min-h-[100px] font-mono text-[12px]')} />
      </label>
      <TypographyStyles
        brand={brand}
        current={{ fontFamily: block.fontFamily, fontSizePx: block.fontSizePx, fontWeight: weight, letterSpacingEm: tracking, lineHeight: block.lineHeight, color: block.color, textTransform: block.textTransform }}
        onApply={(p) => onChange({ fontFamily: p.fontFamily, fontSizePx: p.fontSizePx, fontWeight: p.fontWeight, letterSpacingEm: p.letterSpacingEm, lineHeight: p.lineHeight, color: p.color, textTransform: p.textTransform ?? 'none' })}
      />
      <FontDropdown value={block.fontFamily} brand={brand} onChange={(v) => onChange({ fontFamily: v })} />
      <SliderField label="Size" value={block.fontSizePx} min={10} max={48} suffix="px" onChange={(v) => onChange({ fontSizePx: v })} />
      <SliderField label="Line height" value={block.lineHeight} min={1} max={3} step={0.05} onChange={(v) => onChange({ lineHeight: Number(v.toFixed(2)) })} />
      <SliderField label="Tracking" value={tracking} min={-0.05} max={0.3} step={0.005} suffix="em" onChange={(v) => onChange({ letterSpacingEm: Number(v.toFixed(3)) })} />
      <WeightField value={weight} onChange={(v) => onChange({ fontWeight: v })} />
      <div className="grid grid-cols-2 gap-2">
        <ColourField label="Colour" value={block.color} onChange={(v) => onChange({ color: v })} brand={brand} />
        <AlignmentField value={block.alignment} onChange={(v) => onChange({ alignment: v })} />
      </div>
      <CaseField value={block.textTransform} onChange={(v) => onChange({ textTransform: v })} />
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
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Alt text</span>
        <input type="text" value={block.alt} onChange={(e) => onChange({ alt: e.target.value })} className={inputCls} />
      </label>
      <SliderField label="Width" value={block.maxWidthPx} min={40} max={1200} suffix="px" onChange={(v) => onChange({ maxWidthPx: v })} />
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Click-through URL (optional)</span>
        <input type="url" value={block.linkUrl ?? ''} onChange={(e) => onChange({ linkUrl: e.target.value || undefined })} placeholder="https://…" className={cn(inputCls, 'font-mono text-[12px]')} />
      </label>
      <AlignmentField value={block.alignment} onChange={(v) => onChange({ alignment: v })} />
    </div>
  );
}


/**
 * Per-block BUTTON preset UI: dropdown to APPLY a saved button style and a
 * "Save current as button preset" button. Persists to brand.fonts.buttonPresets
 * via PATCH /api/marketing/brand. Mirrors the typography preset UX.
 */
function ButtonStyles({
  brand,
  current,
  onApply,
}: {
  brand: MarketingBrand;
  current: { backgroundColor: string; textColor: string; borderRadiusPx: number; paddingXPx: number; paddingYPx: number; fontFamily?: string; fontSizePx?: number; fontWeight?: number; letterSpacingEm?: number; textTransform?: 'none' | 'lowercase' | 'uppercase' | 'capitalize'; widthMode?: 'auto' | 'fullWidth' | 'fixed'; widthPx?: number };
  onApply: (preset: ButtonPreset) => void;
}) {
  const [presets, setPresets] = useState<ButtonPreset[]>(brand.fonts.buttonPresets ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setPresets(brand.fonts.buttonPresets ?? []); }, [brand.fonts.buttonPresets]);

  async function persist(next: ButtonPreset[]) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/marketing/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fonts: { ...brand.fonts, buttonPresets: next } }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setPresets(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save button preset');
    } finally {
      setSaving(false);
    }
  }

  function handleSaveNew() {
    const name = window.prompt('Name this button style', `Button ${presets.length + 1}`);
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `button-${Date.now()}`;
    const preset: ButtonPreset = {
      id,
      name: name.trim(),
      backgroundColor: current.backgroundColor,
      textColor: current.textColor,
      borderRadiusPx: current.borderRadiusPx,
      paddingXPx: current.paddingXPx,
      paddingYPx: current.paddingYPx,
      fontFamily: current.fontFamily ?? '',
      fontSizePx: current.fontSizePx,
      fontWeight: current.fontWeight,
      letterSpacingEm: current.letterSpacingEm,
      textTransform: current.textTransform,
      widthMode: current.widthMode,
      widthPx: current.widthPx,
      createdAt: new Date().toISOString(),
    };
    persist([...presets.filter((p) => p.id !== id), preset]);
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this button preset?')) return;
    persist(presets.filter((p) => p.id !== id));
  }

  return (
    <div className="rounded-md border border-evari-edge/30 bg-evari-ink/40 p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Button preset</span>
        <button
          type="button"
          onClick={handleSaveNew}
          disabled={saving}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-evari-gold hover:bg-evari-gold/10 disabled:opacity-50"
          title="Save the current button colour, padding, radius + font as a reusable preset"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bookmark className="h-3 w-3" />}
          Save as preset
        </button>
      </div>
      {presets.length === 0 ? (
        <p className="text-[10px] text-evari-dimmer leading-snug">
          No saved button presets yet. Tweak this button, then click <span className="text-evari-gold">Save as preset</span> to reuse it.
        </p>
      ) : (
        <ul className="space-y-1">
          {presets.map((p) => (
            <li key={p.id} className="flex items-center gap-1 group">
              <button
                type="button"
                onClick={() => onApply(p)}
                className="flex-1 text-left px-2 py-1 rounded hover:bg-evari-edge/30 transition-colors flex items-center gap-2"
              >
                <span
                  className="inline-block px-2 py-1 rounded text-[10px] font-medium shrink-0"
                  style={{
                    background: p.backgroundColor,
                    color: p.textColor,
                    borderRadius: `${p.borderRadiusPx}px`,
                    fontFamily: p.fontFamily ? `'${p.fontFamily}', sans-serif` : undefined,
                    fontWeight: p.fontWeight ?? 700,
                    letterSpacing: p.letterSpacingEm != null ? `${p.letterSpacingEm}em` : undefined,
                    textTransform: p.textTransform && p.textTransform !== 'none' ? p.textTransform : undefined,
                  }}
                >
                  {p.label || 'Button'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-evari-text leading-tight truncate">{p.name}</span>
                  <span className="block text-[9px] text-evari-dimmer font-mono tabular-nums">{p.paddingYPx}×{p.paddingXPx} · r{p.borderRadiusPx}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-evari-dim hover:text-evari-danger transition-opacity"
                title="Delete preset"
                aria-label={`Delete preset ${p.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="text-[10px] text-evari-danger">{error}</p> : null}
    </div>
  );
}

function ButtonFields({ block, brand, onChange }: { block: Extract<EmailBlock, { type: 'button' }>; brand: MarketingBrand; onChange: (p: Partial<Extract<EmailBlock, { type: 'button' }>>) => void }) {
  const weight = block.fontWeight ?? 700;
  const tracking = block.letterSpacingEm ?? 0;
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
      <ButtonStyles
        brand={brand}
        current={{
          backgroundColor: block.backgroundColor,
          textColor: block.textColor,
          borderRadiusPx: block.borderRadiusPx,
          paddingXPx: block.paddingXPx,
          paddingYPx: block.paddingYPx,
          fontFamily: block.fontFamily,
          fontSizePx: block.fontSizePx,
          fontWeight: block.fontWeight,
          letterSpacingEm: block.letterSpacingEm,
          textTransform: block.textTransform,
          widthMode: block.widthMode,
          widthPx: block.widthPx,
        }}
        onApply={(p) => onChange({
          backgroundColor: p.backgroundColor,
          textColor: p.textColor,
          borderRadiusPx: p.borderRadiusPx,
          paddingXPx: p.paddingXPx,
          paddingYPx: p.paddingYPx,
          fontFamily: p.fontFamily ?? '',
          fontSizePx: p.fontSizePx,
          fontWeight: p.fontWeight,
          letterSpacingEm: p.letterSpacingEm,
          textTransform: p.textTransform,
          widthMode: p.widthMode,
          widthPx: p.widthPx,
        })}
      />
      <div className="grid grid-cols-2 gap-2">
        <ColourField label="Background" value={block.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} brand={brand} />
        <ColourField label="Text" value={block.textColor} onChange={(v) => onChange({ textColor: v })} brand={brand} />
      </div>
      <div className="space-y-1.5">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Width</span>
        <div className="grid grid-cols-3 gap-1 rounded-md bg-evari-ink p-1 border border-evari-edge/30" role="radiogroup" aria-label="Button width mode">
          {([
            { v: 'auto',      l: 'Auto' },
            { v: 'fullWidth', l: 'Full' },
            { v: 'fixed',     l: 'Fixed' },
          ] as const).map((opt) => {
            const active = (block.widthMode ?? 'auto') === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange({ widthMode: opt.v })}
                className={cn('text-[11px] py-1 rounded transition-colors', active ? 'bg-evari-gold/20 text-evari-gold' : 'text-evari-dim hover:text-evari-text')}
              >
                {opt.l}
              </button>
            );
          })}
        </div>
        {(block.widthMode ?? 'auto') === 'fixed' ? (
          <SliderField label="Fixed width" value={block.widthPx ?? 240} min={80} max={600} suffix="px" onChange={(v) => onChange({ widthPx: v })} />
        ) : null}
      </div>
      <FontDropdown value={block.fontFamily ?? ''} brand={brand} onChange={(v) => onChange({ fontFamily: v })} />
      <SliderField label="Size" value={block.fontSizePx ?? 14} min={10} max={32} suffix="px" onChange={(v) => onChange({ fontSizePx: v })} />
      <SliderField label="Tracking" value={tracking} min={-0.05} max={0.4} step={0.005} suffix="em" onChange={(v) => onChange({ letterSpacingEm: Number(v.toFixed(3)) })} />
      <WeightField value={weight} onChange={(v) => onChange({ fontWeight: v })} />
      <CaseField value={block.textTransform} onChange={(v) => onChange({ textTransform: v })} />
      <SliderField label="Corner radius" value={block.borderRadiusPx} min={0} max={40} suffix="px" onChange={(v) => onChange({ borderRadiusPx: v })} />
      <div className="grid grid-cols-2 gap-2">
        <SliderField label="Padding X" value={block.paddingXPx} min={4} max={64} suffix="px" onChange={(v) => onChange({ paddingXPx: v })} />
        <SliderField label="Padding Y" value={block.paddingYPx} min={4} max={48} suffix="px" onChange={(v) => onChange({ paddingYPx: v })} />
      </div>
      <AlignmentField value={block.alignment} onChange={(v) => onChange({ alignment: v })} />
    </div>
  );
}

function DividerFields({ block, onChange }: { block: Extract<EmailBlock, { type: 'divider' }>; onChange: (p: Partial<Extract<EmailBlock, { type: 'divider' }>>) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <ColourField label="Colour" value={block.color} onChange={(v) => onChange({ color: v })} />
        <NumField label="Thickness (px)" value={block.thicknessPx} min={1} max={8} onChange={(v) => onChange({ thicknessPx: v })} />
        <NumField label="Margin Y (px)" value={block.marginYPx} min={0} max={64} onChange={(v) => onChange({ marginYPx: v })} />
      </div>
      <SliderField
        label="Width"
        value={block.widthPct ?? 100}
        min={10}
        max={100}
        suffix="%"
        onChange={(v) => onChange({ widthPct: v })}
      />
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

type PaddingPatch = { paddingTopPx?: number; paddingBottomPx?: number; paddingLeftPx?: number; paddingRightPx?: number };
function PaddingFields({ block, onChange }: { block: PaddingPatch; onChange: (p: PaddingPatch) => void }) {
  const top   = block.paddingTopPx    ?? 0;
  const bot   = block.paddingBottomPx ?? 0;
  const left  = block.paddingLeftPx   ?? 0;
  const right = block.paddingRightPx  ?? 0;
  // Lock state — when locked, dragging either slider in the pair changes
  // both values to the same number. Per-pair, persisted only locally.
  const [lockY, setLockY] = useState(top === bot);
  const [lockX, setLockX] = useState(left === right);
  return (
    <div className="space-y-2 pt-1 border-t border-evari-edge/10">
      {/* Vertical pair — top + bottom */}
      <PairedPadding
        groupLabel="Vertical padding"
        labelA="Top"    valueA={top}
        labelB="Bottom" valueB={bot}
        locked={lockY}
        onToggleLock={() => setLockY((v) => !v)}
        onChangeA={(v) => onChange(lockY ? { paddingTopPx: v, paddingBottomPx: v } : { paddingTopPx: v })}
        onChangeB={(v) => onChange(lockY ? { paddingTopPx: v, paddingBottomPx: v } : { paddingBottomPx: v })}
      />
      {/* Horizontal pair — left + right */}
      <PairedPadding
        groupLabel="Horizontal padding"
        labelA="Left"  valueA={left}
        labelB="Right" valueB={right}
        locked={lockX}
        onToggleLock={() => setLockX((v) => !v)}
        onChangeA={(v) => onChange(lockX ? { paddingLeftPx: v, paddingRightPx: v } : { paddingLeftPx: v })}
        onChangeB={(v) => onChange(lockX ? { paddingLeftPx: v, paddingRightPx: v } : { paddingRightPx: v })}
      />
    </div>
  );
}

/**
 * Vertically-stacked pair of padding sliders inside a bordered group.
 * A small Link / Unlink toggle in the group header binds both values:
 * when linked, dragging or typing into either side updates both.
 * Stacking avoids the narrow-column squash from the previous side-by-
 * side layout and gives each slider + number input full width.
 */
function PairedPadding({ groupLabel, labelA, valueA, labelB, valueB, locked, onToggleLock, onChangeA, onChangeB }: {
  groupLabel: string;
  labelA: string; valueA: number;
  labelB: string; valueB: number;
  locked: boolean;
  onToggleLock: () => void;
  onChangeA: (v: number) => void;
  onChangeB: (v: number) => void;
}) {
  return (
    <section className="rounded-md border border-evari-edge/20 px-2 py-1.5 space-y-1.5">
      <header className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">{groupLabel}</span>
        <button
          type="button"
          onClick={onToggleLock}
          className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors',
            locked
              ? 'text-evari-gold bg-evari-gold/10 hover:bg-evari-gold/20'
              : 'text-evari-dim hover:text-evari-text hover:bg-evari-edge/30',
          )}
          title={locked ? 'Linked — both sides change together. Click to unlink.' : 'Unlinked. Click to link both sides.'}
          aria-pressed={locked}
        >
          {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
          {locked ? 'Linked' : 'Link'}
        </button>
      </header>
      <SliderField label={labelA} value={valueA} min={0} max={120} suffix="px" onChange={onChangeA} />
      <SliderField label={labelB} value={valueB} min={0} max={120} suffix="px" onChange={onChangeB} />
    </section>
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


/**
 * Read-only brand footer rendered at the bottom of the canvas. It's the
 * same renderFooter() the sender uses, so the user sees exactly what's
 * going to ship — minus the interactivity (no select / drag / delete).
 * Edit the footer in the dedicated Footer designer (/footer).
 */
function CanvasFooterPreview({ brand }: { brand: MarketingBrand; onRefresh?: () => void | Promise<void>; refreshing?: boolean }) {
  const html = useMemo(() => {
    try {
      // Inline call avoids a circular dependency since both files are TS.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@/lib/marketing/footer') as { renderFooter: (i: { brand: MarketingBrand; unsubscribeUrl?: string | null }) => string };
      return mod.renderFooter({ brand, unsubscribeUrl: '#' });
    } catch {
      return '';
    }
  }, [brand]);
  if (!html.trim()) return null;
  // overflow-hidden + width:100% wraps any rogue table-layout:auto growth
  // from the footer's inner table back inside the inner email frame.
  return (
    <div
      className="pointer-events-none select-none overflow-hidden"
      style={{ width: '100%', maxWidth: '100%' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
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
function CanvasBlock({ block, brand, device, selected, selectedId, editing, onSelect, onRemove, onDuplicate, onSelectChild, onRemoveChild, onDuplicateChild }: {
  block: EmailBlock;
  brand: MarketingBrand;
  device: 'desktop' | 'mobile';
  selected: boolean;
  selectedId: string | null;
  editing: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onSelectChild: (id: string) => void;
  onRemoveChild: (id: string) => void;
  onDuplicateChild: (id: string) => void;
}) {
  // Render with the device-effective block so mobile overrides take
  // effect in the canvas.
  const eff = effectiveBlock(block, device);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Sections render as a real DOM wrapper so children can layer on top.
  // Everything else uses the renderer's email-safe HTML directly.
  const isSection = eff.type === 'section';
  const isPinned = isSection && (eff as Extract<EmailBlock, { type: 'section' }>).pinTo === 'top';
  // Spread sortable attrs/listeners on the WHOLE block wrapper so the user
  // can grab anywhere. PointerSensor's 4px activationConstraint distinguishes
  // a click (selects) from a drag (reorders). Pinned blocks (announcement
  // bar) skip the listeners entirely since they can't move.
  const dragProps = isPinned ? {} : { ...attributes, ...listeners };
  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <CanvasInsertionZone overId={block.id} />
      <div
        {...dragProps}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        className={cn(
          'relative transition-shadow touch-none select-none',
          isPinned ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
          selected ? 'ring-2 ring-evari-gold' : editing ? 'hover:ring-1 hover:ring-evari-gold/40' : '',
        )}
      >
        {isSection ? (
          <SectionCanvasWrapper
            block={eff as Extract<EmailBlock, { type: 'section' }>}
            brand={brand}
            device={device}
            selectedId={selectedId}
            editing={editing}
            onSelectChild={onSelectChild}
            onRemoveChild={onRemoveChild}
            onDuplicateChild={onDuplicateChild}
          />
        ) : (
          <div className="pointer-events-none" dangerouslySetInnerHTML={{ __html: renderEmailBlockHtml(eff, brand, device) }} />
        )}
        <div className={cn(
          'absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 rounded-md bg-evari-ink/95 border border-evari-edge/40 shadow-lg backdrop-blur-sm transition-opacity',
          selected ? 'opacity-100' : editing ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 pointer-events-none',
        )}>
          {isPinned ? (
            <span className="p-1.5 text-evari-gold" title="Pinned to top — can't be reordered" aria-label="Pinned to top">
              <Pin className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className="p-1.5 text-evari-dim" title="Click and drag the block to reorder" aria-label="Drag affordance">
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="p-1.5 text-evari-dim hover:text-evari-text" title="Duplicate block" aria-label="Duplicate block">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1.5 text-evari-dim hover:text-evari-danger" title="Delete block" aria-label="Delete block">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionCanvasWrapper({ block, brand, device, selectedId, editing, onSelectChild, onRemoveChild, onDuplicateChild }: {
  block: Extract<EmailBlock, { type: 'section' }>;
  brand: MarketingBrand;
  device: 'desktop' | 'mobile';
  selectedId: string | null;
  editing: boolean;
  onSelectChild: (id: string) => void;
  onRemoveChild: (id: string) => void;
  onDuplicateChild: (id: string) => void;
}) {
  const fill = bgFillCss(block.backgroundSize);
  // Announcement-bar sections default to centred V-alignment.
  const ay = block.contentAlignY ?? (block.kind === 'announcementBar' ? 'middle' : undefined);
  // Explicit width override (% of section width) takes priority over fill,
  // except when tiling (which uses the image's native size).
  const bgSize = block.backgroundWidthPct && block.backgroundSize !== 'tile'
    ? `${block.backgroundWidthPct}% auto`
    : fill.size;
  const wrapperStyle: React.CSSProperties = {
    backgroundColor: block.backgroundColor,
    backgroundImage: block.backgroundImage ? `url(${block.backgroundImage})` : undefined,
    backgroundSize: bgSize,
    backgroundRepeat: fill.repeat,
    backgroundPosition: block.backgroundPosition ?? 'center',
    borderRadius: `${block.borderRadiusPx}px`,
    padding: `${block.paddingPx}px`,
    minHeight: block.minHeightPx ? `${block.minHeightPx}px` : undefined,
    color: block.contentColor ?? undefined,
    display: ay && ay !== 'top' ? 'flex' : undefined,
    flexDirection: ay && ay !== 'top' ? 'column' : undefined,
    justifyContent: ay === 'middle' ? 'center' : ay === 'bottom' ? 'flex-end' : undefined,
  };
  const childIds = (block.blocks ?? []).map((c) => c.id);
  const isEmpty = (block.blocks ?? []).length === 0;
  // Section-as-droptarget: ONLY register on empty sections so dragging
  // over a non-empty section uses the per-child insertion zones (which
  // are precise) and avoids the flicker of two competing droppables.
  // disabled:true keeps the hook stable so React doesn't unmount/remount.
  const { isOver: isOverBody, setNodeRef: setBodyDroppableRef } = useDroppable({
    id: `section-body:${block.id}`,
    disabled: !isEmpty,
  });
  return (
    <div ref={setBodyDroppableRef} style={wrapperStyle} className={cn('relative transition-shadow', isEmpty && isOverBody && 'ring-2 ring-evari-gold ring-inset')}>
      <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
        {(block.blocks ?? []).length === 0 ? (
          <SectionEmptyDrop sectionId={block.id} editing={editing} />
        ) : (
          <div className="space-y-0">
            {(block.blocks ?? []).map((c) => (
              <CanvasBlock
                key={c.id}
                block={c}
                brand={brand}
                device={device}
                selected={selectedId === c.id}
                selectedId={selectedId}
                editing={editing}
                onSelect={() => onSelectChild(c.id)}
                onRemove={() => onRemoveChild(c.id)}
                onDuplicate={() => onDuplicateChild(c.id)}
                onSelectChild={onSelectChild}
                onRemoveChild={onRemoveChild}
                onDuplicateChild={onDuplicateChild}
              />
            ))}
            <SectionEndDrop sectionId={block.id} />
          </div>
        )}
      </SortableContext>
    </div>
  );
}

function SectionEmptyDrop({ sectionId, editing }: { sectionId: string; editing: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: `section-end:${sectionId}` });
  // When the canvas is in clean-preview mode (nothing selected), the
  // dashed overlay disappears entirely — just an invisible drop hit-area
  // remains so dragging tiles still works.
  if (!editing && !isOver) {
    return <div ref={setNodeRef} className="min-h-[48px]" aria-hidden />;
  }
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
  // Idle: collapse to 0 height so V-alignment of the section's children
  // isn't thrown off by an invisible drop strip taking up vertical space.
  return (
    <div ref={setNodeRef} className={cn('rounded transition-all', isOver ? 'h-8 mt-1 bg-evari-gold/15 border-2 border-dashed border-evari-gold/60' : 'h-0')} />
  );
}

function CanvasInsertionZone({ overId }: { overId: string }) {
  const { isOver, setNodeRef } = useDroppable({ id: overId });
  // Idle: 0 visible height. On hover: gold insertion bar. Avoids the
  // layout flicker that came from inflating every seam during a drag.
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded transition-colors',
        isOver
          ? 'h-3 my-1 bg-evari-gold/15 border-y-2 border-dashed border-evari-gold/70'
          : 'h-0',
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


function BrandLogoFields({ block, brand, onChange }: { block: Extract<EmailBlock, { type: 'brandLogo' }>; brand: MarketingBrand; onChange: (p: Partial<Extract<EmailBlock, { type: 'brandLogo' }>>) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const lightSrc = brand.logoLightUrl;
  const darkSrc  = brand.logoDarkUrl;
  const resolved = block.srcOverride || (block.variant === 'dark' ? darkSrc : lightSrc) || (block.variant === 'dark' ? lightSrc : darkSrc) || '';
  const usingOverride = !!block.srcOverride;
  return (
    <div className="space-y-3">
      {/* Live preview tile — reflects variant + override + opacity */}
      <section>
        <h4 className="text-[11px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-1.5">Brand image</h4>
        <div className="rounded-md overflow-hidden">
          <div
            className="w-full aspect-[5/3] flex items-center justify-center"
            style={{ background: block.variant === 'dark' ? '#0a0a0a' : '#f4f4f5' }}
            aria-label="Brand logo preview"
          >
            {resolved ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolved} alt="" className="max-h-[80%] max-w-[80%] object-contain" style={{ opacity: block.opacity ?? 1 }} />
            ) : (
              <span className="text-[10px] text-evari-dim">No brand logo set</span>
            )}
          </div>
          <div className="flex items-center gap-2 pt-1.5">
            <button type="button" onClick={() => setPickerOpen(true)} className="text-[11px] text-evari-gold hover:underline">
              {usingOverride ? 'Replace' : 'Override'}
            </button>
            {usingOverride ? (
              <button type="button" onClick={() => onChange({ srcOverride: null })} className="text-[11px] text-evari-dim hover:text-evari-text">
                Reset to brand
              </button>
            ) : null}
            <span className="text-[10px] text-evari-dimmer ml-auto">
              {usingOverride ? 'Custom override' : `Brand kit · ${block.variant} logo`}
            </span>
          </div>
        </div>
      </section>

      {/* Variant toggle */}
      <section>
        <h4 className="text-[11px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-1.5">Variant</h4>
        <div className="grid grid-cols-2 gap-1 rounded-md bg-evari-ink p-1 border border-evari-edge/30" role="radiogroup" aria-label="Logo variant">
          {(['light', 'dark'] as const).map((v) => {
            const active = block.variant === v;
            const src = v === 'dark' ? darkSrc : lightSrc;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange({ variant: v })}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded transition-colors text-[11px]',
                  active ? 'bg-evari-gold/20 text-evari-gold' : 'text-evari-dim hover:text-evari-text',
                )}
                title={src ? `Use ${v} logo` : `${v} logo not set in brand kit — falls back to the other variant`}
              >
                <span
                  className="h-5 w-8 rounded-sm flex items-center justify-center shrink-0 border border-black/30"
                  style={{ background: v === 'dark' ? '#0a0a0a' : '#ffffff' }}
                >
                  {src ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={src} alt="" className="max-h-[70%] max-w-[80%] object-contain" />
                  ) : null}
                </span>
                <span className="capitalize">{v}</span>
              </button>
            );
          })}
        </div>
      </section>

      <SliderField label="Width" value={block.widthPx} min={40} max={600} suffix="px" onChange={(v) => onChange({ widthPx: v })} />
      <SliderField label="Opacity" value={Math.round((block.opacity ?? 1) * 100)} min={0} max={100} suffix="%" onChange={(v) => onChange({ opacity: Math.max(0, Math.min(1, v / 100)) })} />

      <AlignmentField value={block.alignment} onChange={(v) => onChange({ alignment: v })} />

      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Click-through URL (optional)</span>
        <input type="url" value={block.linkUrl ?? ''} onChange={(e) => onChange({ linkUrl: e.target.value })} className={cn(inputCls, 'font-mono text-[12px]')} />
      </label>

      {pickerOpen ? (
        <AssetPickerModal
          onClose={() => setPickerOpen(false)}
          onPick={(url) => { onChange({ srcOverride: url }); setPickerOpen(false); }}
        />
      ) : null}
    </div>
  );
}

function HeaderBarFields({ block, brand, onChange }: { block: Extract<EmailBlock, { type: 'headerBar' }>; brand: MarketingBrand; onChange: (p: Partial<Extract<EmailBlock, { type: 'headerBar' }>>) => void }) {
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  // Resolved logo: explicit override URL on the block, else the brand kit's
  // light logo (matches what the renderer falls back to at send time).
  const resolvedLogo = block.logoUrl || brand.logoLightUrl || '';
  const usingBrandDefault = !block.logoUrl;
  return (
    <div className="space-y-2">
      {/* Brand logo thumbnail — mirrors the section bg image preview UX */}
      <section>
        <h4 className="text-[11px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-1.5">Brand image</h4>
        {resolvedLogo ? (
          <div className="rounded-md border border-evari-edge/30 bg-evari-ink overflow-hidden">
            <div
              className="w-full aspect-[5/3] flex items-center justify-center bg-zinc-900"
              style={{ backgroundColor: block.backgroundColor }}
              aria-label="Brand logo preview"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolvedLogo} alt="" className="max-h-[80%] max-w-[80%] object-contain" />
            </div>
            <div className="flex items-center gap-1 p-1.5">
              <button type="button" onClick={() => setLogoPickerOpen(true)} className="text-[10px] text-evari-gold hover:underline px-1">
                {usingBrandDefault ? 'Override' : 'Replace'}
              </button>
              {!usingBrandDefault ? (
                <button type="button" onClick={() => onChange({ logoUrl: '' })} className="text-[10px] text-evari-dim hover:text-evari-text px-1">
                  Reset to brand
                </button>
              ) : null}
              <span className="text-[10px] text-evari-dimmer ml-auto">{usingBrandDefault ? 'Brand kit · light logo' : 'Custom override'}</span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLogoPickerOpen(true)}
            className="w-full aspect-[5/3] rounded-md border-2 border-dashed border-evari-edge/30 flex flex-col items-center justify-center gap-1 text-[11px] text-evari-dim hover:text-evari-text hover:border-evari-gold/60 transition-colors"
          >
            <FolderOpen className="h-5 w-5" />
            <span>No brand logo set — choose one</span>
          </button>
        )}
      </section>
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
      {logoPickerOpen ? (
        <AssetPickerModal
          onClose={() => setLogoPickerOpen(false)}
          onPick={(url) => { onChange({ logoUrl: url }); setLogoPickerOpen(false); }}
        />
      ) : null}
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


/**
 * Klaviyo-style 3x3 background-position picker. The 9 dots map to the
 * 9 named CSS background-position values; the active one is filled.
 */
function PositionGrid({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const cells: { v: string; label: string }[] = [
    { v: 'top left',     label: 'Top left' },
    { v: 'top',          label: 'Top centre' },
    { v: 'top right',    label: 'Top right' },
    { v: 'left',         label: 'Centre left' },
    { v: 'center',       label: 'Centre' },
    { v: 'right',        label: 'Centre right' },
    { v: 'bottom left',  label: 'Bottom left' },
    { v: 'bottom',       label: 'Bottom centre' },
    { v: 'bottom right', label: 'Bottom right' },
  ];
  return (
    <div
      className={cn(
        'inline-grid grid-cols-3 gap-0.5 p-1.5 rounded-md border border-evari-edge/30 bg-evari-ink',
        disabled && 'opacity-40 pointer-events-none',
      )}
      role="radiogroup"
      aria-label="Background position"
    >
      {cells.map((c) => {
        const active = value === c.v;
        return (
          <button
            key={c.v}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={c.label}
            title={c.label}
            onClick={() => onChange(c.v)}
            className={cn(
              'h-6 w-6 rounded-sm flex items-center justify-center transition-colors',
              active ? 'bg-evari-gold/20' : 'hover:bg-evari-edge/30',
            )}
          >
            <span
              className={cn(
                'block rounded-full transition-all',
                active ? 'h-2.5 w-2.5 bg-evari-gold' : 'h-1.5 w-1.5 bg-evari-dim',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

function SectionFields({ block, brand, designWidthPx, onChange }: { block: Extract<EmailBlock, { type: 'section' }>; brand: MarketingBrand; designWidthPx: number; onChange: (p: Partial<Extract<EmailBlock, { type: 'section' }>>) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fitting, setFitting] = useState(false);
  const childCount = (block.blocks ?? []).length;

  // Loads the bg image, reads its natural ratio, and sets minHeightPx so
  // the section frames the image at the current content width with no crop.
  const fitToImageRatio = useCallback(() => {
    if (!block.backgroundImage) return;
    setFitting(true);
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setFitting(false);
      if (!img.naturalWidth || !img.naturalHeight) return;
      const ratio = img.naturalHeight / img.naturalWidth;
      // Subtract horizontal padding from the available width so the image
      // visually matches the section's content area.
      const innerWidth = Math.max(40, designWidthPx - (block.paddingPx * 2));
      const target = Math.round(innerWidth * ratio);
      onChange({ minHeightPx: target, backgroundSize: 'fill' });
    };
    img.onerror = () => setFitting(false);
    img.src = block.backgroundImage;
  }, [block.backgroundImage, block.paddingPx, designWidthPx, onChange]);

  // Normalise legacy CSS values into the Klaviyo-style fill modes for the dropdown.
  const fillModeRaw = block.backgroundSize ?? 'fill';
  const fillMode: 'original' | 'fit' | 'fill' | 'tile' =
    fillModeRaw === 'auto'    ? 'original' :
    fillModeRaw === 'contain' ? 'fit' :
    fillModeRaw === 'cover'   ? 'fill' :
    (fillModeRaw as 'original' | 'fit' | 'fill' | 'tile');
  const position = block.backgroundPosition ?? 'center';
  const tileDisabled = fillMode === 'tile';
  const fill = bgFillCss(block.backgroundSize);
  return (
    <div className="space-y-3">
      {/* Background image — Klaviyo-style preview tile + tools */}
      <section>
        <h4 className="text-[11px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-1.5">Background image</h4>
        {block.backgroundImage ? (
          <div className="rounded-md overflow-hidden">
            {/* Live 5:3 preview reflecting current fill + position. No outline
                around the image — sits flush like a real preview. */}
            <div
              className="w-full aspect-[5/3] rounded-md"
              style={{
                backgroundImage: `url(${block.backgroundImage})`,
                backgroundSize: block.backgroundWidthPct && block.backgroundSize !== 'tile' ? `${block.backgroundWidthPct}% auto` : fill.size,
                backgroundRepeat: fill.repeat,
                backgroundPosition: position,
                backgroundColor: block.backgroundColor,
              }}
              aria-label="Background image preview"
            />
            <div className="flex items-center gap-2 pt-1.5">
              <button type="button" onClick={() => setPickerOpen(true)} className="text-[11px] text-evari-gold hover:underline">Replace image</button>
              <button type="button" onClick={() => onChange({ backgroundImage: '' })} className="text-[11px] text-evari-dim hover:text-evari-danger ml-auto">Remove</button>
            </div>
            <button
              type="button"
              onClick={fitToImageRatio}
              disabled={fitting}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-md bg-evari-gold/15 text-evari-gold border border-evari-gold/40 text-[12px] font-medium hover:bg-evari-gold/25 hover:border-evari-gold/70 disabled:opacity-50 transition-colors"
              title="Resize the section to match the image's aspect ratio so it fills exactly with no crop"
            >
              {fitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Maximize2 className="h-4 w-4" />}
              Fit section to image ratio
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full aspect-[5/3] rounded-md border-2 border-dashed border-evari-edge/30 flex flex-col items-center justify-center gap-1 text-[11px] text-evari-dim hover:text-evari-text hover:border-evari-gold/60 transition-colors"
          >
            <FolderOpen className="h-5 w-5" />
            <span>Browse asset library</span>
          </button>
        )}
        <label className="block mt-1.5">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Or paste a URL</span>
          <input type="url" value={block.backgroundImage ?? ''} onChange={(e) => onChange({ backgroundImage: e.target.value })} className={cn(inputCls, 'font-mono text-[12px]')} />
        </label>
        <div className="mt-2">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Fill</span>
            <select
              value={fillMode}
              onChange={(e) => onChange({ backgroundSize: e.target.value as 'original' | 'fit' | 'fill' | 'tile' })}
              className={inputCls}
            >
              <option value="original">Original size</option>
              <option value="fit">Fit</option>
              <option value="fill">Fill</option>
              <option value="tile">Tile</option>
            </select>
          </label>
        </div>
        {fillMode !== 'tile' ? (
          <div className="mt-2">
            <SliderField
              label={`Image width${block.backgroundWidthPct ? '' : ' (auto)'}`}
              value={block.backgroundWidthPct ?? 100}
              min={10}
              max={200}
              suffix="%"
              onChange={(v) => onChange({ backgroundWidthPct: v })}
            />
            {block.backgroundWidthPct ? (
              <button
                type="button"
                onClick={() => onChange({ backgroundWidthPct: undefined })}
                className="mt-1 text-[10px] text-evari-dim hover:text-evari-text underline"
                title="Clear the width override and let the fill mode decide"
              >
                Clear width override
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="mt-2">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Position</span>
          <PositionGrid
            value={position}
            disabled={tileDisabled}
            onChange={(v) => onChange({ backgroundPosition: v })}
          />
          {tileDisabled ? (
            <p className="text-[10px] text-evari-dimmer mt-1">Position is ignored when the image tiles.</p>
          ) : null}
        </div>
      </section>

      {/* Colours */}
      <section>
        <h4 className="text-[11px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-1.5">Colours</h4>
        <div className="grid grid-cols-2 gap-2">
          <ColourField label="Background" value={block.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} brand={brand} />
          <ColourField label="Text on top" value={block.contentColor ?? '#ffffff'} onChange={(v) => onChange({ contentColor: v })} brand={brand} />
        </div>
      </section>

      {/* Size + alignment */}
      <section>
        <h4 className="text-[11px] font-semibold text-evari-text uppercase tracking-[0.1em] mb-1.5">Size + alignment</h4>
        <SliderField label="Height (min)" value={block.minHeightPx ?? 0} min={0} max={800} suffix="px" onChange={(v) => onChange({ minHeightPx: v })} />
        <SliderField label="Inner padding" value={block.paddingPx} min={0} max={120} suffix="px" onChange={(v) => onChange({ paddingPx: v })} />
        <SliderField label="Corner radius" value={block.borderRadiusPx} min={0} max={40} suffix="px" onChange={(v) => onChange({ borderRadiusPx: v })} />
        <div className="mt-2">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Content vertical position</span>
          <div className="grid grid-cols-3 gap-1 rounded-md bg-evari-ink p-1 border border-evari-edge/30" role="radiogroup" aria-label="Vertical alignment">
            {(['top', 'middle', 'bottom'] as const).map((opt) => {
              const active = (block.contentAlignY ?? 'top') === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ contentAlignY: opt })}
                  className={cn(
                    'text-[11px] py-1 rounded transition-colors capitalize',
                    active ? 'bg-evari-gold/20 text-evari-gold' : 'text-evari-dim hover:text-evari-text',
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>
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
