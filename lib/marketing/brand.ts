/**
 * Brand kit repository — singleton table dashboard_mkt_brand. Holds
 * the shared design tokens (colors, fonts, logos, signature) the
 * email builder + sender pull from at compose time.
 *
 * The row is seeded by the Phase 11 migration so getBrand() never
 * returns null. Updates are idempotent via upsert-on-id.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { renderSignature } from '@/lib/dashboard/signature';
import { DEFAULT_SIGNATURE_HTML } from '@/lib/mock/senders';
import type { BrandColors, BrandFonts, CustomFont, MarketingBrand } from './types';

interface BrandRow {
  id: 'singleton';
  company_name: string | null;
  company_address: string | null;
  reply_to_email: string | null;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  colors: BrandColors;
  fonts: BrandFonts;
  signature_html: string | null;
  custom_fonts: unknown;
  created_at: string;
  updated_at: string;
}

const DEFAULTS: MarketingBrand = {
  id: 'singleton',
  companyName: null,
  companyAddress: null,
  replyToEmail: null,
  logoLightUrl: null,
  logoDarkUrl: null,
  colors: {
    primary:    '#1a1a1a',
    accent:     '#d4a017',
    text:       '#1a1a1a',
    bg:         '#ffffff',
    link:       '#0066cc',
    buttonBg:   '#1a1a1a',
    buttonText: '#ffffff',
    muted:      '#666666',
  },
  fonts: { heading: 'Inter', body: 'Inter' },
  signatureHtml: null,
  signatureOverride: null,
  customFonts: [],
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

function rowToBrand(r: BrandRow): MarketingBrand {
  return {
    id: r.id,
    companyName: r.company_name,
    companyAddress: r.company_address,
    replyToEmail: r.reply_to_email,
    logoLightUrl: r.logo_light_url,
    logoDarkUrl: r.logo_dark_url,
    colors: r.colors,
    fonts: r.fonts,
    signatureHtml: r.signature_html,
    signatureOverride: r.signature_html,
    customFonts: Array.isArray(r.custom_fonts) ? (r.custom_fonts as CustomFont[]) : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Resolve the unified brand kit by merging three Supabase sources:
 *
 *   1. dashboard_mkt_brand           — colours, fonts, copy
 *   2. dashboard_branding            — logo data URLs (per-theme),
 *                                      the same one Settings → Branding
 *                                      writes to. Single source of truth
 *                                      for logos across the whole app.
 *   3. dashboard_outreach_senders    — display name / role / phone for
 *                                      the default sender. Used to render
 *                                      the DEFAULT_SIGNATURE_HTML template
 *                                      when the brand kit's signature_html
 *                                      column is null.
 *
 * Anything explicitly saved on dashboard_mkt_brand wins. Logos are NOT
 * stored on dashboard_mkt_brand any more — the columns exist as a
 * fallback but the live read prefers dashboard_branding so editing
 * logos in Settings flows through to email immediately.
 */
