/**
 * Google Places API (New) adapter for the Source Prospects sourcing agent.
 *
 * Uses the Text Search endpoint (places:searchText) which accepts a natural
 * query like "cycling club in Surrey" and returns structured places with
 * types, address, website, phone. Far stricter geography than DataForSEO's
 * business_listings endpoint — biased via regionCode (e.g. "GB" for UK).
 *
 * Requires GOOGLE_PLACES_API_KEY env var. In Google Cloud:
 *   1. Enable "Places API (New)".
 *   2. Create an API key (restrict to Places API for safety + IP-lock in prod).
 *   3. Drop the key in .env.local as GOOGLE_PLACES_API_KEY.
 *
 * Cost note: Google bills per field-mask tier. We request Essentials +
 * Contact fields (website + phone) for ~$0.035/request. Text Search has no
 * equivalent of DFS's per-query `cost` in the response, so we estimate.
 *
 * The returned shape intentionally matches `BusinessListing` from the DFS
 * adapter so Source Prospects can swap providers without touching callers.
 */

import type { BusinessListing } from './dataforseo';

const GOOGLE_PLACES_BASE = 'https://places.googleapis.com/v1';

// Field mask controls which fields come back AND how Google bills the call.
// Keep this minimal. Any addition (especially editorial_summary or reviews)
// bumps the tier. See:
// https://developers.google.com/maps/documentation/places/web-service/text-search#field-mask
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.types',
  'places.primaryType',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.location',
].join(',');

// Text Search Essentials ($5/1k) + Contact SKU (+$3/1k for phone/website) =
// ~$0.008/request in practice at 2025 pricing. We round up generously for
// cost-tracking so nobody's surprised by a bill. Revisit when Google changes
// pricing tiers.
const ESTIMATED_COST_PER_REQUEST_USD = 0.0085;

export function isGooglePlacesConnected(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

interface GooglePlaceResult {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  types?: string[];
  primaryType?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  location?: { latitude?: number; longitude?: number };
}

interface GoogleSearchTextResponse {
  places?: GooglePlaceResult[];
  error?: { code: number; message: string; status: string };
}

/**
 * Map a DFS-style locationName tail ("Surrey, England, United Kingdom") to
 * an ISO 3166-1 alpha-2 region code ("GB"). Returns undefined when we can't
 * identify the country — caller skips regionCode biasing so Google falls
 * back to global.
 */
function deriveRegionCode(locationName: string): string | undefined {
  const tail = locationName.split(',').pop()?.trim().toLowerCase();
  if (!tail) return undefined;
  const map: Record<string, string> = {
    'united kingdom': 'GB',
    uk: 'GB',
    england: 'GB',
    scotland: 'GB',
    wales: 'GB',
    'northern ireland': 'GB',
    'united states': 'US',
    usa: 'US',
    canada: 'CA',
    australia: 'AU',
    germany: 'DE',
    france: 'FR',
    spain: 'ES',
    italy: 'IT',
    ireland: 'IE',
    netherlands: 'NL',
    belgium: 'BE',
  };
  return map[tail];
}

function extractDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url.startsWith('http') ? url : 'https://' + url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/**
 * Search Google Places via Text Search. `query` is the natural-language
 * keyword (e.g. "cycling club", "private knee clinic", "yacht broker").
 * `locationName` is folded into the textQuery AND used to derive regionCode.
 * `includedType` hard-filters to one Google Places type (e.g. "sports_club",
 * "gym", "bicycle_store", "doctor", "dental_clinic") with strictTypeFiltering
 * so only results of that type come back.
 *
 * Full type list:
 * https://developers.google.com/maps/documentation/places/web-service/place-types
 */
export async function searchPlaces(opts: {
  query: string;
  locationName?: string;
  limit?: number;
  includedType?: string;
}): Promise<{ listings: BusinessListing[]; cost: number }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY is not set');
  }

  // Text Search max is 20 results/page and pagination requires a pageToken.
  // For v1 we take the first page (20 is plenty — the planner fans out across
  // multiple queries anyway).
  const maxResultCount = Math.min(Math.max(opts.limit ?? 20, 1), 20);

  // Fold locationName into textQuery so "Surrey" or "Kent" biases the search
  // even when regionCode alone (country-level) isn't specific enough.
  const textQuery = opts.locationName
    ? opts.query + ' in ' + opts.locationName
    : opts.query;

  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount,
    languageCode: 'en',
  };
  const regionCode = opts.locationName
    ? deriveRegionCode(opts.locationName)
    : undefined;
  if (regionCode) body.regionCode = regionCode;
  if (opts.includedType) {
    body.includedType = opts.includedType;
    body.strictTypeFiltering = true;
  }

  const res = await fetch(`${GOOGLE_PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const data = (await res.json()) as GoogleSearchTextResponse;
  if (!res.ok || data.error) {
    const msg = data.error?.message ?? res.statusText;
    throw new Error(`Google Places searchText failed: ${res.status} ${msg}`);
  }

  const listings: BusinessListing[] = (data.places ?? [])
    .filter((p) => Boolean(p.displayName?.text))
    .map((p) => ({
      title: p.displayName!.text as string,
      url: p.websiteUri,
      phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber,
      domain: extractDomain(p.websiteUri),
      address: p.formattedAddress,
      rating:
        p.rating !== undefined
          ? { value: p.rating, votes_count: p.userRatingCount }
          : undefined,
      category: p.primaryType ?? p.types?.[0],
      categoryIds: p.types,
      latitude: p.location?.latitude,
      longitude: p.location?.longitude,
      placeId: p.id,
    }));

  return { listings, cost: ESTIMATED_COST_PER_REQUEST_USD };
}
