/**
 * Email design renderer (Phase 14). Walks EmailDesign.blocks in order
 * and emits an email-safe HTML document — wrapped in a centred 600px
 * content table, suitable for Gmail / Outlook / Apple Mail. Pure
 * function: same code path runs in the live preview (client) and the
 * sender (server) so what you design is byte-identical to what
 * subscribers receive.
 */

import type { EmailAlignment, EmailBlock, EmailDesign, MarketingBrand } from './types';

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function alignStyle(a: EmailAlignment): string { return `text-align:${a};`; }

// Encode lone ampersands (same defensive pattern as footer + signature renderers).
function safeHtml(html: string): string {
  return html.replace(/&(?!(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
}

function fontFor(brand: MarketingBrand, family: string): string {
  if (family) return `'${family}',`;
  if (brand.fonts.body) return `'${brand.fonts.body}',`;
  return '';
}

function renderHeading(b: Extract<EmailBlock, { type: 'heading' }>, brand: MarketingBrand): string {
  const sizes = { 1: 28, 2: 22, 3: 18 } as const;
  const size = sizes[b.level];
  return `<div style="${alignStyle(b.alignment)}font:bold ${size}px/1.25 ${fontFor(brand, b.fontFamily)}Arial,sans-serif;color:${b.color};">${safeHtml(b.html)}</div>`;
}

function renderText(b: Extract<EmailBlock, { type: 'text' }>, brand: MarketingBrand): string {
  return `<div style="${alignStyle(b.alignment)}font:${b.fontSizePx}px/${b.lineHeight} ${fontFor(brand, b.fontFamily)}Arial,sans-serif;color:${b.color};">${safeHtml(b.html)}</div>`;
}

function renderImage(b: Extract<EmailBlock, { type: 'image' }>): string {
  if (!b.src) return '';
  const img = `<img src="${escape(b.src)}" alt="${escape(b.alt)}" style="display:block;max-width:100%;width:${b.maxWidthPx}px;height:auto;border:0;outline:none;text-decoration:none;" />`;
  const wrapped = b.linkUrl ? `<a href="${escape(b.linkUrl)}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block;">${img}</a>` : img;
  return `<div style="${alignStyle(b.alignment)}">${wrapped}</div>`;
}

function renderButton(b: Extract<EmailBlock, { type: 'button' }>): string {
  return `<div style="${alignStyle(b.alignment)}">
    <a href="${escape(b.url)}" target="_blank" rel="noopener" style="display:inline-block;background:${b.backgroundColor};color:${b.textColor};padding:${b.paddingYPx}px ${b.paddingXPx}px;border-radius:${b.borderRadiusPx}px;font:bold 14px/1.2 Arial,sans-serif;text-decoration:none;">${escape(b.label)}</a>
  </div>`;
}

function renderDivider(b: Extract<EmailBlock, { type: 'divider' }>): string {
  return `<div style="margin:${b.marginYPx}px 0;height:${b.thicknessPx}px;line-height:0;font-size:0;background:${b.color};">&nbsp;</div>`;
}

function renderSpacer(b: Extract<EmailBlock, { type: 'spacer' }>): string {
  return `<div style="height:${b.heightPx}px;line-height:${b.heightPx}px;font-size:0;">&nbsp;</div>`;
}

function renderRawHtml(b: Extract<EmailBlock, { type: 'html' }>): string {
  return b.html;
}

function renderInner(b: EmailBlock, brand: MarketingBrand): string {
  switch (b.type) {
    case 'heading': return renderHeading(b, brand);
    case 'text':    return renderText(b, brand);
    case 'image':   return renderImage(b);
    case 'button':  return renderButton(b);
    case 'divider': return renderDivider(b);
    case 'spacer':  return renderSpacer(b);
    case 'html':    return renderRawHtml(b);
    default:        return '';
  }
}

/** Wraps each block in a per-id span carrying optional padding —
 * lets the in-app preview highlight selected blocks via
 * [data-block-id="..."] CSS, and lets every block push itself away
 * from its neighbours without dedicated spacer blocks. */
function renderBlock(b: EmailBlock, brand: MarketingBrand): string {
  const inner = renderInner(b, brand);
  if (!inner) return '';
  const top = b.paddingTopPx ?? 0;
  const bot = b.paddingBottomPx ?? 0;
  const padStyle = top || bot ? `padding:${top}px 0 ${bot}px 0;` : '';
  return `<div data-block-id="${b.id}" style="display:block;${padStyle}">${inner}</div>`;
}

export function normaliseEmailDesign(d: unknown): EmailDesign | null {
  if (!d || typeof d !== 'object') return null;
  const cur = d as Partial<EmailDesign>;
  if (!Array.isArray(cur.blocks)) return null;
  return {
    background: cur.background ?? '#f4f4f5',
    widthPx: cur.widthPx ?? 600,
    paddingPx: cur.paddingPx ?? 24,
    blocks: cur.blocks as EmailBlock[],
  };
}

/**
 * Render the design to a complete email-safe HTML document. Mailbox
 * providers want a real `<html><body>` wrapper for proper styling.
 */
export function renderEmailDesign(design: EmailDesign, brand: MarketingBrand): string {
  const inner = design.blocks.map((b) => renderBlock(b, brand)).filter(Boolean).join('\n');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title></title>
</head>
<body style="margin:0;padding:0;background:${design.background};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${design.background};">
    <tr>
      <td align="center" style="padding:${design.paddingPx}px;">
        <table role="presentation" width="${design.widthPx}" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;max-width:100%;">
          <tr>
            <td style="padding:24px;">
              ${inner}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Convenience for the preview iframe — same renderer, brand stub
 * acceptable when full brand isn't available client-side. */
export function renderEmailDesignWithStub(design: EmailDesign, brandLike?: Partial<MarketingBrand>): string {
  const stub: MarketingBrand = {
    id: 'singleton',
    companyName: brandLike?.companyName ?? null,
    companyAddress: brandLike?.companyAddress ?? null,
    replyToEmail: brandLike?.replyToEmail ?? null,
    logoLightUrl: brandLike?.logoLightUrl ?? null,
    logoDarkUrl: brandLike?.logoDarkUrl ?? null,
    colors: brandLike?.colors ?? { primary: '#1a1a1a', accent: '#d4a017', text: '#1a1a1a', bg: '#ffffff', link: '#0066cc', buttonBg: '#1a1a1a', buttonText: '#ffffff', muted: '#666666' },
    fonts: brandLike?.fonts ?? { heading: 'Inter', body: 'Inter' },
    signatureHtml: brandLike?.signatureHtml ?? null,
    signatureOverride: brandLike?.signatureOverride ?? null,
    customFonts: brandLike?.customFonts ?? [],
    footerDesign: brandLike?.footerDesign ?? null,
    signatureDesign: brandLike?.signatureDesign ?? null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  return renderEmailDesign(design, stub);
}
