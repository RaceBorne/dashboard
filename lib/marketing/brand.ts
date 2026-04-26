/**
 * Brand kit repository — singleton table dashboard_mkt_brand. Holds
 * the shared design tokens (colors, fonts, logos, signature) the
 * email builder + sender pull from at compose time.
 *
 * The row is seeded by the Phase 11 migration so getBrand() never
 * returns null. Updates are idempotent via upsert-on-id.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { BrandColors, BrandFonts, MarketingBrand } from './types';

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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getBrand(): Promise<MarketingBrand> {
  const sb = createSupabaseAdmin();
  if (!sb) return DEFAULTS;
  const { data, error } = await sb
    .from('dashboard_mkt_brand')
    .select('*')
    .eq('id', 'singleton')
    .maybeSingle();
  if (error) {
    console.error('[mkt.brand.get]', error);
    return DEFAULTS;
  }
  if (!data) return DEFAULTS;
  return rowToBrand(data as BrandRow);
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
