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
  const size = b.fontSizePx ?? sizes[b.level];
  const weight = b.fontWeight ?? 700;
  const tracking = typeof b.letterSpacingEm === 'number' ? `letter-spacing:${b.letterSpacingEm}em;` : '';
  const tt = b.textTransform && b.textTransform !== 'none' ? `text-transform:${b.textTransform};` : '';
  return `<div style="${alignStyle(b.alignment)}font:${weight} ${size}px/1.25 ${fontFor(brand, b.fontFamily)}Arial,sans-serif;color:${b.color};${tracking}${tt}">${safeHtml(b.html)}</div>`;
}

function renderText(b: Extract<EmailBlock, { type: 'text' }>, brand: MarketingBrand): string {
  const weight = b.fontWeight ?? 400;
  const tracking = typeof b.letterSpacingEm === 'number' ? `letter-spacing:${b.letterSpacingEm}em;` : '';
  const tt = b.textTransform && b.textTransform !== 'none' ? `text-transform:${b.textTransform};` : '';
  return `<div style="${alignStyle(b.alignment)}font:${weight} ${b.fontSizePx}px/${b.lineHeight} ${fontFor(brand, b.fontFamily)}Arial,sans-serif;color:${b.color};${tracking}${tt}">${safeHtml(b.html)}</div>`;
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

// ─── Phase 14C: extended renderers ────────────────────────────

function renderSplit(b: Extract<EmailBlock, { type: 'split' }>, brand: MarketingBrand): string {
  const img = b.imageSrc
    ? `<img src="${escape(b.imageSrc)}" alt="${escape(b.imageAlt)}" style="display:block;width:100%;max-width:280px;height:auto;border:0;" />`
    : '';
  const button = b.buttonLabel && b.buttonUrl
    ? `<div style="margin-top:12px;"><a href="${escape(b.buttonUrl)}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:4px;font:bold 13px Arial,sans-serif;text-decoration:none;">${escape(b.buttonLabel)}</a></div>`
    : '';
  const text = `<div style="font:${b.fontSizePx}px/${b.lineHeight} ${fontFor(brand, '')}Arial,sans-serif;color:${b.color};">${safeHtml(b.html)}${button}</div>`;
  const cells = b.imagePosition === 'right'
    ? `<td valign="top" width="50%" style="padding-right:12px;">${text}</td><td valign="top" width="50%">${img}</td>`
    : `<td valign="top" width="50%" style="padding-right:12px;">${img}</td><td valign="top" width="50%">${text}</td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}


function renderBrandLogo(b: Extract<EmailBlock, { type: 'brandLogo' }>, brand: MarketingBrand): string {
  // Resolve: per-block override > matching brand kit variant > the
  // other variant if the chosen one isn't set. Empty out gracefully.
  const fallback = b.variant === 'dark' ? brand.logoDarkUrl : brand.logoLightUrl;
  const otherFallback = b.variant === 'dark' ? brand.logoLightUrl : brand.logoDarkUrl;
  const src = b.srcOverride || fallback || otherFallback || '';
  if (!src) return '';
  const opacityStyle = typeof b.opacity === 'number' && b.opacity < 1 ? `opacity:${b.opacity};` : '';
  const img = `<img src="${escape(src)}" alt="${escape(brand.companyName ?? 'Logo')}" style="display:inline-block;width:${b.widthPx}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;${opacityStyle}" />`;
  const wrapped = b.linkUrl ? `<a href="${escape(b.linkUrl)}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block;">${img}</a>` : img;
  return `<div style="${alignStyle(b.alignment)}">${wrapped}</div>`;
}

function renderHeaderBar(b: Extract<EmailBlock, { type: 'headerBar' }>, brand: MarketingBrand): string {
  const logoSrc = b.logoUrl || brand.logoLightUrl || '';
  const logo = logoSrc ? `<img src="${escape(logoSrc)}" alt="${escape(brand.companyName ?? 'Logo')}" style="display:block;height:32px;width:auto;border:0;" />` : '';
  const tagline = b.tagline ? `<span style="font:13px Arial,sans-serif;color:${b.textColor};">${safeHtml(b.tagline)}</span>` : '';
  const inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle">${logo}</td><td valign="middle" align="right">${tagline}</td></tr></table>`;
  const wrapped = b.linkUrl ? `<a href="${escape(b.linkUrl)}" style="text-decoration:none;color:inherit;">${inner}</a>` : inner;
  return `<div style="background:${b.backgroundColor};padding:14px 20px;color:${b.textColor};">${wrapped}</div>`;
}


const SHADOW_STYLES: Record<'sm' | 'md' | 'lg', string> = {
  sm: '0 1px 2px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
  md: '0 4px 6px rgba(0,0,0,0.07), 0 10px 15px rgba(0,0,0,0.06)',
  lg: '0 10px 15px rgba(0,0,0,0.10), 0 20px 25px rgba(0,0,0,0.08)',
};

function renderCard(b: Extract<EmailBlock, { type: 'card' }>, brand: MarketingBrand): string {
  return `<div style="background:${b.backgroundColor};border-radius:${b.borderRadiusPx}px;padding:${b.paddingPx}px;box-shadow:${SHADOW_STYLES[b.shadow] ?? SHADOW_STYLES.md};font:14px/1.55 ${fontFor(brand, '')}Arial,sans-serif;">${safeHtml(b.html)}</div>`;
}

const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  twitter:   'X',
  linkedin:  'LinkedIn',
  facebook:  'Facebook',
  tiktok:    'TikTok',
  youtube:   'YouTube',
  website:   'Website',
};

