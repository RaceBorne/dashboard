'use client';

import {
  DndContext,
  type DragEndEvent,
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
import { Facebook, GripVertical, Link2, Share2 } from 'lucide-react';

export interface JournalBlock {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

/** Image-block width presets shared across preview + serializer. */
export const FIGURE_WIDTH_PERCENT: Record<string, number> = {
  sm: 33,
  md: 50,
  lg: 75,
  full: 100,
};
function figureStyle(
  width: unknown,
  align: unknown,
): React.CSSProperties | undefined {
  const pct = typeof width === 'string' ? FIGURE_WIDTH_PERCENT[width] : undefined;
  if (!pct || pct === 100) return undefined;
  const a = align === 'left' || align === 'right' ? align : 'center';
  return {
    maxWidth: `${pct}%`,
    marginLeft: a === 'left' ? 0 : 'auto',
    marginRight: a === 'right' ? 0 : 'auto',
  };
}

interface Props {
  title: string;
  author?: string | null;
  publishedAt?: string | null;
  coverImageUrl?: string | null;
  blocks: JournalBlock[];
  subLabel?: string | null;
  /** Article summary — rendered as a lede paragraph below the title
   *  so a break the author types in the Summary textarea is visible
   *  in the preview. */
  summary?: string | null;
  /** When the user clicks a figure (image / double-image / video) in
   *  the preview, the editor uses this to open a width popover next
   *  to the clicked element. */
  onImageClick?: (blockId: string, anchor: HTMLElement) => void;
  /** Optional reorder hook. When supplied, each preview block grows
   *  a left-margin grip handle and the body becomes a dnd-kit sortable
   *  list. The editor passes a callback that re-sequences its `blocks`
   *  state. Reader views (no editing) leave this undefined. */
  onReorder?: (orderedIds: string[]) => void;
}

/**
 * Live, Shopify-faithful preview of the Journal article.
 *
 * Typography and rhythm are tuned to mirror the evari.cc storefront
 * blog post layout: big cover, sub-label badge across the cover,
 * share strip, large serif-weighted title, 2-to-4-line paragraphs,
 * inset images, and the "By <author>" byline.
 *
 * Every block type maps 1:1 to the HTML the Shopify publish path
 * produces (via `lib/journals/editorToHtml`). If you add a block
 * type, add its JSX here and its HTML there in lockstep.
 */
export function ShopifyPreview({
  title,
  author,
  publishedAt,
  coverImageUrl,
  blocks,
  subLabel,
  summary,
  onImageClick,
  onReorder,
}: Props) {
  // Drag-reorder is opt-in. Sensors are stable across renders, so we
  // wire them at the top of the component and reuse for every block
  // even when onReorder is undefined (no DndContext mounts in that
  // case, so the sensors are simply unused).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const handleDragEnd = (ev: DragEndEvent) => {
    if (!onReorder) return;
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === active.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(blocks, from, to).map((b) => b.id));
  };
  return (
    <article className="shopify-preview">
      {/* Hero — full-bleed image with title overlaid. Mirrors the
          evari.cc Shopify article-template__header--overlay layout:
          big cover that fills the canvas, dark gradient overlay,
          title + meta sitting in the lower portion. */}
      <header className="shopify-preview__hero">
        {coverImageUrl ? (
          <div className="shopify-preview__hero-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverImageUrl} alt={title} />
          </div>
        ) : (
          <div className="shopify-preview__hero-image shopify-preview__hero-image--empty" />
        )}
        <div className="shopify-preview__hero-overlay" aria-hidden="true" />
        <div className="shopify-preview__hero-info">
          {subLabel ? (
            <span className="shopify-preview__sublabel">{subLabel}</span>
          ) : null}
          <h1 className="shopify-preview__title">
            {title.trim() || 'Untitled article'}
          </h1>
          {summary && summary.trim() ? (
            <p
              className="shopify-preview__lede"
              style={{ whiteSpace: 'pre-line' }}
            >
              {summary}
            </p>
          ) : null}
          <div className="shopify-preview__meta">
            {(author ?? '').trim() ? (
              <span className="shopify-preview__meta-item">By {author}</span>
            ) : null}
            {publishedAt ? (
              <span className="shopify-preview__meta-item">
                {new Date(publishedAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {/* Body — narrow centered column at ~741px max-width to match
          evari.cc's article-template__content-rte. Outer container
          enforces the 1396px page-width with 50px side padding. */}
      <div className="shopify-preview__container">
        <div className="shopify-preview__share">
          <span>Share:</span>
          <Share2 size={14} />
          <Facebook size={14} />
          <Link2 size={14} />
        </div>
        <div className="shopify-preview__body">
        {blocks.length === 0 ? (
          <p className="shopify-preview__empty">
            Your article will appear here as you add blocks on the right.
          </p>
        ) : onReorder ? (
          // Editable mode — blocks are draggable. We mount one
          // DndContext + SortableContext that wraps every block,
          // and each block grows a left-margin grip handle.
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={blocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              {blocks.map((b) => (
                <SortablePreviewBlock
                  key={b.id}
                  block={b}
                  onImageClick={onImageClick}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          blocks.map((b) => (
            // Read-only mode (reader view, share link). Plain wrapper
            // so the cross-pane scroll-to anchor still works.
            <div key={b.id} id={`j-block-${b.id}`} data-journal-block>
              <PreviewBlock block={b} onImageClick={onImageClick} />
            </div>
          ))
        )}
        </div>
      </div>
    </article>
  );
}

function PreviewBlock({
  block,
  onImageClick,
}: {
  block: JournalBlock;
  onImageClick?: (blockId: string, anchor: HTMLElement) => void;
}) {
  const { type, data } = block;
  const handleFigureClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!onImageClick) return;
    e.stopPropagation();
    onImageClick(block.id, e.currentTarget);
  };
  switch (type) {
    case 'paragraph': {
      const text = String(data.text ?? '');
      if (!text.trim()) {
        return (
          <p className="shopify-preview__placeholder">
            Empty paragraph. Write something on the right.
          </p>
        );
      }
      // `whitespace-pre-line` honours every \n the author typed so
      // a soft return inside a paragraph paints as a real line
      // break in the preview + publishes with matching <br>s.
      return (
        <p
          className="shopify-preview__p"
          style={{ whiteSpace: 'pre-line' }}
          // Safe: the text is either plain or EditorJS inline HTML which
          // we already allow (b, i, a, code). Preview-only.
          dangerouslySetInnerHTML={{ __html: text }}
        />
      );
    }
    case 'header': {
      const level = Math.max(1, Math.min(4, Number(data.level ?? 2)));
      const text = String(data.text ?? '');
      if (!text.trim()) {
        return (
          <p className="shopify-preview__placeholder">Empty heading</p>
        );
      }
      if (level === 1) return <h1 className="shopify-preview__h1">{text}</h1>;
      if (level === 2) return <h2 className="shopify-preview__h2">{text}</h2>;
      if (level === 3) return <h3 className="shopify-preview__h3">{text}</h3>;
      return <h4 className="shopify-preview__h4">{text}</h4>;
    }
    case 'spacer': {
      const size = data.size;
      const presets: Record<string, string> = {
        sm: 'shopify-preview__spacer--sm',
        md: 'shopify-preview__spacer--md',
        lg: 'shopify-preview__spacer--lg',
      };
      const cls = typeof size === 'string' && presets[size]
        ? presets[size]
        : typeof size === 'number'
          ? ''
          : presets.md;
      return (
        <div
          aria-hidden
          className={`shopify-preview__spacer ${cls}`}
          style={typeof size === 'number' ? { height: `${size}px` } : undefined}
        />
      );
    }
    case 'list': {
      const items = Array.isArray(data.items) ? (data.items as string[]) : [];
      if (items.length === 0) return null;
      if (data.style === 'ordered') {
        return (
          <ol className="shopify-preview__ol">
            {items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="shopify-preview__ul">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    }
    case 'image': {
      const url = String(
        (data.file as { url?: string } | undefined)?.url ?? data.url ?? '',
      );
      const caption = String(data.caption ?? '');
      if (!url) {
        return (
          <div className="shopify-preview__image-placeholder">
            Image block — paste a URL on the right
          </div>
        );
      }
      return (
        <figure
          className="shopify-preview__figure shopify-preview__figure--clickable"
          style={figureStyle(data.width, data.align)}
          onClick={onImageClick ? handleFigureClick : undefined}
          role={onImageClick ? 'button' : undefined}
          tabIndex={onImageClick ? 0 : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={caption || 'Evari'} />
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      );
    }
    case 'doubleImage': {
      const left = data.left as { url?: string; caption?: string } | undefined;
      const right = data.right as { url?: string; caption?: string } | undefined;
      if (!left?.url && !right?.url) {
        return (
          <div className="shopify-preview__image-placeholder">
            Double-image block — paste two URLs on the right
          </div>
        );
      }
      return (
        <figure
          className="shopify-preview__double shopify-preview__figure--clickable"
          style={figureStyle(data.width, data.align)}
          onClick={onImageClick ? handleFigureClick : undefined}
          role={onImageClick ? 'button' : undefined}
          tabIndex={onImageClick ? 0 : undefined}
        >
          {[left, right].map((side, i) =>
            side?.url ? (
              <div key={i} className="shopify-preview__double-cell">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={side.url} alt={side.caption ?? 'Evari'} />
                {side.caption ? (
                  <figcaption>{side.caption}</figcaption>
                ) : null}
              </div>
            ) : (
              <div key={i} className="shopify-preview__double-cell shopify-preview__double-cell--empty" />
            ),
          )}
        </figure>
      );
    }
    case 'quote': {
      const text = String(data.text ?? '');
      const caption = String(data.caption ?? '');
      if (!text.trim()) return null;
      return (
        <blockquote className="shopify-preview__quote">
          <p>{text}</p>
          {caption ? <cite>— {caption}</cite> : null}
        </blockquote>
      );
    }
    case 'delimiter':
      return <hr className="shopify-preview__hr" />;
    case 'video': {
      const url = String(data.url ?? '');
      const poster = (data.poster as string | undefined) ?? undefined;
      const caption = String(data.caption ?? '').trim();
      if (!url) {
        return (
          <div className="shopify-preview__image-placeholder">
            Video block — pick a clip from the media library on the right
          </div>
        );
      }
      return (
        <figure
          className="shopify-preview__figure shopify-preview__figure--clickable"
          style={figureStyle(data.width, data.align)}
          onClick={onImageClick ? handleFigureClick : undefined}
          role={onImageClick ? 'button' : undefined}
          tabIndex={onImageClick ? 0 : undefined}
        >
          <video
            src={url}
            poster={poster}
            controls
            playsInline
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      );
    }
    default:
      return null;
  }
}

/**
 * Sortable wrapper around PreviewBlock. Adds a left-margin grip
 * handle (visible on hover) plus the dnd-kit transforms. The block
 * itself still mounts via PreviewBlock so the rendered HTML stays
 * pixel-identical to the read-only path; we just sit it inside a
 * container that hosts the sortable behaviour.
 */
function SortablePreviewBlock({
  block,
  onImageClick,
}: {
  block: JournalBlock;
  onImageClick?: (blockId: string, anchor: HTMLElement) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
  };
  return (
    <div
      ref={setNodeRef}
      id={`j-block-${block.id}`}
      data-journal-block
      data-journal-sortable
      style={style}
      className="group"
    >
      {/* Grip handle. Sits in the left margin so it doesn't shift the
          block itself; only opacity changes on hover so the WYSIWYG
          surface stays clean when not interacting. */}
      <button
        type="button"
        aria-label="Drag to reorder block"
        {...attributes}
        {...listeners}
        className="absolute -left-7 top-2 h-6 w-6 rounded flex items-center justify-center text-evari-dim opacity-0 group-hover:opacity-100 hover:text-evari-text hover:bg-evari-surface/60 cursor-grab active:cursor-grabbing transition-opacity"
        // Stop the click bubbling into the figure-click handler so
        // grabbing the handle on an image block doesn't pop the width
        // popover at the same time.
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <PreviewBlock block={block} onImageClick={onImageClick} />
    </div>
  );
}
