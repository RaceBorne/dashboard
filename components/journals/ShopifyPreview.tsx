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
      </header>

      <div className="shopify-preview__body">
        {blocks.length === 0 ? (
          <p className="shopify-preview__empty">
            Your article will appear here as you add blocks on the right.
          </p>
        ) : (
          blocks.map((b) => <PreviewBlock key={b.id} block={b} />)
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
      return (
        <p
          className="shopify-preview__p"
          // Safe: the text is either plain or EditorJS inline HTML which
          // we already allow (b, i, a, code). Preview-only.
          dangerouslySetInnerHTML={{ __html: text }}
        />
      );
    }
    case 'header': {
      const level = Math.max(2, Math.min(4, Number(data.level ?? 2)));
      const text = String(data.text ?? '');
      if (!text.trim()) {
        return (
          <p className="shopify-preview__placeholder">Empty heading</p>
        );
      }
      if (level === 2) return <h2 className="shopify-preview__h2">{text}</h2>;
      if (level === 3) return <h3 className="shopify-preview__h3">{text}</h3>;
      return <h4 className="shopify-preview__h4">{text}</h4>;
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
    default:
      return null;
  }
}
