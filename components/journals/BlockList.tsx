'use client';

import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Trash2,
  Sparkles,
  Plus,
  Type,
  Heading2,
  List as ListIcon,
  Image as ImageIcon,
  Images,
  Quote as QuoteIcon,
  Minus,
  Loader2,
  X,
  Film,
  FolderOpen,
  ArrowUpDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { JournalBlock } from './ShopifyPreview';

/**
 * Alignment pill group for image / doubleImage / video blocks.
 * Three options: range left, centre, range right. Only meaningful
 * when width < 100% — at full width the figure fills the column
 * and alignment is a no-op visually. We still let the user set it
 * because it persists through width changes.
 */
function AlignPills({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: 'left' | 'center' | 'right') => void;
}) {
  const current = (value === 'left' || value === 'right' ? value : 'center') as
    | 'left'
    | 'center'
    | 'right';
  const opts: Array<{ key: 'left' | 'center' | 'right'; Icon: typeof AlignLeft; label: string }> = [
    { key: 'left', Icon: AlignLeft, label: 'Range left' },
    { key: 'center', Icon: AlignCenter, label: 'Centre' },
    { key: 'right', Icon: AlignRight, label: 'Range right' },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 bg-[rgb(var(--evari-trough))] rounded-full p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-label={o.label}
          title={o.label}
          className={cn(
            'h-7 w-9 inline-flex items-center justify-center rounded-full transition-colors',
            current === o.key
              ? 'bg-evari-surfaceSoft text-evari-text'
              : 'text-evari-dim hover:text-evari-text',
          )}
        >
          <o.Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

/**
 * Width pill group shared by image / doubleImage / video block
 * cards. Renders the four width presets — sm 33% / md 50% / lg
 * 75% / full 100% — and writes the chosen key onto block.data.width.
 * The same key is read by ShopifyPreview + editorToHtml so the
 * preview, the live composer card, and the published HTML all
 * paint the figure at the same width.
 */
function WidthPills({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: 'sm' | 'md' | 'lg' | 'full') => void;
}) {
  const current = (value && ['sm', 'md', 'lg', 'full'].includes(value) ? value : 'full') as
    | 'sm'
    | 'md'
    | 'lg'
    | 'full';
  const opts: Array<{ key: 'sm' | 'md' | 'lg' | 'full'; label: string }> = [
    { key: 'sm', label: 'Small' },
    { key: 'md', label: 'Half' },
    { key: 'lg', label: 'Wide' },
    { key: 'full', label: 'Full' },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 bg-[rgb(var(--evari-trough))] rounded-full p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            'px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] font-semibold transition-colors',
            current === o.key
              ? 'bg-evari-surfaceSoft text-evari-text'
              : 'text-evari-dim hover:text-evari-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Shared input chrome for every editable surface inside a block
 * card. Matches the app-wide input-fill convention (bg shifts with
 * theme, no visible border, focus brightens). Kept local so the
 * BlockList file is self-contained.
 */
const INPUT_CLS =
  'w-full rounded-md px-3 py-2 text-sm bg-[rgb(var(--evari-input-fill))] text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:bg-[rgb(var(--evari-input-fill-focus))] transition-colors';
const INPUT_SM_CLS =
  'w-full rounded-md px-2 py-1.5 text-xs bg-[rgb(var(--evari-input-fill))] text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:bg-[rgb(var(--evari-input-fill-focus))] transition-colors';

/**
 * When the user asks to insert from the Shopify media library, we need
 * to tell the parent which block slot to write into. For single-image
 * and video blocks, `slot` is omitted. For double-image blocks, the
 * parent uses `slot` to know which side of the block to update.
 */
export interface MediaTarget {
  blockId: string;
  slot?: 'left' | 'right';
  /** What kinds of files make sense in this target. */
  accept: 'image' | 'video' | 'any';
}

interface Props {
  blocks: JournalBlock[];
  onChange: (next: JournalBlock[]) => void;
  /** AI context passed straight to /api/journals/ai-compose. */
  articleTitle: string;
  articleSummary?: string;
  blogLane: string;
  /** Opens the Shopify media library drawer. The parent decides how
   *  to handle the resulting file pick. */
  onOpenMediaLibrary?: (target: MediaTarget) => void;
  /** Fires when a card is clicked or an input inside a card gets
   *  focus — parent uses it to scroll the matching preview block
   *  into view. */
  onFocusBlock?: (blockId: string) => void;
}

const BLOCK_TYPES: {
  type: JournalBlock['type'];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  init: () => Record<string, unknown>;
}[] = [
  { type: 'paragraph', label: 'Text', icon: Type, init: () => ({ text: '' }) },
  { type: 'header', label: 'Heading', icon: Heading2, init: () => ({ text: '', level: 2 }) },
  { type: 'list', label: 'List', icon: ListIcon, init: () => ({ style: 'unordered', items: [''] }) },
  { type: 'image', label: 'Image', icon: ImageIcon, init: () => ({ file: { url: '' }, caption: '' }) },
  { type: 'doubleImage', label: 'Double image', icon: Images, init: () => ({ left: { url: '', caption: '' }, right: { url: '', caption: '' } }) },
  { type: 'video', label: 'Video', icon: Film, init: () => ({ url: '', poster: '', caption: '' }) },
  { type: 'quote', label: 'Quote', icon: QuoteIcon, init: () => ({ text: '', caption: '' }) },
  { type: 'spacer', label: 'Spacer', icon: ArrowUpDown, init: () => ({ size: 'md' }) },
  { type: 'delimiter', label: 'Divider', icon: Minus, init: () => ({}) },
];

function newId(): string {
  return 'b_' + Math.random().toString(36).slice(2, 10);
}

/**
 * Build plain-text context the AI endpoint uses to stay coherent
 * with the rest of the article when rewriting a single block.
 */
function articleContext(blocks: JournalBlock[], skipId?: string): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.id === skipId) continue;
    if (b.type === 'paragraph' || b.type === 'quote') {
      const t = String(b.data.text ?? '').trim();
      if (t) parts.push(t);
    } else if (b.type === 'header') {
      const t = String(b.data.text ?? '').trim();
      if (t) parts.push(`## ${t}`);
    } else if (b.type === 'list') {
      const items = Array.isArray(b.data.items) ? (b.data.items as string[]) : [];
      parts.push(items.map((i) => `- ${i}`).join('\n'));
    }
  }
  return parts.join('\n\n');
}

