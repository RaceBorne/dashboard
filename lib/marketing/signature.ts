/**
 * Signature renderer — walks SignatureDesign.blocks (a subset of
 * FooterBlock) and emits email-safe HTML. Mirrors renderFooter() in
 * lib/marketing/footer.ts but with a smaller block alphabet.
 *
 * The output is what brand.signatureHtml resolves to (which is then
 * what the FOOTER's signature block ultimately renders). So you can
 * design the signature here and the footer's signature block picks
 * it up automatically.
 */

import type {
  MarketingBrand,
  SignatureBlock,
  SignatureDesign,
} from './types';
import { DEFAULT_SIGNATURE_DESIGN } from './types';
import { renderSocial, renderAddress, renderUnsubscribe } from './footer';

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function alignStyle(a: 'left' | 'center' | 'right'): string {
  return `text-align:${a};`;
}

function renderBlockInner(b: SignatureBlock, brand: MarketingBrand): string {
  switch (b.type) {
    case 'logo': {
      const url = b.srcOverride || brand.logoLightUrl || brand.logoDarkUrl;
      if (!url) return '';
      return `<div style="${alignStyle(b.alignment)}">
        <img src="${escape(url)}" alt="${escape(brand.companyName ?? 'Logo')}" style="display:inline-block;max-width:${b.maxWidthPx}px;height:auto;border:0;outline:none;text-decoration:none;" />
      </div>`;
    }
    case 'text': {
      const family = b.fontFamily ? `'${b.fontFamily}',` : '';
      // Encode lone ampersands so & in user text becomes a valid &amp; in the
      // rendered HTML — without re-escaping properly-formed tags or entities.
      const html = b.html.replace(/&(?!(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
      return `<div style="${alignStyle(b.alignment)}font:${b.fontSizePx}px/${b.lineHeight} ${family}Arial,sans-serif;color:${b.color};">${html}</div>`;
    }
    case 'spacer':
      return `<div style="height:${b.heightPx}px;line-height:${b.heightPx}px;font-size:0;">&nbsp;</div>`;
    case 'divider':
      return `<div style="margin:${b.marginYPx}px 0;height:${b.thicknessPx}px;line-height:0;font-size:0;background:${b.color};">&nbsp;</div>`;
    case 'social':
      return renderSocial(b, brand);
    case 'address':
      return renderAddress(b, brand);
    case 'unsubscribe':
      // The {{unsubscribeUrl}} token is substituted at send time when
      // a signature carrying this block lands inside a marketing email.
      // For preview / transactional contexts the placeholder simply
      // renders verbatim, which is the same behaviour as the footer.
      return renderUnsubscribe(b, brand, undefined);
    default:
      return '';
  }
}

/** Wraps each block in a per-id span so the live preview can highlight
 * the currently-selected block via [data-block-id="..."] CSS. */
function renderBlock(b: SignatureBlock, brand: MarketingBrand): string {
  const inner = renderBlockInner(b, brand);
  if (!inner) return '';
  const top = b.paddingTopPx ?? 0;
  const bot = b.paddingBottomPx ?? 0;
  const padStyle = top || bot ? `padding:${top}px 0 ${bot}px 0;` : '';
  return `<div data-block-id="${b.id}" style="display:block;${padStyle}">${inner}</div>`;
}

export function normaliseSignatureDesign(d: unknown): SignatureDesign | null {
  if (!d || typeof d !== 'object') return null;
  const cur = d as Partial<SignatureDesign>;
  if (!Array.isArray(cur.blocks)) return null;
  return {
    background: cur.background ?? 'transparent',
    paddingPx: cur.paddingPx ?? 0,
    blocks: cur.blocks as SignatureBlock[],
  };
}

export function renderSignatureDesign(
  design: SignatureDesign | null,
  brand: MarketingBrand,
): string {
  const d = design ?? DEFAULT_SIGNATURE_DESIGN;
  const inner = d.blocks.map((b) => renderBlock(b, brand)).filter(Boolean).join('\n');
  if (!inner.trim()) return '';
  const wrapStyle = `${d.background && d.background !== 'transparent' ? `background:${d.background};` : ''}${d.paddingPx ? `padding:${d.paddingPx}px;` : ''}`;
  return wrapStyle
    ? `<div style="${wrapStyle}">${inner}</div>`
    : inner;
}

export { DEFAULT_SIGNATURE_DESIGN } from './types';
