/**
 * Shape of the Evari brand brief used to ground every AI call.
 *
 * Stored as a single row in dashboard_brand_brief (id='brand_brief') and
 * refreshed weekly by /api/cron/brand-refresh. Also seeded from
 * content/brand/evari_brand_brief.json on first read if the Supabase row
 * is missing.
 */
export interface BrandBrief {
  id: 'brand_brief';
  version: number;
  sourceUrl: string;
  updatedAt: string;
  refreshCadence: 'weekly' | 'monthly' | 'manual';
  company: BrandCompany;
  oneLiner: string;
  positioning: BrandPositioning;
  voice: BrandVoice;
  products: BrandProducts;
  audiences: BrandAudiences;
  differentiators: string[];
  partners: string[];
  pricing: { positioning: string; tone: string };
  messagingAnchors: string[];
  outreachRules: {
    whenWritingCopy: string[];
    whenSourcingProspects: string[];
  };
  socialLinks: {
    website: string;
    linkedin?: string;
    facebook?: string;
    instagramHandle?: string;
  };
}

export interface BrandCompany {
  name: string;
  legalName?: string;
  companiesHouseNumber?: string;
  founded?: number;
  headquarters?: string;
  developedAt?: string;
  founder?: string;
  founderBackground?: string;
  branding?: string;
  engineeringPartner?: string;
  awards?: string[];
  exhibits?: string[];
}

export interface BrandPositioning {
  summary: string;
  pillars: string[];
  notFor: string[];
}

export interface BrandVoice {
  tone: string[];
  do: string[];
  dont: string[];
}

export interface BrandProducts {
  sole: string;
  family: Array<{
    model: string;
    transmission?: string;
    finish?: string;
    priceApprox?: string;
    audience?: string;
  }>;
  sharedSpecs: Record<string, string | number>;
}

export interface BrandAudiences {
  primary: Array<{ label: string; description: string }>;
  accountExamples: string[];
}