export function BlockList({
  blocks,
  onChange,
  articleTitle,
  articleSummary,
  blogLane,
  onOpenMediaLibrary,
  onFocusBlock,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [addMenu, setAddMenu] = useState(false);

  function onDragEnd(ev: DragEndEvent) {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === active.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(blocks, from, to));
  }

  function updateBlock(id: string, data: Record<string, unknown>) {
    onChange(blocks.map((b) => (b.id === id ? { ...b, data } : b)));
  }
  function deleteBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
  }
  function addBlock(type: JournalBlock['type']) {
    const def = BLOCK_TYPES.find((b) => b.type === type);
    if (!def) return;
    onChange([...blocks, { id: newId(), type, data: def.init() }]);
    setAddMenu(false);
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((b) => (
            <SortableCard
              key={b.id}
              block={b}
              articleTitle={articleTitle}
              articleSummary={articleSummary}
              blogLane={blogLane}
              otherContext={articleContext(blocks, b.id)}
              onChange={(data) => updateBlock(b.id, data)}
              onDelete={() => deleteBlock(b.id)}
              onOpenMediaLibrary={onOpenMediaLibrary}
              onFocusBlock={onFocusBlock}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add block menu */}
      <div className="relative">
        {addMenu ? (
          <div className="rounded-lg bg-evari-surface/40 p-2">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dim font-semibold">
                Add block
              </span>
              <button
                onClick={() => setAddMenu(false)}
                className="text-evari-dimmer hover:text-evari-text"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {BLOCK_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.type}
                    onClick={() => addBlock(t.type)}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-evari-text hover:bg-[rgb(var(--evari-input-fill-focus))] transition-colors"
                  >
                    <Icon className="h-3.5 w-3.5 text-evari-dim" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddMenu(true)}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md bg-[rgb(var(--evari-input-fill))] text-evari-dim hover:text-evari-text hover:bg-[rgb(var(--evari-input-fill-focus))] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add block
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sortable card
// ─────────────────────────────────────────────────────────────────────

function SortableCard(props: {
  block: JournalBlock;
  articleTitle: string;
  articleSummary?: string;
  blogLane: string;
  otherContext: string;
  onChange: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  onOpenMediaLibrary?: (target: MediaTarget) => void;
  onFocusBlock?: (blockId: string) => void;
}) {
  const { block } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const def = BLOCK_TYPES.find((b) => b.type === block.type);
  const Icon = def?.icon ?? Type;
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);

  async function runAi(kindHint: 'text' | 'caption' = 'text') {
    const hasText =
      block.type === 'paragraph' ||
      block.type === 'header' ||
      block.type === 'list' ||
      block.type === 'quote' ||
      block.type === 'image' ||
      block.type === 'doubleImage';
    if (!hasText) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const currentText =
        kindHint === 'caption'
          ? String((block.data as { caption?: string }).caption ?? '')
          : block.type === 'list'
            ? (block.data.items as string[] | undefined)?.join('\n') ?? ''
            : String(block.data.text ?? '');
      const res = await fetch('/api/journals/ai-compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'block',
          blockKind:
            kindHint === 'caption'
              ? 'image-caption'
              : block.type === 'header'
                ? 'header'
                : block.type === 'list'
                  ? 'list'
                  : block.type === 'quote'
                    ? 'quote'
                    : 'paragraph',
          currentText,
          instruction: aiInstruction,
          context: {
            articleTitle: props.articleTitle,
            articleSummary: props.articleSummary,
            blogLane: props.blogLane,
            articleContext: props.otherContext,
          },
        }),
      });
      const data = (await res.json()) as { ok?: boolean; text?: string; error?: string };
      if (!data.ok || typeof data.text !== 'string') {
        throw new Error(data.error ?? 'AI returned nothing');
      }
      if (kindHint === 'caption') {
        props.onChange({ ...block.data, caption: data.text });
      } else if (block.type === 'list') {
        const items = data.text
          .split('\n')
          .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
          .filter(Boolean);
        props.onChange({ ...block.data, items });
      } else {
        props.onChange({ ...block.data, text: data.text });
      }
      setAiOpen(false);
      setAiInstruction('');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Rewrite failed');
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      // Clicking anywhere on the card — and focusing any input
      // inside it — flags this block so the parent can scroll the
      // matching preview element into view. onFocus bubbles from
      // textareas / inputs, so we only need the handler on the
      // root.
      onClick={() => props.onFocusBlock?.(block.id)}
      onFocus={() => props.onFocusBlock?.(block.id)}
      className={cn(
        'rounded-lg bg-evari-surface/40 transition-shadow',
        isDragging ? 'shadow-[0_8px_24px_rgba(0,0,0,0.4)] ring-1 ring-evari-gold/40 z-10' : '',
      )}
    >
      {/* Card header — drag handle, type label, AI, delete */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          {...attributes}
          {...listeners}
          className="p-1 rounded text-evari-dimmer hover:text-evari-text cursor-grab active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-evari-dim font-semibold flex-1">
          <Icon className="h-3 w-3" />
          {def?.label ?? block.type}
        </div>
        {block.type !== 'delimiter' ? (
          <button
            onClick={() => setAiOpen((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] font-semibold px-2 py-1 rounded transition-colors',
              aiOpen
                ? 'bg-evari-gold text-evari-goldInk'
                : 'text-evari-gold hover:bg-evari-gold/15',
            )}
          >
            <Sparkles className="h-3 w-3" />
            AI
          </button>
        ) : null}
        <button
          onClick={props.onDelete}
          className="p-1 rounded text-evari-dimmer hover:text-evari-warn transition-colors"
          aria-label="Delete block"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* AI instruction strip */}
      {aiOpen ? (
        <div className="mx-2 mb-2 rounded-md bg-evari-gold/10 ring-1 ring-evari-gold/30 p-2.5 space-y-2">
          <textarea
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            rows={2}
            placeholder={
              (block.data as { text?: string }).text
                ? 'e.g. "tighten this" / "make it 3 sentences" / "rewrite in Tom\u2019s voice"'
                : 'e.g. "write a 3-sentence intro about the Samurai paint process"'
            }
            className={cn(INPUT_CLS, 'resize-none')}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-evari-dimmer">
              {aiError ?? 'Runs through Claude, Evari voice, no em-dashes.'}
            </span>
            <button
              onClick={() => runAi('text')}
              disabled={aiBusy}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-evari-gold text-evari-goldInk disabled:opacity-60"
            >
              {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {aiBusy ? 'Writing…' : 'Write'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Card body — switches on block type */}
      <div className="p-3">
        <BlockBody
          block={block}
          onChange={props.onChange}
          onRunAiCaption={() => runAi('caption')}
          onOpenMediaLibrary={props.onOpenMediaLibrary}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-type editable bodies
// ─────────────────────────────────────────────────────────────────────

function BlockBody({
  block,
  onChange,
  onRunAiCaption,
  onOpenMediaLibrary,
}: {
  block: JournalBlock;
  onChange: (data: Record<string, unknown>) => void;
  onRunAiCaption?: () => void;
  onOpenMediaLibrary?: (target: MediaTarget) => void;
}) {
  const d = block.data;
  switch (block.type) {
    case 'paragraph':
      return (
        <textarea
          value={String(d.text ?? '')}
          onChange={(e) => onChange({ ...d, text: e.target.value })}
          rows={3}
          placeholder="Write a paragraph…"
          className={cn(INPUT_CLS, 'resize-y min-h-[76px]')}
        />
      );
    case 'header':
      return (
        <div className="flex gap-2">
          <select
            value={Number(d.level ?? 2)}
            onChange={(e) => onChange({ ...d, level: Number(e.target.value) })}
            className={cn(INPUT_SM_CLS, 'w-auto appearance-none cursor-pointer pr-6 font-semibold')}
          >
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
            <option value={4}>H4</option>
          </select>
          <input
            value={String(d.text ?? '')}
            onChange={(e) => onChange({ ...d, text: e.target.value })}
            placeholder="Heading"
            className={cn(INPUT_CLS, 'flex-1 font-semibold')}
          />
        </div>
      );
    case 'list':
      return (
        <div className="space-y-2">
          <div className="inline-flex items-center gap-0.5 bg-[rgb(var(--evari-trough))] rounded-full p-0.5">
            <button
              onClick={() => onChange({ ...d, style: 'unordered' })}
              className={cn(
                'px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] font-semibold transition-colors',
                d.style === 'unordered'
                  ? 'bg-evari-surfaceSoft text-evari-text'
                  : 'text-evari-dim hover:text-evari-text',
              )}
            >
              Bulleted
            </button>
            <button
              onClick={() => onChange({ ...d, style: 'ordered' })}
              className={cn(
                'px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] font-semibold transition-colors',
                d.style === 'ordered'
                  ? 'bg-evari-surfaceSoft text-evari-text'
                  : 'text-evari-dim hover:text-evari-text',
              )}
            >
              Numbered
            </button>
          </div>
          <textarea
            value={(Array.isArray(d.items) ? (d.items as string[]) : []).join('\n')}
            onChange={(e) =>
              onChange({
                ...d,
                items: e.target.value.split('\n'),
              })
            }
            rows={4}
            placeholder="One item per line"
            className={cn(INPUT_CLS, 'resize-y')}
          />
        </div>
      );
    case 'image': {
      const file = (d.file as { url?: string } | undefined) ?? {};
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <WidthPills
              value={d.width as string | undefined}
              onChange={(w) => onChange({ ...d, width: w })}
            />
            <AlignPills
              value={d.align as string | undefined}
              onChange={(a) => onChange({ ...d, align: a })}
            />
          </div>
          {file.url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={file.url}
              alt=""
              // Match the main preview's image crop so what Craig
              // sees in this sidebar thumbnail is framed identically
              // to how it will render in the published article.
              className="w-full object-cover rounded-md"
              style={{ aspectRatio: '16 / 10' }}
            />
          ) : null}
          {onOpenMediaLibrary ? (
            <button
              type="button"
              onClick={() =>
                onOpenMediaLibrary({ blockId: block.id, accept: 'image' })
              }
              className="w-full inline-flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md bg-[rgb(var(--evari-input-fill))] text-evari-dim hover:text-evari-text hover:bg-[rgb(var(--evari-input-fill-focus))] transition-colors"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Pick from Shopify library
            </button>
          ) : null}
          <input
            value={file.url ?? ''}
            onChange={(e) => onChange({ ...d, file: { ...file, url: e.target.value } })}
            placeholder="…or paste image URL"
            className={INPUT_CLS}
          />
          <div className="flex gap-2">
            <input
              value={String(d.caption ?? '')}
              onChange={(e) => onChange({ ...d, caption: e.target.value })}
              placeholder="Caption (optional)"
              className={cn(INPUT_CLS, 'flex-1')}
            />
            {onRunAiCaption ? (
              <button
                onClick={onRunAiCaption}
                title="AI caption"
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] font-semibold px-2.5 rounded-md text-evari-gold hover:bg-evari-gold/15 transition-colors"
              >
                <Sparkles className="h-3 w-3" /> AI
              </button>
            ) : null}
          </div>
        </div>
      );
    }
    case 'doubleImage': {
      const left = (d.left as { url?: string; caption?: string } | undefined) ?? {};
      const right = (d.right as { url?: string; caption?: string } | undefined) ?? {};
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <WidthPills
              value={d.width as string | undefined}
              onChange={(w) => onChange({ ...d, width: w })}
            />
            <AlignPills
              value={d.align as string | undefined}
              onChange={(a) => onChange({ ...d, align: a })}
            />
          </div>
        <div className="grid grid-cols-2 gap-2">
          {(['left', 'right'] as const).map((side) => {
            const v = side === 'left' ? left : right;
            return (
              <div key={side} className="space-y-2">
                {v.url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={v.url}
                    alt=""
                    className="w-full aspect-[16/10] object-cover rounded-md"
                  />
                ) : (
                  <div className="w-full aspect-[16/10] rounded-md bg-[rgb(var(--evari-input-fill))]" />
                )}
                {onOpenMediaLibrary ? (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenMediaLibrary({ blockId: block.id, slot: side, accept: 'image' })
                    }
                    className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium rounded-md bg-[rgb(var(--evari-input-fill))] text-evari-dim hover:text-evari-text hover:bg-[rgb(var(--evari-input-fill-focus))] transition-colors"
                  >
                    <FolderOpen className="h-3 w-3" />
                    Library
                  </button>
                ) : null}
                <input
                  value={v.url ?? ''}
                  onChange={(e) => onChange({ ...d, [side]: { ...v, url: e.target.value } })}
                  placeholder={`${side} image URL`}
                  className={INPUT_SM_CLS}
                />
                <input
                  value={v.caption ?? ''}
                  onChange={(e) => onChange({ ...d, [side]: { ...v, caption: e.target.value } })}
                  placeholder="Caption"
                  className={INPUT_SM_CLS}
                />
              </div>
            );
          })}
        </div>
        </div>
      );
    }
    case 'video': {
      const vUrl = String(d.url ?? '');
      const poster = String(d.poster ?? '');
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <WidthPills
              value={d.width as string | undefined}
              onChange={(w) => onChange({ ...d, width: w })}
            />
            <AlignPills
              value={d.align as string | undefined}
              onChange={(a) => onChange({ ...d, align: a })}
            />
          </div>
          {vUrl ? (
            <video
              src={vUrl}
              poster={poster || undefined}
              controls
              playsInline
              className="w-full rounded-md object-cover"
              style={{ aspectRatio: '16 / 10' }}
            />
          ) : null}
          {onOpenMediaLibrary ? (
            <button
              type="button"
              onClick={() =>
                onOpenMediaLibrary({ blockId: block.id, accept: 'video' })
              }
              className="w-full inline-flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md bg-[rgb(var(--evari-input-fill))] text-evari-dim hover:text-evari-text hover:bg-[rgb(var(--evari-input-fill-focus))] transition-colors"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Pick from Shopify library
            </button>
          ) : null}
          <input
            value={vUrl}
            onChange={(e) => onChange({ ...d, url: e.target.value })}
            placeholder="…or paste video URL (.mp4)"
            className={INPUT_CLS}
          />
          <input
            value={poster}
            onChange={(e) => onChange({ ...d, poster: e.target.value })}
            placeholder="Poster / thumbnail URL (optional)"
            className={INPUT_SM_CLS}
          />
          <input
            value={String(d.caption ?? '')}
            onChange={(e) => onChange({ ...d, caption: e.target.value })}
            placeholder="Caption (optional)"
            className={INPUT_CLS}
          />
        </div>
      );
    }
    case 'quote':
      return (
        <div className="space-y-2">
          <textarea
            value={String(d.text ?? '')}
            onChange={(e) => onChange({ ...d, text: e.target.value })}
            rows={3}
            placeholder="The quote"
            className={cn(INPUT_CLS, 'italic resize-y')}
          />
          <input
            value={String(d.caption ?? '')}
            onChange={(e) => onChange({ ...d, caption: e.target.value })}
            placeholder="Attribution (optional)"
            className={cn(INPUT_SM_CLS, 'text-evari-dim')}
          />
        </div>
      );
    case 'delimiter':
      return (
        <div className="h-px bg-[rgb(var(--evari-edge))]" aria-hidden />
      );
    case 'spacer': {
      const size = d.size as 'sm' | 'md' | 'lg' | number | undefined;
      const current = typeof size === 'number' ? 'custom' : size ?? 'md';
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-0.5 bg-[rgb(var(--evari-trough))] rounded-full p-0.5 w-fit">
            {([
              { key: 'sm', label: 'Small' },
              { key: 'md', label: 'Medium' },
              { key: 'lg', label: 'Large' },
              { key: 'custom', label: 'Custom' },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() =>
                  onChange({
                    ...d,
                    size: opt.key === 'custom' ? (typeof size === 'number' ? size : 24) : opt.key,
                  })
                }
                className={cn(
                  'px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] font-semibold transition-colors',
                  current === opt.key
                    ? 'bg-evari-surfaceSoft text-evari-text'
                    : 'text-evari-dim hover:text-evari-text',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {typeof size === 'number' ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={240}
                value={size}
                onChange={(e) =>
                  onChange({
                    ...d,
                    size: Math.max(1, Math.min(240, Number(e.target.value) || 1)),
                  })
                }
                className={cn(INPUT_SM_CLS, 'w-24')}
              />
              <span className="text-[11px] text-evari-dim">px tall</span>
            </div>
          ) : null}
          <div
            aria-hidden
            className="w-full rounded-md bg-[rgb(var(--evari-input-fill))] border border-dashed border-evari-edge"
            style={{
              height:
                typeof size === 'number'
                  ? `${size}px`
                  : size === 'sm'
                    ? '12px'
                    : size === 'lg'
                      ? '64px'
                      : '32px',
            }}
          />
        </div>
      );
    }
    default:
      return null;
  }
}