export async function getBrand(): Promise<MarketingBrand> {
  const sb = createSupabaseAdmin();
  if (!sb) return DEFAULTS;

  const [mktRes, brandingRes, senderRes] = await Promise.all([
    sb.from('dashboard_mkt_brand')
      .select('*').eq('id', 'singleton').maybeSingle(),
    sb.from('dashboard_branding')
      .select('logo_light_data_url, logo_dark_data_url')
      .eq('id', 'singleton').maybeSingle(),
    sb.from('dashboard_outreach_senders')
      .select('payload')
      .order('created_at', { ascending: true })
      .limit(1).maybeSingle(),
  ]);

  if (mktRes.error)      console.error('[mkt.brand.get mkt]', mktRes.error);
  if (brandingRes.error) console.error('[mkt.brand.get branding]', brandingRes.error);
  if (senderRes.error)   console.error('[mkt.brand.get sender]', senderRes.error);

  const base = mktRes.data ? rowToBrand(mktRes.data as BrandRow) : DEFAULTS;

  // Prefer logos from dashboard_branding (Settings → Branding). Only
  // fall back to the brand-kit columns (or null) if Settings has none.
  const branding = brandingRes.data as
    | { logo_light_data_url: string | null; logo_dark_data_url: string | null }
    | null;
  const logoLightUrl = branding?.logo_light_data_url ?? base.logoLightUrl ?? null;
  const logoDarkUrl  = branding?.logo_dark_data_url  ?? base.logoDarkUrl  ?? null;

  // If brand kit doesn't have an explicit signature, render the default
  // template using whatever metadata the first outreach sender carries.
  let signatureHtml = base.signatureHtml;
  if (!signatureHtml) {
    const senderRow = senderRes.data as { payload: Record<string, unknown> } | null;
    const p = senderRow?.payload ?? {};
    signatureHtml = renderSignature({
      displayName:   String(p.displayName ?? 'Evari'),
      role:          (p.role as string | undefined) || undefined,
      email:         String(p.email ?? base.replyToEmail ?? 'hello@evari.cc'),
      phone:         (p.phone as string | undefined) || undefined,
      website:       (p.website as string | undefined) || 'evari.cc',
      logoUrl:       (p.logoUrl as string | undefined) || logoLightUrl || undefined,
      signatureHtml: DEFAULT_SIGNATURE_HTML,
    });
  }

  return {
    ...base,
    logoLightUrl,
    logoDarkUrl,
    signatureHtml,                  // resolved (rendered if no override)
    signatureOverride: base.signatureOverride, // raw column value
  };
}

export async function updateBrand(
  patch: Partial<{
    companyName: string | null;
    companyAddress: string | null;
    replyToEmail: string | null;
    logoLightUrl: string | null;
    logoDarkUrl: string | null;
    colors: BrandColors;
    fonts: BrandFonts;
    signatureHtml: string | null;
  }>,
): Promise<MarketingBrand | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const dbPatch: Record<string, unknown> = {};
  if ('companyName' in patch)     dbPatch.company_name = patch.companyName;
  if ('companyAddress' in patch)  dbPatch.company_address = patch.companyAddress;
  if ('replyToEmail' in patch)    dbPatch.reply_to_email = patch.replyToEmail;
  if ('logoLightUrl' in patch)    dbPatch.logo_light_url = patch.logoLightUrl;
  if ('logoDarkUrl' in patch)     dbPatch.logo_dark_url = patch.logoDarkUrl;
  if ('colors' in patch)          dbPatch.colors = patch.colors;
  if ('fonts' in patch)           dbPatch.fonts = patch.fonts;
  if ('signatureHtml' in patch)   dbPatch.signature_html = patch.signatureHtml;
  if (Object.keys(dbPatch).length === 0) return getBrand();
  const { data, error } = await sb
    .from('dashboard_mkt_brand')
    .update(dbPatch)
    .eq('id', 'singleton')
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.brand.update]', error);
    return null;
  }
  return rowToBrand(data as BrandRow);
}


export async function appendCustomFont(font: CustomFont): Promise<MarketingBrand | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const current = await getBrand();
  const others = current.customFonts.filter((f) => f.name !== font.name);
  const next = [...others, font];
  const { data, error } = await sb
    .from('dashboard_mkt_brand')
    .update({ custom_fonts: next })
    .eq('id', 'singleton')
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.brand.appendCustomFont]', error);
    return null;
  }
  return rowToBrand(data as never);
}

export async function removeCustomFont(name: string): Promise<MarketingBrand | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const current = await getBrand();
  const next = current.customFonts.filter((f) => f.name !== name);
  const { data, error } = await sb
    .from('dashboard_mkt_brand')
    .update({ custom_fonts: next })
    .eq('id', 'singleton')
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.brand.removeCustomFont]', error);
    return null;
  }
  return rowToBrand(data as never);
}