function renderSocial(b: Extract<EmailBlock, { type: 'social' }>): string {
  const links = (b.items ?? [])
    .filter((it) => it.url && it.url.trim())
    .map((it) => `<a href="${escape(it.url)}" target="_blank" rel="noopener" style="display:inline-block;color:${b.iconColor};text-decoration:none;font:bold 13px Arial,sans-serif;margin:0 8px;">${escape(SOCIAL_LABELS[it.platform] ?? it.platform)}</a>`)
    .join('<span style="color:' + b.iconColor + ';opacity:0.4;">·</span>');
  if (!links) return '';
  return `<div style="${alignStyle(b.alignment)}">${links}</div>`;
}

function renderCoupon(b: Extract<EmailBlock, { type: 'coupon' }>): string {
  return `<div style="border:2px dashed ${b.borderColor};background:${b.backgroundColor};padding:24px;text-align:center;color:${b.textColor};font-family:Arial,sans-serif;">
    ${b.title ? `<div style="font:bold 14px Arial,sans-serif;letter-spacing:0.05em;text-transform:uppercase;color:${b.textColor};margin-bottom:8px;">${escape(b.title)}</div>` : ''}
    <div style="font:bold 28px/1.1 'Courier New',monospace;letter-spacing:0.1em;color:${b.textColor};margin:8px 0;">${escape(b.code)}</div>
    ${b.subtitle ? `<div style="font:14px/1.4 Arial,sans-serif;color:${b.textColor};opacity:0.8;margin-top:8px;">${escape(b.subtitle)}</div>` : ''}
    ${b.expiry ? `<div style="font:11px Arial,sans-serif;color:${b.textColor};opacity:0.6;margin-top:12px;">Valid until ${escape(b.expiry)}</div>` : ''}
  </div>`;
}

function renderTable(b: Extract<EmailBlock, { type: 'table' }>): string {
  const rows = (b.rows ?? []).map((r, i) => `
    <tr style="background:${i % 2 === 0 ? 'transparent' : b.stripeColor};">
      <td style="padding:8px 12px;border-top:1px solid ${b.borderColor};font:13px Arial,sans-serif;color:#333;">${escape(r.label)}</td>
      <td style="padding:8px 12px;border-top:1px solid ${b.borderColor};font:13px Arial,sans-serif;color:#333;text-align:right;">${escape(r.value)}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${b.borderColor};border-collapse:collapse;">
    <tr style="background:${b.stripeColor};"><th align="left" style="padding:8px 12px;font:bold 12px Arial,sans-serif;letter-spacing:0.05em;text-transform:uppercase;color:#666;">${escape(b.headerLabel)}</th><th align="right" style="padding:8px 12px;font:bold 12px Arial,sans-serif;letter-spacing:0.05em;text-transform:uppercase;color:#666;">${escape(b.headerValue)}</th></tr>
    ${rows}
  </table>`;
}

function renderReview(b: Extract<EmailBlock, { type: 'review' }>): string {
  const stars = '★'.repeat(Math.max(0, Math.min(5, Math.round(b.rating)))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Math.round(b.rating))));
  return `<div style="background:${b.backgroundColor};padding:24px;border-radius:6px;font-family:Arial,sans-serif;">
    ${b.rating ? `<div style="color:#d4a017;font-size:16px;letter-spacing:2px;margin-bottom:10px;">${stars}</div>` : ''}
    <blockquote style="margin:0 0 12px 0;font:italic 16px/1.55 Georgia,serif;color:#222;">"${safeHtml(b.quote)}"</blockquote>
    <div style="font:bold 13px Arial,sans-serif;color:#333;">${escape(b.author)}</div>
    ${b.role ? `<div style="font:11px Arial,sans-serif;color:#777;">${escape(b.role)}</div>` : ''}
  </div>`;
}

