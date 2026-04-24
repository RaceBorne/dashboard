'use client';

import { Facebook, Link2, Share2 } from 'lucide-react';

export interface JournalBlock {
  id: string;
  type: string;
  data: Record<string, unknown>;
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
}: Props) {
  return (
    <article className="shopify-preview">
      {/* Cover */}
      {coverImageUrl ? (
        <div className="shopify-preview__cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverImageUrl} alt={title} />
          {subLabel ? (
            <span className="shopify-preview__sublabel">{subLabel}</span>
          ) : null}
        </div>
      ) : null}

      <header className="shopify-preview__head">
        <div className="shopify-preview__share">
          <span>Share:</span>
          <Share2 size={14} />
          <Facebook size={14} />
          <Link2 size={14} />
        </div>
        <h1 className="shopify-preview__title">
          {title.trim() || 'Untitled article'}
        </h1>
        {summary && summary.trim() ? (
          // Summary renders as a lede below the title. `whitespace-
          // pre-line` keeps every \n the author typed in the Summary
          // textarea so paragraph breaks look identical here as in
          // the published article.
          <p className="shopify-preview__lede" style={{ whiteSpace: 'pre-line' }}>
            {summary}
          </p>
        ) : null}
      </header>

      <div className="shopify-preview__body">
        {blocks.length === 0 ? (
          <p className="shopify-preview__empty">
            Your article will appear here as you add blocks on the right.
          </p>
        ) : (
          blocks.map((b) => (
            // Wrap each block in an anchor div so the editor can
            // scrollIntoView when a card is clicked on the right.
            // The wrapper is a bare block container — no margin / no
            // padding — so it's invisible to the body's flex gap.
            <div key={b.id} id={`j-block-${b.id}`} data-journal-block>
              <PreviewBlock block={b} />
            </div>
          ))
        )}
      </div>

      {(author ?? '').trim() ? (
        <p className="shopify-preview__byline">By {author}</p>
      ) : null}
      {publishedAt ? (
        <p className="shopify-preview__date">
          {new Date(publishedAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      ) : null}
    </article>
  );
}

function PreviewBlock({ block }: { block: JournalBlock }) {
  const { type, data } = block;
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
        <figure className="shopify-preview__figure">
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
        <figure className="shopify-preview__double">
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
        <figure className="shopify-preview__figure">
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
