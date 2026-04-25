/**
 * Serialise EditorJS JSON → Shopify-safe HTML.
 *
 * The Shopify Online Store renders article.body as raw HTML inside
 * whatever the blog template provides. We keep the markup plain and
 * class-free so it inherits the theme's typography and spacing, and
 * so the same HTML renders predictably inside the Shopify admin
 * preview (no Evari dashboard classes leaking across).
 *
 * Block types supported in v1:
 *   - paragraph          → <p>
 *   - header (h2–h4)     → <h2> / <h3> / <h4>
 *   - list               → <ul> / <ol>
 *   - image              → <figure><img ...></figure>
 *   - doubleImage        → <figure class="evari-double"> wrapping two imgs
 *   - quote              → <blockquote>
 *   - delimiter          → <hr>
 *
 * Unknown block types are skipped with a warning — better to ship
 * whitespace than break article rendering.
 */
import type { OutputData } from '@editorjs/editorjs';

function escape(html: string): string {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Image-block width presets. Stored as semantic keys on the block
 * data (`width: 'sm' | 'md' | 'lg' | 'full'`). Resolves to a
 * percentage applied as `max-width` on the rendered <figure>.
 *
 * Same map is used by ShopifyPreview to render the live preview,
 * so the WYSIWYG match holds end-to-end.
 */
export const FIGURE_WIDTH_PERCENT: Record<string, number> = {
  sm: 33,
  md: 50,
  lg: 75,
  full: 100,
};
/**
 * Compose width + alignment into a single inline `style` string for
 * a figure. Alignment is meaningless at full (100%) width since the
 * figure fills the column either way; we still emit the auto/auto
 * margins so the published HTML stays predictable.
 *
 *   align 'left'   → margin-left:0;       margin-right:auto
 *   align 'center' → margin-left:auto;    margin-right:auto    (default)
 *   align 'right'  → margin-left:auto;    margin-right:0
 */
function figureStyleString(width: unknown, align: unknown): string {
  const pct = typeof width === 'string' ? FIGURE_WIDTH_PERCENT[width] : undefined;
  const a = align === 'left' || align === 'right' ? align : 'center';
  if (!pct || pct === 100) {
    // Full width — alignment doesn't visibly change anything.
    return '';
  }
  const ml = a === 'left' ? '0' : 'auto';
  const mr = a === 'right' ? '0' : 'auto';
  return `max-width:${pct}%;margin-left:${ml};margin-right:${mr}`;
}
/** @deprecated kept for compatibility — prefer figureStyleString. */
function widthStyle(raw: unknown): string {
  return figureStyleString(raw, undefined);
}

function attr(name: string, value: string | null | undefined): string {
  if (value == null || value === '') return '';
  return ` ${name}="${escape(value)}"`;
}

interface Block {
  type: string;
  data: Record<string, unknown>;
}

function renderParagraph(b: Block): string {
  const text = String(b.data.text ?? '').trim();
  if (!text) return '';
  // A double newline splits into separate <p>s; a single newline
  // becomes a <br> inside the current paragraph. Mirrors how the
  // preview's whitespace:pre-line reads the same text, so WYSIWYG
  // stays intact on publish to Shopify.
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return paragraphs
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function renderHeader(b: Block): string {
  const lvl = Math.max(1, Math.min(4, Number(b.data.level ?? 2)));
  const text = String(b.data.text ?? '').trim();
  if (!text) return '';
  return `<h${lvl}>${text}</h${lvl}>`;
}

function renderSpacer(b: Block): string {
  // Serialise to a plain div with an inline height so the gap
  // survives Shopify's storefront theme without depending on any
  // theme-specific class. Size is either a named preset or a raw
  // pixel number.
  const presets: Record<string, number> = { sm: 12, md: 32, lg: 64 };
  const raw = b.data.size;
  const px =
    typeof raw === 'number'
      ? Math.max(1, Math.min(240, Math.round(raw)))
      : presets[String(raw ?? 'md')] ?? 32;
  return `<div aria-hidden="true" style="height:${px}px"></div>`;
}

function renderList(b: Block): string {
  const style = b.data.style === 'ordered' ? 'ol' : 'ul';
  const items = Array.isArray(b.data.items) ? (b.data.items as string[]) : [];
  if (items.length === 0) return '';
  const li = items.map((it) => `<li>${it}</li>`).join('');
  return `<${style}>${li}</${style}>`;
}

function renderImage(b: Block): string {
  const file = b.data.file as { url?: string } | undefined;
  const url = (file?.url ?? b.data.url) as string | undefined;
  if (!url) return '';
  const caption = String(b.data.caption ?? '').trim();
  const alt = caption || 'Evari';
  const withBorder = b.data.withBorder ? 'border:1px solid #e5e5e5;' : '';
  const img = `<img${attr('src', url)}${attr('alt', alt)}${withBorder ? ` style="${withBorder.replace(/;$/, '')}"` : ''} />`;
  const wrapStyle = figureStyleString(b.data.width, b.data.align);
  const figOpen = wrapStyle ? `<figure style="${wrapStyle}">` : '<figure>';
  if (caption) {
    return `${figOpen}${img}<figcaption>${caption}</figcaption></figure>`;
  }
  return `${figOpen}${img}</figure>`;
}

function renderDoubleImage(b: Block): string {
  const left = b.data.left as { url?: string; caption?: string } | undefined;
  const right = b.data.right as { url?: string; caption?: string } | undefined;
  if (!left?.url && !right?.url) return '';
  const cell = (img: { url?: string; caption?: string } | undefined) => {
    if (!img?.url) return '';
    const cap = (img.caption ?? '').trim();
    return `<div style="flex:1 1 0;min-width:0"><img${attr('src', img.url)}${attr('alt', cap || 'Evari')} style="width:100%;height:auto;display:block" />${
      cap ? `<p style="font-size:11px;line-height:1.45;color:#666;margin-top:0.5rem;text-align:left">${escape(cap)}</p>` : ''
    }</div>`;
  };
  const wrapStyle = figureStyleString(b.data.width, b.data.align);
  const baseStyle = 'display:flex;gap:1rem;align-items:flex-start;margin-top:1.5rem;margin-bottom:1.5rem';
  const style = wrapStyle
    ? `${baseStyle};${wrapStyle}`
    : `${baseStyle};margin-left:auto;margin-right:auto`;
  return `<figure style="${style}">${cell(left)}${cell(right)}</figure>`;
}

function renderQuote(b: Block): string {
  const text = String(b.data.text ?? '').trim();
  if (!text) return '';
  const caption = String(b.data.caption ?? '').trim();
  return `<blockquote>${text}${caption ? `<cite> — ${caption}</cite>` : ''}</blockquote>`;
}

function renderDelimiter(): string {
  return '<hr />';
}

function renderVideo(b: Block): string {
  const url = String(b.data.url ?? '');
  if (!url) return '';
  const poster = String(b.data.poster ?? '');
  const caption = String(b.data.caption ?? '').trim();
  const video = `<video controls playsinline${attr('poster', poster)}${attr('src', url)} style="width:100%;height:auto;display:block;border-radius:6px"></video>`;
  const wrapStyle = figureStyleString(b.data.width, b.data.align);
  const figOpen = wrapStyle ? `<figure style="${wrapStyle}">` : '<figure>';
  if (caption) {
    return `${figOpen}${video}<figcaption>${caption}</figcaption></figure>`;
  }
  return `${figOpen}${video}</figure>`;
}

export function editorDataToHtml(data: OutputData | Record<string, unknown> | null | undefined): string {
  if (!data || typeof data !== 'object') return '';
  const blocks = ((data as OutputData).blocks ?? []) as Block[];
  const out: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
        out.push(renderParagraph(block));
        break;
      case 'header':
        out.push(renderHeader(block));
        break;
      case 'list':
        out.push(renderList(block));
        break;
      case 'image':
        out.push(renderImage(block));
        break;
      case 'doubleImage':
        out.push(renderDoubleImage(block));
        break;
      case 'quote':
        out.push(renderQuote(block));
        break;
      case 'delimiter':
        out.push(renderDelimiter());
        break;
      case 'video':
        out.push(renderVideo(block));
        break;
      case 'spacer':
        out.push(renderSpacer(block));
        break;
      default:
        // Unknown block type — skip rather than corrupt output.
        console.warn(`[editorToHtml] skipping unknown block type: ${block.type}`);
    }
  }
  return out.filter(Boolean).join('\n');
}

/**
 * Cheap plaintext summariser — grabs the first paragraph/header and
 * trims to ~160 chars. Used when the author hasn't set a summary and
 * we need one for SEO / article listings.
 */
export function editorDataToSummary(
  data: OutputData | Record<string, unknown> | null | undefined,
  max = 160,
): string {
  if (!data || typeof data !== 'object') return '';
  const blocks = ((data as OutputData).blocks ?? []) as Block[];
  for (const b of blocks) {
    if (b.type === 'paragraph' || b.type === 'header') {
      const text = String(b.data.text ?? '')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (text) {
        return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…';
      }
    }
  }
  return '';
}