function renderVideo(b: Extract<EmailBlock, { type: 'video' }>): string {
  if (!b.thumbnailSrc || !b.videoUrl) return '';
  // Email clients don't run JS; we render a clickable thumbnail with a play overlay.
  // The play overlay is a CSS triangle inside a circle, served via an inline SVG data-uri.
  const playOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="rgba(0,0,0,0.5)"/><polygon points="26,20 26,44 46,32" fill="white"/></svg>`;
  const playDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(playOverlay)}`;
  return `<div style="${alignStyle(b.alignment)}">
    <a href="${escape(b.videoUrl)}" target="_blank" rel="noopener" style="display:inline-block;position:relative;text-decoration:none;">
      <img src="${escape(b.thumbnailSrc)}" alt="${escape(b.alt)}" style="display:block;max-width:100%;width:${b.maxWidthPx}px;height:auto;border:0;" />
      <img src="${playDataUrl}" alt="" style="position:absolute;top:50%;left:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border:0;" />
    </a>
  </div>`;
}

function renderProduct(b: Extract<EmailBlock, { type: 'product' }>, brand: MarketingBrand): string {
  const img = b.imageSrc ? `<img src="${escape(b.imageSrc)}" alt="${escape(b.imageAlt)}" style="display:block;width:100%;max-width:100%;height:auto;border:0;" />` : '';
  const button = b.buttonLabel && b.buttonUrl
    ? `<a href="${escape(b.buttonUrl)}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:4px;font:bold 13px Arial,sans-serif;text-decoration:none;margin-top:12px;">${escape(b.buttonLabel)}</a>`
    : '';
  return `<div style="background:${b.backgroundColor};border-radius:6px;overflow:hidden;font-family:${fontFor(brand, '')}Arial,sans-serif;">
    ${img}
    <div style="padding:20px;">
      <div style="font:bold 18px/1.3 Arial,sans-serif;color:#111;margin-bottom:6px;">${escape(b.title)}</div>
      ${b.price ? `<div style="font:bold 16px Arial,sans-serif;color:#444;margin-bottom:8px;">${escape(b.price)}</div>` : ''}
      ${b.description ? `<div style="font:14px/1.55 Arial,sans-serif;color:#555;">${safeHtml(b.description)}</div>` : ''}
      ${button}
    </div>
  </div>`;
}

/**
 * Normalise a section's background fill mode (which now includes Klaviyo-style
 * 'original' | 'fit' | 'fill' | 'tile' alongside the legacy CSS values) into
 * the actual CSS `background-size` + `background-repeat` pair.
 */
export function bgFillCss(mode: string | undefined): { size: string; repeat: string } {
  switch (mode) {
    case 'tile':                         return { size: 'auto',    repeat: 'repeat' };
    case 'original':
    case 'auto':                         return { size: 'auto',    repeat: 'no-repeat' };
    case 'fit':
    case 'contain':                      return { size: 'contain', repeat: 'no-repeat' };
    case 'fill':
    case 'cover':
    default:                             return { size: 'cover',   repeat: 'no-repeat' };
  }
}

