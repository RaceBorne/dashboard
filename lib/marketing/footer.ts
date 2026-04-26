/**
 * Branded footer renderer — produces the canonical footer HTML appended
 * to every send. Pure function, no Supabase / Postmark deps, so the
 * client-side live preview in /email/brand and the server-side sender
 * use the EXACT same output. No drift.
 *
 * Output is email-safe: nested table layouts, inline CSS only, no
 * external CSS or JS, image dimensions explicit, dark-mode friendly
 * colour palette pulled from the brand kit.
 */

import type {
  FooterDesign,
  FooterLayout,
  MarketingBrand,
} from './types';
import { DEFAULT_FOOTER_DESIGN } from './types';

interface RenderInput {
  brand: MarketingBrand;
  /** When set, replaces {{unsubscribeUrl}} in the unsubscribe block. */
  unsubscribeUrl?: string;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
}

function alignAttr(align: FooterDesign['alignment']): string {
  return `text-align:${align};`;
}

function logoBlock(brand: MarketingBrand, design: FooterDesign): string {
  const url = brand.logoLightUrl ?? brand.logoDarkUrl;
  if (!url || !design.blocks.logo) return '';
  return `<div style="${alignAttr(design.alignment)}margin-bottom:16px;">
    <img src="${escape(url)}" alt="${escape(brand.companyName ?? 'Logo')}" style="display:inline-block;max-height:40px;width:auto;border:0;outline:none;text-decoration:none;" />
  </div>`;
}

function signatureBlock(brand: MarketingBrand, design: FooterDesign): string {
  if (!design.blocks.signature || !brand.signatureHtml) return '';
  return `<div style="${alignAttr(design.alignment)}margin-bottom:16px;color:${design.textColor};">
    ${brand.signatureHtml}
  </div>`;
}

function addressBlock(brand: MarketingBrand, design: FooterDesign): string {
  if (!design.blocks.address) return '';
  if (!brand.companyName && !brand.companyAddress) return '';
  return `<div style="${alignAttr(design.alignment)}margin-bottom:12px;font:11px/1.5 ${escape(brand.fonts.body || 'Arial')},sans-serif;color:${design.mutedColor};">
    ${brand.companyName ? `<strong style="color:${design.textColor};">${escape(brand.companyName)}</strong><br/>` : ''}
    ${brand.companyAddress ? escape(brand.companyAddress).replace(/\n/g, '<br/>') : ''}
  </div>`;
}

const SOCIAL_LABELS: Record<keyof MarketingBrand extends never ? string : string, string> = {
  instagram: 'Instagram',
  twitter:   'X / Twitter',
  linkedin:  'LinkedIn',
  facebook:  'Facebook',
  tiktok:    'TikTok',
  youtube:   'YouTube',
  website:   'Website',
};

function socialBlock(brand: MarketingBrand, design: FooterDesign): string {
  if (!design.blocks.social) return '';
  const links = Object.entries(design.social)
    .filter(([, url]) => Boolean(url && url.trim()))
    .map(([key, url]) => {
      const label = SOCIAL_LABELS[key as keyof typeof SOCIAL_LABELS] ?? key;
      return `<a href="${escape(url!)}" style="color:${design.textColor};text-decoration:none;font-weight:500;margin:0 8px;display:inline-block;" target="_blank" rel="noopener">${escape(label)}</a>`;
    })
    .join('<span style="color:' + design.mutedColor + ';">·</span>');
  if (!links) return '';
  return `<div style="${alignAttr(design.alignment)}margin-bottom:12px;font:12px/1.5 ${escape(brand.fonts.body || 'Arial')},sans-serif;">
    ${links}
  </div>`;
}

function unsubscribeBlock(brand: MarketingBrand, design: FooterDesign, url: string | undefined): string {
  if (!design.blocks.unsubscribe) return '';
  const href = url ?? '{{unsubscribeUrl}}';
  return `<div style="${alignAttr(design.alignment)}font:11px/1.5 ${escape(brand.fonts.body || 'Arial')},sans-serif;color:${design.mutedColor};">
    <a href="${escape(href)}" style="color:${design.mutedColor};text-decoration:underline;">Unsubscribe from these emails</a>
  </div>`;
}

/**
 * Render the footer HTML. Layout variants:
 *   stacked  — every block is its own row, alignment honoured
 *   split    — logo/signature on one side, address/social on the other (left/right or wrapped)
 *   centered — same as stacked but force alignment:center
 */
export function renderFooter(input: RenderInput): string {
  const { brand, unsubscribeUrl } = input;
  const design: FooterDesign = brand.footerDesign ?? DEFAULT_FOOTER_DESIGN;
  const padding = design.paddingPx ?? 32;
  const borderTop = design.borderTop
    ? `border-top:1px solid ${design.borderColor};`
    : '';

  // Layout variants — reduced to two real implementations: stacked (one
  // column) and split (two columns side-by-side on desktop, wraps to
  // stacked on narrow screens via the email-client container width).
  const isSplit = design.layout === 'split';

  let inner: string;
  if (isSplit) {
    const left = [
      logoBlock(brand, design),
      signatureBlock(brand, design),
    ].filter(Boolean).join('\n');
    const right = [
      addressBlock(brand, design),
      socialBlock(brand, design),
    ].filter(Boolean).join('\n');
    inner = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td valign="top" style="width:50%;padding-right:16px;${alignAttr('left')}">${left}</td>
          <td valign="top" style="width:50%;padding-left:16px;${alignAttr('right')}">${right}</td>
        </tr>
      </table>
      ${unsubscribeBlock(brand, design, unsubscribeUrl)}
    `;
  } else {
    const effectiveDesign: FooterDesign = design.layout === 'centered'
      ? { ...design, alignment: 'center' }
      : design;
    inner = [
      logoBlock(brand, effectiveDesign),
      signatureBlock(brand, effectiveDesign),
      addressBlock(brand, effectiveDesign),
      socialBlock(brand, effectiveDesign),
      unsubscribeBlock(brand, effectiveDesign, unsubscribeUrl),
    ].filter(Boolean).join('\n');
  }

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background:${design.background};${borderTop}margin-top:32px;">
    <tr>
      <td style="padding:${padding}px;">
        ${inner}
      </td>
    </tr>
  </table>`;
}

/** Plain-text fallback — Postmark uses this for the text/plain MIME part. */
export function renderFooterText(input: RenderInput): string {
  const { brand, unsubscribeUrl } = input;
  const design: FooterDesign = brand.footerDesign ?? DEFAULT_FOOTER_DESIGN;
  const lines: string[] = [];
  if (design.blocks.signature && brand.signatureHtml) {
    lines.push(brand.signatureHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }
  if (design.blocks.address) {
    if (brand.companyName) lines.push(brand.companyName);
    if (brand.companyAddress) lines.push(brand.companyAddress);
  }
  if (design.blocks.social) {
    const socials = Object.entries(design.social)
      .filter(([, v]) => Boolean(v && v.trim()))
      .map(([k, v]) => `${k}: ${v}`);
    if (socials.length > 0) lines.push(socials.join(' | '));
  }
  if (design.blocks.unsubscribe) {
    lines.push(`Unsubscribe: ${unsubscribeUrl ?? '{{unsubscribeUrl}}'}`);
  }
  return lines.join('\n\n');
}

export { DEFAULT_FOOTER_DESIGN } from './types';
