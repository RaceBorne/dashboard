/**
 * lib/seo/productResearch.ts
 *
 * Helper for SEO meta generation across BOTH Evari own-brand items and
 * third-party products that the Evari store resells (Gtechniq cleaners,
 * Shimano components, Park Tool, etc.). The system prompt for Evari is
 * brand-narrow on purpose, so for non-Evari catalogue rows we want to
 * pull a small bundle of factual research about the actual product
 * before asking the model to write the meta. That way Mojito and the
 * /synopsis Fix-all flow can write good meta for tools and accessories
 * without trying to push them as Evari own-brand.
 */

import { isDataForSeoConnected, webSearchQuery } from '@/lib/integrations/dataforseo';

export type ProductBrandKind = 'evari' | 'third-party';

export interface ProductResearchInput {
  title: string;
  vendor?: string | null;
  bodyText: string;
  handle?: string | null;
}

export interface ProductResearchHit {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
}

export interface ProductResearchBundle {
  brandKind: ProductBrandKind;
  brand: string;
  productCategory: string | null;
  hits: ProductResearchHit[];
  contextBlock: string;
  searched: boolean;
}

const EVARI_VENDOR_TOKENS = ['evari', 'race borne', 'raceborne'];
const EVARI_HANDLE_PREFIXES = ['856-', '856_', '856cs', '856-core', '856-exp'];

export function classifyProductBrand(input: {
  title: string;
  vendor?: string | null;
  handle?: string | null;
}): { kind: ProductBrandKind; brand: string } {
  const vendor = (input.vendor ?? '').trim();
  const lowerVendor = vendor.toLowerCase();
  const lowerHandle = (input.handle ?? '').toLowerCase();
  const lowerTitle = input.title.toLowerCase();

  if (EVARI_VENDOR_TOKENS.some((t) => lowerVendor.includes(t))) {
    return { kind: 'evari', brand: vendor || 'Evari' };
  }
  if (EVARI_HANDLE_PREFIXES.some((p) => lowerHandle.startsWith(p))) {
    return { kind: 'evari', brand: 'Evari' };
  }
  if (lowerTitle.startsWith('856') || lowerTitle.includes('evari')) {
    return { kind: 'evari', brand: 'Evari' };
  }

  if (vendor) return { kind: 'third-party', brand: vendor };
  const firstWord = input.title.split(/\s+/)[0]?.replace(/[^A-Za-z0-9-]/g, '');
  return {
    kind: 'third-party',
    brand: firstWord && firstWord.length > 1 ? firstWord : 'Unknown',
  };
}

function inferCategory(title: string, body: string): string | null {
  const blob = (title + ' ' + body).toLowerCase();
  const map: Array<[string, RegExp]> = [
    ['bike cleaner', /bike\s*cleaner|degreaser|drivetrain\s*cleaner/],
    ['chain lube', /chain\s*lube|wax\s*lube|wet\s*lube|dry\s*lube/],
    ['bike tool', /multi[-\s]?tool|torque\s*wrench|hex\s*key|allen\s*key|spoke\s*key/],
    ['wireless groupset', /classified|wireless\s*shifting|di2|axs/],
    ['tyre / tube', /tyre|tire|tube|tubeless|sealant/],
    ['helmet', /helmet/],
    ['lights', /front\s*light|rear\s*light|bike\s*light|head\s*light|tail\s*light/],
    ['accessory', /mudguard|fender|bottle\s*cage|saddle\s*bag|pannier/],
    ['e-bike', /e[-\s]?bike|electric\s*bike|pedelec/],
    ['frame', /frame|frameset|monocoque/],
  ];
  for (const [label, re] of map) {
    if (re.test(blob)) return label;
  }
  return null;
}

export async function researchProductForSeo(
  input: ProductResearchInput,
  opts: { useWebSearch?: boolean } = {},
): Promise<ProductResearchBundle> {
  const useWebSearch = opts.useWebSearch ?? true;
  const cls = classifyProductBrand({
    title: input.title,
    vendor: input.vendor,
    handle: input.handle,
  });
  const category = inferCategory(input.title, input.bodyText);

  if (cls.kind === 'evari') {
    return {
      brandKind: 'evari',
      brand: cls.brand,
      productCategory: category,
      hits: [],
      searched: false,
      contextBlock: [
        'Brand: ' + cls.brand + ' (own-brand Evari catalogue item)',
        category ? 'Category hint: ' + category : '',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  let hits: ProductResearchHit[] = [];
  let searched = false;
  if (useWebSearch && isDataForSeoConnected()) {
    try {
      const query = (cls.brand + ' ' + input.title).replace(/\s+/g, ' ').trim();
      const result = await webSearchQuery({ query, limit: 5 });
      hits = result.hits.slice(0, 3).map((h) => ({
        title: h.title,
        url: h.url,
        domain: h.domain ?? '',
        snippet: h.snippet,
      }));
      searched = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[productResearch] web search failed for "' +
          input.title +
          '": ' +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  const lines: string[] = [
    'Brand: ' + cls.brand + ' (third-party product resold by Evari)',
  ];
  if (category) lines.push('Category hint: ' + category);
  if (hits.length > 0) {
    lines.push('');
    lines.push('Top web-search results for this product:');
    for (const [i, h] of hits.entries()) {
      lines.push('  ' + (i + 1) + '. ' + h.title + ' — ' + h.domain);
      if (h.snippet) lines.push('     ' + h.snippet.slice(0, 220));
    }
  }

  return {
    brandKind: 'third-party',
    brand: cls.brand,
    productCategory: category,
    hits,
    searched,
    contextBlock: lines.join('\n'),
  };
}

export function brandVoiceInstruction(brandKind: ProductBrandKind): string {
  if (brandKind === 'evari') {
    return 'This is an Evari own-brand product. Use Evari voice: calm, specific, founder-led. Lead with the model name (e.g. "856 Core") and what makes it distinct. The shop and the brand are both Evari.';
  }
  return 'This is a THIRD-PARTY product that Evari resells. Do NOT pretend it is an Evari design and do NOT push Evari brand voice onto it. Write factually about the actual product. Lead with the manufacturer brand and the product type. Mentioning Evari as the seller is fine but optional. Goal: an honest meta that helps shoppers searching for this exact product find it.';
}