function renderSection(b: Extract<EmailBlock, { type: 'section' }>, brand: MarketingBrand): string {
  const children = (b.blocks ?? []).map((c) => renderBlock(c, brand)).filter(Boolean).join('');
  // Legacy fallback: pre-container sections stored their content as html.
  const inner = children || (b.html ? safeHtml(b.html) : '');
  // Vertical alignment — uses flex when set so 'middle' / 'bottom' actually
  // push content down even when min-height is larger than content height.
  // Announcement-bar sections default to centred when nothing's been set.
  const ay = b.contentAlignY ?? (b.kind === 'announcementBar' ? 'middle' : undefined);
  const flex = ay && ay !== 'top'
    ? `display:flex;flex-direction:column;justify-content:${ay === 'middle' ? 'center' : 'flex-end'};`
    : '';
  const styles = [
    `background-color:${b.backgroundColor}`,
    b.backgroundImage ? `background-image:url(${escape(b.backgroundImage)})` : '',
    (() => { const css = bgFillCss(b.backgroundSize); return `background-size:${css.size};background-repeat:${css.repeat}`; })(),
    `background-position:${b.backgroundPosition ?? 'center'}`,
    `border-radius:${b.borderRadiusPx}px`,
    `padding:${b.paddingPx}px`,
    b.minHeightPx ? `min-height:${b.minHeightPx}px` : '',
    b.contentColor ? `color:${b.contentColor}` : '',
    `font:14px/1.55 ${fontFor(brand, '')}Arial,sans-serif`,
    flex,
  ].filter(Boolean).join(';');
  return `<div style="${styles}">${inner}</div>`;
}

function renderInner(b: EmailBlock, brand: MarketingBrand): string {
  switch (b.type) {
    case 'heading':   return renderHeading(b, brand);
    case 'text':      return renderText(b, brand);
    case 'image':     return renderImage(b);
    case 'button':    return renderButton(b);
    case 'divider':   return renderDivider(b);
    case 'spacer':    return renderSpacer(b);
    case 'html':      return renderRawHtml(b);
    case 'split':     return renderSplit(b, brand);
    case 'headerBar': return renderHeaderBar(b, brand);
    case 'brandLogo': return renderBrandLogo(b, brand);
    case 'card':      return renderCard(b, brand);
    case 'social':    return renderSocial(b);
    case 'coupon':    return renderCoupon(b);
    case 'table':     return renderTable(b);
    case 'review':    return renderReview(b);
    case 'video':     return renderVideo(b);
    case 'product':   return renderProduct(b, brand);
    case 'section':   return renderSection(b, brand);
    default:          return '';
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

/**
 * Render a single block to its email-safe HTML wrapper. Used by the
 * interactive canvas (each block becomes its own React node + we drop
 * its rendered HTML inside via dangerouslySetInnerHTML).
 */
export function renderEmailBlockHtml(block: EmailBlock, brand: MarketingBrand): string {
  return renderBlock(block, brand);
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

/**
 * Build the <style> block for an email document — @font-face for the
 * brand's uploaded custom fonts, plus a Google Fonts @import for
 * heading/body families that aren't custom (and aren't system fonts).
 * Same logic used at send time in lib/marketing/sender.ts; centralised
 * here so the preview iframe, template thumbnails, and the sent
 * payload all use identical typography setup.
 */
export function brandStyleBlock(brand: MarketingBrand): string {
  const fontFaceBlocks = (brand.customFonts ?? [])
    .map(
      (f) =>
        `@font-face{font-family:'${f.name}';font-style:${f.style};` +
        `font-weight:${f.weight};font-display:swap;` +
        `src:url('${f.url}') format('${f.format}');}`,
    )
    .join('\n');
  const customNames = new Set((brand.customFonts ?? []).map((f) => f.name));
  const headingFamily = brand.fonts?.heading || 'Arial';
  const bodyFamily    = brand.fonts?.body    || 'Arial';
  const systemFonts = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS'];
  const gFonts = [headingFamily, bodyFamily]
    .filter((n) => !customNames.has(n))
    .filter((n) => !systemFonts.includes(n));
  const gImport = gFonts.length > 0
    ? `@import url('https://fonts.googleapis.com/css2?${gFonts.map((n) => `family=${encodeURIComponent(n).replace(/%20/g, '+')}`).join('&')}&display=swap');`
    : '';
  if (!fontFaceBlocks && !gImport) return '';
  return `<style type="text/css">${gImport}${fontFaceBlocks}` +
    `body,td,p,div,a,span{font-family:'${bodyFamily}',Arial,sans-serif;}` +
    `h1,h2,h3,h4,h5,h6{font-family:'${headingFamily}',Arial,sans-serif;}` +
    `</style>`;
}

export function renderEmailDesign(design: EmailDesign, brand: MarketingBrand): string {
  const inner = design.blocks.map((b) => renderBlock(b, brand)).filter(Boolean).join('\n');
  const styles = brandStyleBlock(brand);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title></title>
  ${styles}
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
