/**
 * Shopify Admin GraphQL client.
 *
 * Thin typed wrapper around fetch() that:
 *  - Points at the right Admin GraphQL endpoint for the configured store
 *  - Attaches X-Shopify-Access-Token
 *  - Normalises the two ways Shopify reports failure:
 *      (a) HTTP error (401/403/429/5xx)
 *      (b) HTTP 200 with a populated top-level `errors` array, or
 *          a populated `userErrors` array inside the mutation payload
 *  - Surfaces throttle status + cost (`extensions.cost`) so the caller
 *    can decide whether to backoff or batch
 *  - Retries once on 429 with the `Retry-After` delay
 *
 * Keep this module free of domain concepts. The adapter file
 * (lib/integrations/shopify.ts) is where product/page/order logic lives.
 */

export interface ShopifyCost {
  requestedQueryCost: number;
  actualQueryCost: number;
  throttleStatus: {
    maximumAvailable: number;
    currentlyAvailable: number;
    restoreRate: number;
  };
}

export interface ShopifyUserError {
  field?: string[] | null;
  message: string;
  code?: string | null;
}

export class ShopifyApiError extends Error {
  readonly status: number;
  readonly graphqlErrors?: Array<{ message: string; [k: string]: unknown }>;
  readonly userErrors?: ShopifyUserError[];
  readonly requestId?: string;

  constructor(
    message: string,
    opts: {
      status?: number;
      graphqlErrors?: Array<{ message: string; [k: string]: unknown }>;
      userErrors?: ShopifyUserError[];
      requestId?: string;
    } = {},
  ) {
    super(message);
    this.name = 'ShopifyApiError';
    this.status = opts.status ?? 0;
    this.graphqlErrors = opts.graphqlErrors;
    this.userErrors = opts.userErrors;
    this.requestId = opts.requestId;
  }
}

export function isShopifyConnected(): boolean {
  return Boolean(
    process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  );
}

export function shopifyApiVersion(): string {
  return process.env.SHOPIFY_API_VERSION || '2025-01';
}

function shopifyEndpoint(): string {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) {
    throw new ShopifyApiError('SHOPIFY_STORE_DOMAIN is not set');
  }
  // Strip anything the user might have pasted (protocol, trailing slash).
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${clean}/admin/api/${shopifyApiVersion()}/graphql.json`;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string; [k: string]: unknown }>;
  extensions?: { cost?: ShopifyCost };
}

export interface ShopifyRequestResult<T> {
  data: T;
  cost?: ShopifyCost;
}

/**
 * Run a GraphQL query/mutation against the Shopify Admin API.
 *
 * Throws ShopifyApiError on failure. Successful calls return `{ data, cost }`.
 * The `cost` field lets callers self-throttle when chaining expensive queries.
 */
export async function shopifyGraphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  opts: { signal?: AbortSignal; retryOn429?: boolean } = {},
): Promise<ShopifyRequestResult<T>> {
  if (!isShopifyConnected()) {
    throw new ShopifyApiError(
      'Shopify not connected. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN.',
    );
  }

  const endpoint = shopifyEndpoint();
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
  const retryOn429 = opts.retryOn429 ?? true;

  const doFetch = async (): Promise<Response> => {
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: opts.signal,
      // Next.js: opt out of caching for mutations; callers can wrap in
      // unstable_cache if they want to cache a specific query.
      cache: 'no-store',
    });
  };

  let res = await doFetch();

  if (res.status === 429 && retryOn429) {
    const retryAfter = Number(res.headers.get('retry-after') || '2');
    await new Promise((r) => setTimeout(r, Math.max(1, retryAfter) * 1000));
    res = await doFetch();
  }

  const requestId = res.headers.get('x-request-id') ?? undefined;

  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      /* ignore */
    }
    throw new ShopifyApiError(
      `Shopify HTTP ${res.status} ${res.statusText}${bodyText ? ` — ${bodyText.slice(0, 300)}` : ''}`,
      { status: res.status, requestId },
    );
  }

  let payload: GraphqlResponse<T>;
  try {
    payload = (await res.json()) as GraphqlResponse<T>;
  } catch (err) {
    throw new ShopifyApiError(
      `Shopify returned non-JSON body: ${(err as Error).message}`,
      { status: res.status, requestId },
    );
  }

  if (payload.errors?.length) {
    const msg = payload.errors.map((e) => e.message).join('; ');
    throw new ShopifyApiError(`GraphQL error: ${msg}`, {
      status: res.status,
      graphqlErrors: payload.errors,
      requestId,
    });
  }

  if (payload.data === undefined) {
    throw new ShopifyApiError('GraphQL response had no data', {
      status: res.status,
      requestId,
    });
  }

  return { data: payload.data, cost: payload.extensions?.cost };
}

/**
 * Mutation helper — returns the payload and throws if `userErrors` is
 * non-empty. Most Shopify mutations wrap their result in
 * `{ node, userErrors }` style; supply the path to pull out.
 */
export async function shopifyMutation<T = unknown>(
  query: string,
  variables: Record<string, unknown>,
  opts: { signal?: AbortSignal; payloadKey: string },
): Promise<T> {
  const { data, cost } = await shopifyGraphql<Record<string, unknown>>(
    query,
    variables,
    opts,
  );
  void cost; // ignored here; callers can re-run shopifyGraphql for cost access
  const payload = data[opts.payloadKey] as
    | { userErrors?: ShopifyUserError[] }
    | undefined;
  if (!payload) {
    throw new ShopifyApiError(
      `Mutation payload "${opts.payloadKey}" missing from response`,
    );
  }
  if (payload.userErrors && payload.userErrors.length > 0) {
    const msg = payload.userErrors
      .map((e) => `${e.field?.join('.') ?? ''} ${e.message}`.trim())
      .join('; ');
    throw new ShopifyApiError(`Shopify userErrors: ${msg}`, {
      userErrors: payload.userErrors,
    });
  }
  return payload as unknown as T;
}

/**
 * Pagination helper for Shopify connections. Yields nodes across pages
 * until `hasNextPage` is false. Callers supply the query and a selector
 * that returns the connection `{ edges, pageInfo }` from `data`.
 */
export async function* shopifyPaginate<TNode>(
  query: string,
  variables: Record<string, unknown>,
  selector: (data: unknown) => {
    edges: Array<{ node: TNode; cursor: string }>;
    pageInfo: { hasNextPage: boolean; endCursor?: string | null };
  },
  opts: { maxPages?: number; signal?: AbortSignal } = {},
): AsyncGenerator<TNode> {
  const maxPages = opts.maxPages ?? 20;
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const vars = { ...variables, after: cursor };
    const { data } = await shopifyGraphql<unknown>(query, vars, {
      signal: opts.signal,
    });
    const conn = selector(data);
    for (const edge of conn.edges) yield edge.node;
    if (!conn.pageInfo.hasNextPage) return;
    cursor = conn.pageInfo.endCursor ?? null;
    if (!cursor) return;
  }
}
