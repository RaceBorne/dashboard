/**
 * Branded footer renderer (block-based). Walks FooterDesign.blocks
 * in order and emits email-safe HTML. Pure function — same code path
 * runs in the live preview (client) and the sender (server) so what
 * you see in /email/brand is byte-identical to what mailbox providers
 * see.
 *
 * Compatibility: footer_design rows saved before Phase 13.5 used a
 * flat-config shape ({ layout, alignment, blocks: { logo: bool, ... }}).
 * normaliseDesign() detects + converts that legacy shape into a block
 * list so existing rows render correctly without a data migration.
 */

import type {
  FooterAlignment,
  FooterBlock,
  FooterDesign,
  FooterSocial,
  MarketingBrand,
} from './types';
import { DEFAULT_FOOTER_DESIGN } from './types';

interface RenderInput {
  brand: MarketingBrand;
  unsubscribeUrl?: string;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function alignStyle(a: FooterAlignment): string {
  return `text-align:${a};`;
}


// Iconify-compatible icon refs. mdi (Material Design Icons) covers most
// platforms reliably; tiktok is missing from mdi so we use simple-icons.
const SOCIAL_ICON_REFS: Record<keyof FooterSocial, { set: string; name: string }> = {
  instagram: { set: 'mdi',           name: 'instagram' },
  twitter:   { set: 'mdi',           name: 'twitter' },
  linkedin:  { set: 'mdi',           name: 'linkedin' },
  facebook:  { set: 'mdi',           name: 'facebook' },
  tiktok:    { set: 'simple-icons',  name: 'tiktok' },
  youtube:   { set: 'mdi',           name: 'youtube' },
  website:   { set: 'mdi',           name: 'web' },
};

const SOCIAL_LABELS: Record<keyof FooterSocial, string> = {
  instagram: 'Instagram',
  twitter:   'X / Twitter',
  linkedin:  'LinkedIn',
  facebook:  'Facebook',
  tiktok:    'TikTok',
  youtube:   'YouTube',
  website:   'Website',
};

// ─── Block renderers ──────────────────────────────────────────────

function renderLogo(b: Extract<FooterBlock, { type: 'logo' }>, brand: MarketingBrand): string {
  const url = b.srcOverride || brand.logoLightUrl || brand.logoDarkUrl;
  if (!url) return '';
  return `<div style="${alignStyle(b.alignment)}">
    <img src="${escape(url)}" alt="${escape(brand.companyName ?? 'Logo')}" style="display:inline-block;max-width:${b.maxWidthPx}px;height:auto;border:0;outline:none;text-decoration:none;" />
  </div>`;
}

function renderText(b: Extract<FooterBlock, { type: 'text' }>): string {
  const family = b.fontFamily ? `'${b.fontFamily}',` : '';
  // Encode lone ampersands without re-escaping properly-formed tags / entities.
  const html = b.html.replace(/&(?!(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
  return `<div style="${alignStyle(b.alignment)}font:${b.fontSizePx}px/${b.lineHeight} ${family}Arial,sans-serif;color:${b.color};">${html}</div>`;
}

function renderSpacer(b: Extract<FooterBlock, { type: 'spacer' }>): string {
  return `<div style="height:${b.heightPx}px;line-height:${b.heightPx}px;font-size:0;">&nbsp;</div>`;
}

function renderDivider(b: Extract<FooterBlock, { type: 'divider' }>): string {
  const w = typeof b.widthPct === 'number' && b.widthPct > 0 && b.widthPct < 100 ? b.widthPct : 100;
  if (w >= 100) {
    return `<div style="margin:${b.marginYPx}px 0;height:${b.thicknessPx}px;line-height:0;font-size:0;background:${b.color};">&nbsp;</div>`;
  }
  return `<div style="margin:${b.marginYPx}px 0;text-align:center;font-size:0;line-height:0;"><div style="display:inline-block;width:${w}%;height:${b.thicknessPx}px;background:${b.color};">&nbsp;</div></div>`;
}

function renderAddress(b: Extract<FooterBlock, { type: 'address' }>, brand: MarketingBrand): string {
  if (!brand.companyName && !brand.companyAddress) return '';
  return `<div style="${alignStyle(b.alignment)}font:11px/1.5 ${escape(brand.fonts.body || 'Arial')},sans-serif;color:${b.color};">
    ${brand.companyName ? `<strong>${escape(brand.companyName)}</strong><br/>` : ''}
    ${brand.companyAddress ? escape(brand.companyAddress).replace(/\n/g, '<br/>') : ''}
  </div>`;
}

export function renderSocial(b: Extract<FooterBlock, { type: 'social' }>, brand: MarketingBrand): string {
  // Render icons via Simple Icons CDN — accepts a hex colour parameter so
  // we can match the brand-set colour exactly. Falls back to text label
  // via alt text in clients that block images.
  const size = b.iconSizePx ?? 24;
  const gap = b.gapPx ?? 12;
  const colourHex = (b.color || '#1a1a1a').replace('#', '');
  // Brand kit's socials are the single source of truth. block.social is
  // a per-block override (rarely needed); merge so any URL set on the
  // block wins, otherwise pull from brand.
  const merged: FooterSocial = { ...(brand.socials ?? {}), ...(b.social ?? {}) };
  const links = (Object.entries(merged) as Array<[keyof FooterSocial, string | undefined]>)
    .filter(([, url]) => Boolean(url && url.trim()))
    .map(([key, url]) => {
      const label = SOCIAL_LABELS[key] ?? String(key);
      const ref = SOCIAL_ICON_REFS[key] ?? { set: 'mdi', name: 'web' };
      const iconUrl = `https://api.iconify.design/${ref.set}/${ref.name}.svg?color=%23${colourHex}`;
      return `<a href="${escape(url!)}" style="text-decoration:none;display:inline-block;margin:0 ${Math.round(gap / 2)}px;" target="_blank" rel="noopener" title="${escape(label)}">` +
        `<img src="${iconUrl}" alt="${escape(label)}" width="${size}" height="${size}" style="display:inline-block;width:${size}px;height:${size}px;border:0;outline:none;text-decoration:none;" />` +
        `</a>`;
    })
    .join('');
  if (!links) return '';
  return `<div style="${alignStyle(b.alignment)}font:12px/1.5 ${escape(brand.fonts.body || 'Arial')},sans-serif;">${links}</div>`;
}

function renderUnsubscribe(
  b: Extract<FooterBlock, { type: 'unsubscribe' }>,
  brand: MarketingBrand,
  unsubscribeUrl: string | undefined,
): string {
  const href = unsubscribeUrl ?? '{{unsubscribeUrl}}';
  return `<div style="${alignStyle(b.alignment)}font:11px/1.5 ${escape(brand.fonts.body || 'Arial')},sans-serif;color:${b.color};">
    <a href="${escape(href)}" style="color:${b.color};text-decoration:underline;">${escape(b.label || 'Unsubscribe')}</a>
  </div>`;
}

function renderBlockInner(block: FooterBlock, brand: MarketingBrand, unsubscribeUrl: string | undefined): string {
  switch (block.type) {
    case 'logo':        return renderLogo(block, brand);
    case 'text':        return renderText(block);
    case 'spacer':      return renderSpacer(block);
    case 'divider':     return renderDivider(block);
    case 'address':     return renderAddress(block, brand);
    case 'social':      return renderSocial(block, brand);
    case 'unsubscribe': return renderUnsubscribe(block, brand, unsubscribeUrl);
    default:            return '';
  }
}

/** Wraps every block in a span carrying its id so the in-app preview can
 * highlight the currently-selected block via [data-block-id="..."] CSS.
 * Display:contents keeps the wrapper layout-neutral so mailbox providers
 * see the exact same DOM either way. */
function renderBlock(block: FooterBlock, brand: MarketingBrand, unsubscribeUrl: string | undefined): string {
  const inner = renderBlockInner(block, brand, unsubscribeUrl);
  if (!inner) return '';
  const top = block.paddingTopPx ?? 0;
  const bot = block.paddingBottomPx ?? 0;
  const padStyle = top || bot ? `padding:${top}px 0 ${bot}px 0;` : '';
  return `<div data-block-id="${block.id}" style="display:block;${padStyle}">${inner}</div>`;
}

// ─── Legacy shape detection + migration ───────────────────────────

interface LegacyFooterDesign {
  layout?: string;
  alignment?: FooterAlignment;
  blocks?: { logo: boolean; signature: boolean; address: boolean; social: boolean; unsubscribe: boolean };
  background?: string;
  textColor?: string;
  mutedColor?: string;
  borderTop?: boolean;
  borderColor?: string;
  paddingPx?: number;
  social?: FooterSocial;
}

function looksLegacy(d: unknown): d is LegacyFooterDesign {
  return Boolean(
    d && typeof d === 'object' &&
    !Array.isArray((d as { blocks?: unknown }).blocks) &&
    (d as { blocks?: { logo?: unknown } }).blocks !== undefined,
  );
}

function nid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function migrateLegacy(d: LegacyFooterDesign): FooterDesign {
  const align: FooterAlignment = d.alignment ?? 'center';
  const text = d.textColor ?? '#1a1a1a';
  const muted = d.mutedColor ?? '#666666';
  const blocks: FooterBlock[] = [];
  const enabled = d.blocks ?? { logo: true, signature: true, address: true, social: false, unsubscribe: true };
  if (enabled.logo)        blocks.push({ id: nid(), type: 'logo', alignment: align, maxWidthPx: 140 });
  // Legacy 'signature' block removed in Phase 13.6 — composed inline now.
  if (enabled.address)     blocks.push({ id: nid(), type: 'address', alignment: align, color: muted });
  if (enabled.social && d.social && Object.values(d.social).some(Boolean)) {
    blocks.push({ id: nid(), type: 'social', alignment: align, color: text, social: d.social });
  }
  if (enabled.unsubscribe || enabled.unsubscribe === undefined) {
    blocks.push({ id: nid(), type: 'divider', color: d.borderColor ?? '#e5e5e5', thicknessPx: 1, marginYPx: 16 });
    blocks.push({ id: nid(), type: 'unsubscribe', alignment: align, label: 'Unsubscribe from these emails', color: muted });
  }
  return {
    background: d.background ?? '#ffffff',
    paddingPx: d.paddingPx ?? 32,
    borderTop: d.borderTop ?? true,
    borderColor: d.borderColor ?? '#e5e5e5',
    blocks,
  };
}

/** Detects + migrates legacy footer_design rows into the new block shape. */
export function normaliseDesign(d: unknown): FooterDesign {
  if (!d) return DEFAULT_FOOTER_DESIGN;
  if (looksLegacy(d)) return migrateLegacy(d);
  // Already the new shape — shallow validate then return.
  const cur = d as Partial<FooterDesign>;
  return {
    background: cur.background ?? '#ffffff',
    paddingPx: cur.paddingPx ?? 32,
    borderTop: cur.borderTop ?? true,
    borderColor: cur.borderColor ?? '#e5e5e5',
    blocks: Array.isArray(cur.blocks) ? cur.blocks : DEFAULT_FOOTER_DESIGN.blocks,
  };
}

// ─── Public API ───────────────────────────────────────────────────

export function renderFooter(input: RenderInput): string {
  const { brand, unsubscribeUrl } = input;
  const design = normaliseDesign(brand.footerDesign);
  const inner = design.blocks
    .map((b) => renderBlock(b, brand, unsubscribeUrl))
    .filter(Boolean)
    .join('\n');
  if (!inner.trim()) return '';
  const borderTop = design.borderTop ? `border-top:1px solid ${design.borderColor};` : '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background:${design.background};${borderTop}width:100%;max-width:100%;">
    <tr><td style="padding:${design.paddingPx}px;">${inner}</td></tr>
  </table>`;
}

export function renderFooterText(input: RenderInput): string {
  const { brand, unsubscribeUrl } = input;
  const design = normaliseDesign(brand.footerDesign);
  const lines: string[] = [];
  for (const b of design.blocks) {
    switch (b.type) {
      case 'text':
        lines.push(b.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        break;
      case 'address':
        if (brand.companyName) lines.push(brand.companyName);
        if (brand.companyAddress) lines.push(brand.companyAddress);
        break;
      case 'social': {
        const socials = Object.entries(b.social).filter(([, v]) => Boolean(v && v.trim())).map(([k, v]) => `${k}: ${v}`);
        if (socials.length > 0) lines.push(socials.join(' | '));
        break;
      }
      case 'unsubscribe':
        lines.push(`${b.label || 'Unsubscribe'}: ${unsubscribeUrl ?? '{{unsubscribeUrl}}'}`);
        break;
    }
  }
  return lines.join('\n\n');
}

export { DEFAULT_FOOTER_DESIGN } from './types';
