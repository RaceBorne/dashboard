/**
 * Parse a Shopify-style article bodyHtml back into our JournalBlock
 * schema, so a published article can be opened as a template in the
 * Journal composer.
 *
 * The parse is deliberately forgiving: the point isn't fidelity, it's
 * giving the merchant a sensible starting structure they'll then edit
 * with AI, swap images on, and re-publish. If something doesn't map
 * cleanly (nested tables, Liquid blocks, custom metafields) we fall
 * back to a paragraph containing the inner text.
 *
 * Mappings:
 *   <h1..h4>       → header (level 2–4)
 *   <p>            → paragraph
 *   <ul> / <ol>    → list
 *   <figure>/<img> → image
 *   <video>        → video
 *   <blockquote>   → quote
 *   <hr>           → delimiter
 *
 * Adjacent <img> siblings inside a <figure> collapse into a single
 * image block (Shopify's native "side-by-side" blocks are rare in
 * Evari's templates so we don't try to re-detect them).
 */
export interface ParsedBlock {
  type: 'paragraph' | 'header' | 'list' | 'image' | 'quote' | 'delimiter' | 'video';
  data: Record<string, unknown>;
}

function newId(): string {
  return 'b_' + Math.random().toString(36).slice(2, 10);
}

function textOf(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Browser-only. Uses DOMParser which is available in every modern
 * browser we ship to. Server-side callers should convert HTML to
 * blocks in a Node environment using a parser like cheerio; for the
 * current Journals UX the template flow runs on click in the client.
 */
export function htmlToBlocks(html: string): Array<ParsedBlock & { id: string }> {
  if (typeof window === 'undefined') {
    throw new Error('htmlToBlocks is client-only');
  }
  if (!html.trim()) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body;
  const out: Array<ParsedBlock & { id: string }> = [];

  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4': {
        const level = Math.max(1, Math.min(4, Number(tag.slice(1))));
        const text = textOf(el);
        if (text) out.push({ id: newId(), type: 'header', data: { level, text } });
        return;
      }
      case 'p': {
        const text = el.innerHTML.trim();
        if (text) out.push({ id: newId(), type: 'paragraph', data: { text } });
        return;
      }
      case 'ul':
      case 'ol': {
        const items = Array.from(el.children)
          .filter((c) => c.tagName.toLowerCase() === 'li')
          .map((li) => textOf(li))
          .filter(Boolean);
        if (items.length) {
          out.push({
            id: newId(),
            type: 'list',
            data: { style: tag === 'ol' ? 'ordered' : 'unordered', items },
          });
        }
        return;
      }
      case 'figure': {
        const img = el.querySelector('img');
        const video = el.querySelector('video');
        const captionEl = el.querySelector('figcaption');
        const caption = captionEl ? textOf(captionEl) : '';
        if (video) {
          const src = video.getAttribute('src') ?? '';
          const poster = video.getAttribute('poster') ?? '';
          out.push({ id: newId(), type: 'video', data: { url: src, poster, caption } });
          return;
        }
        if (img) {
          const url = img.getAttribute('src') ?? '';
          out.push({ id: newId(), type: 'image', data: { file: { url }, caption } });
          return;
        }
        // Bare figure with no media — treat as paragraph of its text.
        const text = el.innerHTML.trim();
        if (text) out.push({ id: newId(), type: 'paragraph', data: { text } });
        return;
      }
      case 'img': {
        const url = el.getAttribute('src') ?? '';
        if (url) {
          out.push({
            id: newId(),
            type: 'image',
            data: { file: { url }, caption: el.getAttribute('alt') ?? '' },
          });
        }
        return;
      }
      case 'video': {
        const src = el.getAttribute('src') ?? '';
        const poster = el.getAttribute('poster') ?? '';
        if (src) {
          out.push({ id: newId(), type: 'video', data: { url: src, poster, caption: '' } });
        }
        return;
      }
      case 'blockquote': {
        const text = textOf(el);
        const citeEl = el.querySelector('cite');
        const caption = citeEl ? textOf(citeEl).replace(/^[\s—-]+/, '') : '';
        if (text) out.push({ id: newId(), type: 'quote', data: { text, caption } });
        return;
      }
      case 'hr':
        out.push({ id: newId(), type: 'delimiter', data: {} });
        return;
      case 'div':
      case 'section':
      case 'article':
        // Dive into containers.
        Array.from(el.children).forEach((child) =>
          walk(child as Element),
        );
        return;
      default: {
        // Fallback — if this tag carries block-level text, make a
        // paragraph out of it. Otherwise ignore (inline-only tags
        // are usually wrapped by a block-level parent anyway).
        const text = textOf(el);
        if (text && /h1|h2|h3|h4|p|section|article|div|aside|main/.test(tag)) {
          out.push({ id: newId(), type: 'paragraph', data: { text } });
        }
      }
    }
  };

  Array.from(root.children).forEach((child) => walk(child as Element));
  return out;
}
