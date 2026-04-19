/**
 * Shopify Admin API adapter — live + mock.
 *
 * Every exported function falls back to mock data when the store is not
 * connected, so pages can keep rendering during development. Once
 * SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_ACCESS_TOKEN are populated in
 * `.env.local`, the same functions return live data from Shopify.
 *
 * Connection lives in `shopify-client.ts`; this file is where domain
 * concepts live (products, pages, blogs, orders, customers, abandoned
 * checkouts, draft orders, redirects, shop info).
 *
 * Required scopes (see docs/shopify-setup.md for the full list):
 *   read_products, write_products
 *   read_content, write_content
 *   read_customers, read_orders
 *   read_draft_orders, write_draft_orders
 *   read_checkouts
 *   read_redirects, write_redirects (optional)
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listLeads, listSeoPages } from '@/lib/dashboard/repository';
import {
  isShopifyConnected,
  shopifyApiVersion,
  shopifyGraphql,
  shopifyMutation,
  shopifyPaginate,
  ShopifyApiError,
} from './shopify-client';

async function shopifyFallbackLeads() {
  return listLeads(createSupabaseAdmin());
}

async function shopifyFallbackPages() {
  return listSeoPages(createSupabaseAdmin());
}

export {
  isShopifyConnected,
  shopifyApiVersion,
  ShopifyApiError,
} from './shopify-client';

// ---------------------------------------------------------------------------
// Shop info + connection status
// ---------------------------------------------------------------------------

export interface ShopInfo {
  name: string;
  email: string | null;
  primaryDomain: string;
  currencyCode: string;
  ianaTimezone: string;
  planDisplayName: string | null;
  myshopifyDomain: string;
}

/** Public storefront origin for building product/page URLs (https, no trailing slash). */
const DEFAULT_STOREFRONT_ORIGIN = 'https://evari.cc';

function storefrontOriginFromEnv(): string {
  const u = process.env.NEXT_PUBLIC_STOREFRONT_URL?.trim();
  if (!u) return DEFAULT_STOREFRONT_ORIGIN;
  try {
    const parsed = new URL(u.startsWith('http') ? u : `https://${u}`);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return DEFAULT_STOREFRONT_ORIGIN;
  }
}

/**
 * Customer-facing storefront base URL (primary domain when Shopify is
 * connected, else `NEXT_PUBLIC_STOREFRONT_URL` or the local dev default).
 * Use this anywhere the UI shows or builds a link to the live shop.
 */
export async function getStorefrontBaseUrl(): Promise<string> {
  if (!isShopifyConnected()) {
    return storefrontOriginFromEnv();
  }
  try {
    const shop = await getShopInfo();
    const host = shop.primaryDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (host) return `https://${host}`;
  } catch {
    /* fall through */
  }
  return storefrontOriginFromEnv();
}

/**
 * Returns a minimal shop record — used for the live status card and as
 * a cheap "is the token actually valid?" check.
 */
export async function getShopInfo(): Promise<ShopInfo> {
  if (!isShopifyConnected()) {
    return {
      name: 'Evari Speed Bikes (mock)',
      email: null,
      primaryDomain: 'evari.cc',
      currencyCode: 'GBP',
      ianaTimezone: 'Europe/London',
      planDisplayName: 'Basic Shopify',
      myshopifyDomain: 'evari-bikes.myshopify.com',
    };
  }
  const query = /* GraphQL */ `
    query ShopInfo {
      shop {
        name
        email
        currencyCode
        ianaTimezone
        myshopifyDomain
        plan { displayName }
        primaryDomain { host }
      }
    }
  `;
  type Resp = {
    shop: {
      name: string;
      email: string | null;
      currencyCode: string;
      ianaTimezone: string;
      myshopifyDomain: string;
      plan: { displayName: string | null } | null;
      primaryDomain: { host: string };
    };
  };
  const { data } = await shopifyGraphql<Resp>(query);
  return {
    name: data.shop.name,
    email: data.shop.email,
    currencyCode: data.shop.currencyCode,
    ianaTimezone: data.shop.ianaTimezone,
    myshopifyDomain: data.shop.myshopifyDomain,
    planDisplayName: data.shop.plan?.displayName ?? null,
    primaryDomain: data.shop.primaryDomain.host,
  };
}

export interface ShopifyStatus {
  connected: boolean;
  apiVersion: string;
  shop?: ShopInfo;
  error?: string;
}

/** Cheap health check. Safe to call from an unauthenticated status route. */
export async function getShopifyStatus(): Promise<ShopifyStatus> {
  const apiVersion = shopifyApiVersion();
  if (!isShopifyConnected()) {
    return { connected: false, apiVersion, error: 'Not configured.' };
  }
  try {
    const shop = await getShopInfo();
    return { connected: true, apiVersion, shop };
  } catch (err) {
    return {
      connected: false,
      apiVersion,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface ShopifyProduct {
  id: string; // gid://shopify/Product/...
  handle: string;
  title: string;
  descriptionHtml: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  vendor: string;
  productType: string;
  tags: string[];
  seo: { title: string | null; description: string | null };
  onlineStoreUrl: string | null;
  featuredImage: { url: string; altText: string | null } | null;
  totalInventory: number;
  createdAt: string;
  updatedAt: string;
}

const PRODUCT_FIELDS = /* GraphQL */ `
  id
  handle
  title
  descriptionHtml
  status
  vendor
  productType
  tags
  seo { title description }
  onlineStoreUrl
  featuredImage { url altText }
  totalInventory
  createdAt
  updatedAt
`;

/**
 * List products. `query` accepts Shopify's search syntax
 * (e.g. `status:active tag:tour`).
 */
export async function listProducts(
  opts: { first?: number; query?: string; maxPages?: number } = {},
): Promise<ShopifyProduct[]> {
  if (!isShopifyConnected()) {
    const pages = await shopifyFallbackPages();
    return pages
      .filter((p) => p.type === 'product' && p.shopifyId)
      .map<ShopifyProduct>((p) => ({
        id: p.shopifyId!,
        handle: p.path.replace('/products/', ''),
        title: p.title,
        descriptionHtml: '',
        status: 'ACTIVE',
        vendor: 'Evari',
        productType: 'Bicycle',
        tags: [],
        seo: { title: p.metaTitle ?? null, description: p.metaDescription ?? null },
        onlineStoreUrl: `${storefrontOriginFromEnv()}${p.path}`,
        featuredImage: null,
        totalInventory: 0,
        createdAt: p.lastEditedAt,
        updatedAt: p.lastEditedAt,
      }));
  }
  const first = opts.first ?? 50;
  const query = /* GraphQL */ `
    query ListProducts($first: Int!, $after: String, $query: String) {
      products(first: $first, after: $after, query: $query) {
        edges {
          cursor
          node { ${PRODUCT_FIELDS} }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  const out: ShopifyProduct[] = [];
  for await (const node of shopifyPaginate<ShopifyProduct>(
    query,
    { first, query: opts.query ?? null },
    (data) => (data as { products: { edges: Array<{ node: ShopifyProduct; cursor: string }>; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } }).products,
    { maxPages: opts.maxPages ?? 5 },
  )) {
    out.push(node);
  }
  return out;
}

/** Fetch one product by handle (e.g. `evari-tour`) or GID. */
export async function getProduct(
  idOrHandle: string,
): Promise<ShopifyProduct | null> {
  if (!isShopifyConnected()) {
    const list = await listProducts();
    return (
      list.find(
        (p) =>
          p.id === idOrHandle ||
          p.handle === idOrHandle ||
          p.handle === idOrHandle.replace(/^\//, '').replace(/^products\//, ''),
      ) ?? null
    );
  }
  const isGid = idOrHandle.startsWith('gid://');
  if (isGid) {
    const q = /* GraphQL */ `
      query GetProductById($id: ID!) {
        product(id: $id) { ${PRODUCT_FIELDS} }
      }
    `;
    const { data } = await shopifyGraphql<{ product: ShopifyProduct | null }>(
      q,
      { id: idOrHandle },
    );
    return data.product;
  }
  const q = /* GraphQL */ `
    query GetProductByHandle($handle: String!) {
      productByHandle(handle: $handle) { ${PRODUCT_FIELDS} }
    }
  `;
  const { data } = await shopifyGraphql<{
    productByHandle: ShopifyProduct | null;
  }>(q, { handle: idOrHandle });
  return data.productByHandle;
}

export interface ProductUpdateInput {
  id: string; // gid://shopify/Product/...
  title?: string;
  descriptionHtml?: string;
  seoTitle?: string;
  seoDescription?: string;
  tags?: string[];
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
}

/**
 * Update product core fields + SEO. Returns the updated product.
 */
export async function updateProduct(
  input: ProductUpdateInput,
): Promise<ShopifyProduct> {
  if (!isShopifyConnected()) {
    const existing = await getProduct(input.id);
    if (!existing) throw new Error(`Product ${input.id} not found in mock data`);
    return {
      ...existing,
      title: input.title ?? existing.title,
      descriptionHtml: input.descriptionHtml ?? existing.descriptionHtml,
      seo: {
        title: input.seoTitle ?? existing.seo.title,
        description: input.seoDescription ?? existing.seo.description,
      },
      tags: input.tags ?? existing.tags,
      status: input.status ?? existing.status,
      updatedAt: new Date().toISOString(),
    };
  }
  const mutation = /* GraphQL */ `
    mutation UpdateProduct($input: ProductInput!) {
      productUpdate(input: $input) {
        product { ${PRODUCT_FIELDS} }
        userErrors { field message }
      }
    }
  `;
  const gqlInput: Record<string, unknown> = { id: input.id };
  if (input.title !== undefined) gqlInput.title = input.title;
  if (input.descriptionHtml !== undefined)
    gqlInput.descriptionHtml = input.descriptionHtml;
  if (input.tags !== undefined) gqlInput.tags = input.tags;
  if (input.status !== undefined) gqlInput.status = input.status;
  if (input.seoTitle !== undefined || input.seoDescription !== undefined) {
    gqlInput.seo = {
      ...(input.seoTitle !== undefined ? { title: input.seoTitle } : {}),
      ...(input.seoDescription !== undefined
        ? { description: input.seoDescription }
        : {}),
    };
  }
  const payload = await shopifyMutation<{ product: ShopifyProduct }>(
    mutation,
    { input: gqlInput },
    { payloadKey: 'productUpdate' },
  );
  return payload.product;
}

// ---------------------------------------------------------------------------
// Pages (Shopify "Online Store" pages)
// ---------------------------------------------------------------------------

export interface ShopifyPage {
  id: string; // gid://shopify/Page/...
  handle: string;
  title: string;
  bodyHtml: string;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  seo: { title: string | null; description: string | null };
}

const PAGE_FIELDS = /* GraphQL */ `
  id
  handle
  title
  body
  isPublished
  publishedAt
  createdAt
  updatedAt
  seo { title description }
`;

/** List all published + unpublished Shopify pages (About, Finance, FAQ, etc). */
export async function listShopifyPages(
  opts: { first?: number; maxPages?: number } = {},
): Promise<ShopifyPage[]> {
  if (!isShopifyConnected()) {
    const pages = await shopifyFallbackPages();
    return pages
      .filter((p) => p.shopifyId)
      .map<ShopifyPage>((p) => ({
        id: p.shopifyId!,
        handle: p.path.replace(/^\/(pages\/)?/, ''),
        title: p.title,
        bodyHtml: '',
        isPublished: true,
        publishedAt: p.lastEditedAt,
        createdAt: p.lastEditedAt,
        updatedAt: p.lastEditedAt,
        seo: {
          title: p.metaTitle ?? null,
          description: p.metaDescription ?? null,
        },
      }));
  }
  const first = opts.first ?? 50;
  const q = /* GraphQL */ `
    query ListPages($first: Int!, $after: String) {
      pages(first: $first, after: $after) {
        edges { cursor node { ${PAGE_FIELDS} } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  const out: ShopifyPage[] = [];
  for await (const raw of shopifyPaginate<{
    id: string;
    handle: string;
    title: string;
    body: string;
    isPublished: boolean;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    seo: { title: string | null; description: string | null };
  }>(
    q,
    { first },
    (data) => (data as { pages: { edges: Array<{ node: never; cursor: string }>; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } }).pages,
    { maxPages: opts.maxPages ?? 5 },
  )) {
    out.push({ ...raw, bodyHtml: raw.body });
  }
  return out;
}

/**
 * Update SEO metadata (and optionally body) on a Shopify Page.
 *
 * Kept backwards-compatible with the older `updatePageMetadata` signature
 * used elsewhere in the dashboard — callers pass `pageId` (can be a GID
 * or a numeric Shopify ID).
 */
export async function updatePageMetadata(args: {
  pageId: string;
  metaTitle?: string;
  metaDescription?: string;
  title?: string;
  bodyHtml?: string;
}) {
  if (!isShopifyConnected()) {
    return { ok: true, dryRun: true, ...args };
  }
  const gid = args.pageId.startsWith('gid://')
    ? args.pageId
    : `gid://shopify/Page/${args.pageId}`;
  const mutation = /* GraphQL */ `
    mutation UpdatePage($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { ${PAGE_FIELDS} }
        userErrors { field message code }
      }
    }
  `;
  const page: Record<string, unknown> = {};
  if (args.title !== undefined) page.title = args.title;
  if (args.bodyHtml !== undefined) page.body = args.bodyHtml;
  if (args.metaTitle !== undefined || args.metaDescription !== undefined) {
    page.seo = {
      ...(args.metaTitle !== undefined ? { title: args.metaTitle } : {}),
      ...(args.metaDescription !== undefined
        ? { description: args.metaDescription }
        : {}),
    };
  }
  const payload = await shopifyMutation<{ page: ShopifyPage }>(
    mutation,
    { id: gid, page },
    { payloadKey: 'pageUpdate' },
  );
  return { ok: true, page: payload.page };
}

// ---------------------------------------------------------------------------
// Blog articles
// ---------------------------------------------------------------------------

export interface ShopifyBlog {
  id: string;
  handle: string;
  title: string;
}

export interface ShopifyArticle {
  id: string;
  handle: string;
  title: string;
  author: { name: string } | null;
  tags: string[];
  bodyHtml: string;
  summary: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  blog: { id: string; handle: string; title: string };
  seo: { title: string | null; description: string | null };
  image: { url: string; altText: string | null } | null;
}

const ARTICLE_FIELDS = /* GraphQL */ `
  id
  handle
  title
  author { name }
  tags
  body
  summary
  isPublished
  publishedAt
  createdAt
  updatedAt
  blog { id handle title }
  seo { title description }
  image { url altText }
`;

export async function listBlogs(): Promise<ShopifyBlog[]> {
  if (!isShopifyConnected()) {
    return [{ id: 'gid://shopify/Blog/0', handle: 'journal', title: 'Evari Journal' }];
  }
  const q = /* GraphQL */ `
    query ListBlogs { blogs(first: 50) { edges { node { id handle title } } } }
  `;
  const { data } = await shopifyGraphql<{
    blogs: { edges: Array<{ node: ShopifyBlog }> };
  }>(q);
  return data.blogs.edges.map((e) => e.node);
}

/**
 * List articles across all blogs (or a single blog by ID).
 */
export async function listArticles(
  opts: { blogId?: string; first?: number; maxPages?: number } = {},
): Promise<ShopifyArticle[]> {
  if (!isShopifyConnected()) {
    const pages = await shopifyFallbackPages();
    return pages
      .filter((p) => p.type === 'blog')
      .map<ShopifyArticle>((p) => ({
        id: p.id,
        handle: p.path.split('/').pop() ?? p.id,
        title: p.title,
        author: { name: 'Evari' },
        tags: [],
        bodyHtml: '',
        summary: null,
        isPublished: true,
        publishedAt: p.lastEditedAt,
        createdAt: p.lastEditedAt,
        updatedAt: p.lastEditedAt,
        blog: { id: 'gid://shopify/Blog/0', handle: 'journal', title: 'Evari Journal' },
        seo: { title: p.metaTitle ?? null, description: p.metaDescription ?? null },
        image: null,
      }));
  }
  const first = opts.first ?? 50;
  const query = opts.blogId
    ? /* GraphQL */ `
        query ListArticles($blogId: ID!, $first: Int!, $after: String) {
          blog(id: $blogId) {
            articles(first: $first, after: $after) {
              edges { cursor node { ${ARTICLE_FIELDS} } }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      `
    : /* GraphQL */ `
        query ListArticles($first: Int!, $after: String) {
          articles(first: $first, after: $after) {
            edges { cursor node { ${ARTICLE_FIELDS} } }
            pageInfo { hasNextPage endCursor }
          }
        }
      `;
  const selector = opts.blogId
    ? (data: unknown) =>
        (data as { blog: { articles: { edges: Array<{ node: never; cursor: string }>; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } } }).blog
          .articles
    : (data: unknown) =>
        (data as { articles: { edges: Array<{ node: never; cursor: string }>; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } }).articles;

  const out: ShopifyArticle[] = [];
  for await (const raw of shopifyPaginate<ShopifyArticle & { body: string }>(
    query,
    opts.blogId
      ? { blogId: opts.blogId, first }
      : { first },
    selector,
    { maxPages: opts.maxPages ?? 5 },
  )) {
    out.push({ ...raw, bodyHtml: (raw as { body: string }).body });
  }
  return out;
}

/**
 * Update SEO metadata on a Shopify Article. Mirrors `updatePageMetadata`
 * for the article record. `articleId` may be a GID or numeric id.
 */
export async function updateArticleMetadata(args: {
  articleId: string;
  metaTitle?: string;
  metaDescription?: string;
  title?: string;
  bodyHtml?: string;
  summary?: string;
}) {
  if (!isShopifyConnected()) {
    return { ok: true, dryRun: true, ...args };
  }
  const gid = args.articleId.startsWith('gid://')
    ? args.articleId
    : `gid://shopify/Article/${args.articleId}`;
  const mutation = /* GraphQL */ `
    mutation UpdateArticle($id: ID!, $article: ArticleUpdateInput!) {
      articleUpdate(id: $id, article: $article) {
        article { ${ARTICLE_FIELDS} }
        userErrors { field message code }
      }
    }
  `;
  const article: Record<string, unknown> = {};
  if (args.title !== undefined) article.title = args.title;
  if (args.bodyHtml !== undefined) article.body = args.bodyHtml;
  if (args.summary !== undefined) article.summary = args.summary;
  if (args.metaTitle !== undefined || args.metaDescription !== undefined) {
    article.seo = {
      ...(args.metaTitle !== undefined ? { title: args.metaTitle } : {}),
      ...(args.metaDescription !== undefined
        ? { description: args.metaDescription }
        : {}),
    };
  }
  const payload = await shopifyMutation<{
    article: ShopifyArticle & { body: string };
  }>(mutation, { id: gid, article }, { payloadKey: 'articleUpdate' });
  return {
    ok: true,
    article: { ...payload.article, bodyHtml: payload.article.body },
  };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface ShopifyOrder {
  id: string;
  name: string; // "#1042"
  email: string | null;
  phone: string | null;
  createdAt: string;
  processedAt: string;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  subtotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  customer: {
    id: string;
    displayName: string;
    email: string | null;
  } | null;
  lineItems: Array<{
    title: string;
    quantity: number;
    variantTitle: string | null;
  }>;
  tags: string[];
  sourceName: string | null;
}

const ORDER_FIELDS = /* GraphQL */ `
  id
  name
  email
  phone
  createdAt
  processedAt
  displayFinancialStatus
  displayFulfillmentStatus
  tags
  sourceName
  totalPriceSet { shopMoney { amount currencyCode } }
  subtotalPriceSet { shopMoney { amount currencyCode } }
  customer { id displayName email }
  lineItems(first: 20) {
    edges { node { title quantity variantTitle } }
  }
`;

export async function listOrders(
  opts: { first?: number; query?: string; maxPages?: number } = {},
): Promise<ShopifyOrder[]> {
  if (!isShopifyConnected()) {
    const leads = await shopifyFallbackLeads();
    return leads
      .filter((l) => l.source === 'shopify_order')
      .map<ShopifyOrder>((l, i) => ({
        id: `gid://shopify/Order/${1000 + i}`,
        name: `#${1000 + i}`,
        email: l.email,
        phone: l.phone ?? null,
        createdAt: l.firstSeenAt,
        processedAt: l.firstSeenAt,
        displayFinancialStatus: 'PAID',
        displayFulfillmentStatus: 'UNFULFILLED',
        totalPriceSet: {
          shopMoney: {
            amount: String(l.estimatedValue ?? 0),
            currencyCode: 'GBP',
          },
        },
        subtotalPriceSet: {
          shopMoney: {
            amount: String(l.estimatedValue ?? 0),
            currencyCode: 'GBP',
          },
        },
        customer: null,
        lineItems: [{ title: l.productInterest ?? 'unknown', quantity: 1, variantTitle: null }],
        tags: l.tags,
        sourceName: 'web',
      }));
  }
  const first = opts.first ?? 50;
  const q = /* GraphQL */ `
    query ListOrders($first: Int!, $after: String, $query: String) {
      orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT, reverse: true) {
        edges {
          cursor
          node { ${ORDER_FIELDS} }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  const out: ShopifyOrder[] = [];
  for await (const raw of shopifyPaginate<Omit<ShopifyOrder, 'lineItems'> & {
    lineItems: { edges: Array<{ node: { title: string; quantity: number; variantTitle: string | null } }> };
  }>(
    q,
    { first, query: opts.query ?? null },
    (data) => (data as { orders: { edges: Array<{ node: never; cursor: string }>; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } }).orders,
    { maxPages: opts.maxPages ?? 5 },
  )) {
    out.push({
      ...raw,
      lineItems: raw.lineItems.edges.map((e) => e.node),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface ShopifyCustomer {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  numberOfOrders: number;
  amountSpent: { amount: string; currencyCode: string };
  createdAt: string;
  updatedAt: string;
  state: string;
  tags: string[];
}

const CUSTOMER_FIELDS = /* GraphQL */ `
  id
  displayName
  email
  phone
  numberOfOrders
  amountSpent { amount currencyCode }
  createdAt
  updatedAt
  state
  tags
`;

export async function listCustomers(
  opts: { first?: number; query?: string; maxPages?: number } = {},
): Promise<ShopifyCustomer[]> {
  if (!isShopifyConnected()) {
    const leads = await shopifyFallbackLeads();
    return leads.map<ShopifyCustomer>((l, i) => ({
      id: `gid://shopify/Customer/${2000 + i}`,
      displayName: l.fullName,
      email: l.email,
      phone: l.phone ?? null,
      numberOfOrders: l.source === 'shopify_order' ? 1 : 0,
      amountSpent: {
        amount: String(l.estimatedValue ?? 0),
        currencyCode: 'GBP',
      },
      createdAt: l.firstSeenAt,
      updatedAt: l.lastTouchAt,
      state: 'ENABLED',
      tags: l.tags,
    }));
  }
  const first = opts.first ?? 100;
  const q = /* GraphQL */ `
    query ListCustomers($first: Int!, $after: String, $query: String) {
      customers(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
        edges { cursor node { ${CUSTOMER_FIELDS} } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  const out: ShopifyCustomer[] = [];
  for await (const node of shopifyPaginate<ShopifyCustomer>(
    q,
    { first, query: opts.query ?? null },
    (data) => (data as { customers: { edges: Array<{ node: ShopifyCustomer; cursor: string }>; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } }).customers,
    { maxPages: opts.maxPages ?? 3 },
  )) {
    out.push(node);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Abandoned checkouts
// ---------------------------------------------------------------------------

export interface ShopifyAbandonedCheckout {
  id: string;
  email: string | null;
  phone: string | null;
  totalPrice: number;
  currencyCode: string;
  abandonedAt: string;
  url: string | null;
  lineItems: Array<{ title: string; quantity: number; variantTitle: string | null }>;
  customer: { displayName: string; email: string | null } | null;
}

export async function listAbandonedCheckouts(
  opts: { first?: number; maxPages?: number } = {},
): Promise<ShopifyAbandonedCheckout[]> {
  if (!isShopifyConnected()) {
    const leads = await shopifyFallbackLeads();
    return leads
      .filter((l) => l.source === 'shopify_abandoned')
      .map<ShopifyAbandonedCheckout>((l) => ({
        id: l.id,
        email: l.email,
        phone: l.phone ?? null,
        totalPrice: l.estimatedValue ?? 0,
        currencyCode: 'GBP',
        abandonedAt: l.firstSeenAt,
        url: null,
        lineItems: [
          { title: l.productInterest ?? 'unknown', quantity: 1, variantTitle: null },
        ],
        customer: { displayName: l.fullName, email: l.email },
      }));
  }
  const first = opts.first ?? 50;
  const q = /* GraphQL */ `
    query ListAbandoned($first: Int!, $after: String) {
      abandonedCheckouts(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
        edges {
          cursor
          node {
            id
            abandonedCheckoutUrl
            createdAt
            updatedAt
            note
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { displayName email }
            lineItems(first: 20) {
              edges { node { title quantity variantTitle } }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  type Raw = {
    id: string;
    abandonedCheckoutUrl: string | null;
    createdAt: string;
    updatedAt: string;
    note: string | null;
    totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
    customer: { displayName: string; email: string | null } | null;
    lineItems: {
      edges: Array<{ node: { title: string; quantity: number; variantTitle: string | null } }>;
    };
  };
  const out: ShopifyAbandonedCheckout[] = [];
  for await (const raw of shopifyPaginate<Raw>(
    q,
    { first },
    (data) =>
      (data as { abandonedCheckouts: { edges: Array<{ node: Raw; cursor: string }>; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } })
        .abandonedCheckouts,
    { maxPages: opts.maxPages ?? 3 },
  )) {
    out.push({
      id: raw.id,
      email: raw.customer?.email ?? null,
      phone: null,
      totalPrice: Number(raw.totalPriceSet.shopMoney.amount),
      currencyCode: raw.totalPriceSet.shopMoney.currencyCode,
      abandonedAt: raw.createdAt,
      url: raw.abandonedCheckoutUrl,
      lineItems: raw.lineItems.edges.map((e) => e.node),
      customer: raw.customer,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Draft orders (bike-builder quotes)
// ---------------------------------------------------------------------------

export interface DraftOrderLineItem {
  /** Variant GID (`gid://shopify/ProductVariant/...`) OR use title+quantity+price for a custom line. */
  variantId?: string;
  title?: string;
  quantity: number;
  originalUnitPrice?: string; // decimal string, e.g. "8500.00"
  customAttributes?: Array<{ key: string; value: string }>;
}

export interface DraftOrderInput {
  email?: string;
  phone?: string;
  note?: string;
  tags?: string[];
  lineItems: DraftOrderLineItem[];
  customAttributes?: Array<{ key: string; value: string }>;
  /** Set to send the customer an invoice immediately. */
  useCustomerDefaultAddress?: boolean;
}

export interface ShopifyDraftOrder {
  id: string;
  name: string;
  status: string;
  invoiceUrl: string | null;
  createdAt: string;
  totalPrice: string;
}

/** Create a draft order — the bike builder's primary write path. */
export async function createDraftOrder(
  input: DraftOrderInput,
): Promise<ShopifyDraftOrder> {
  if (!isShopifyConnected()) {
    return {
      id: `gid://shopify/DraftOrder/mock-${Date.now()}`,
      name: `#D${Math.floor(Math.random() * 9000) + 1000}`,
      status: 'OPEN',
      invoiceUrl: null,
      createdAt: new Date().toISOString(),
      totalPrice: input.lineItems
        .reduce((sum, li) => sum + (Number(li.originalUnitPrice ?? 0) * li.quantity), 0)
        .toFixed(2),
    };
  }
  const mutation = /* GraphQL */ `
    mutation CreateDraft($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          name
          status
          invoiceUrl
          createdAt
          totalPriceSet { shopMoney { amount currencyCode } }
        }
        userErrors { field message }
      }
    }
  `;
  const payload = await shopifyMutation<{
    draftOrder: {
      id: string;
      name: string;
      status: string;
      invoiceUrl: string | null;
      createdAt: string;
      totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
    };
  }>(
    mutation,
    {
      input: {
        email: input.email,
        phone: input.phone,
        note: input.note,
        tags: input.tags,
        useCustomerDefaultAddress: input.useCustomerDefaultAddress,
        customAttributes: input.customAttributes,
        lineItems: input.lineItems.map((li) => ({
          variantId: li.variantId,
          title: li.title,
          quantity: li.quantity,
          originalUnitPrice: li.originalUnitPrice,
          customAttributes: li.customAttributes,
        })),
      },
    },
    { payloadKey: 'draftOrderCreate' },
  );
  return {
    id: payload.draftOrder.id,
    name: payload.draftOrder.name,
    status: payload.draftOrder.status,
    invoiceUrl: payload.draftOrder.invoiceUrl,
    createdAt: payload.draftOrder.createdAt,
    totalPrice: payload.draftOrder.totalPriceSet.shopMoney.amount,
  };
}

export async function listDraftOrders(
  opts: { first?: number; maxPages?: number } = {},
): Promise<ShopifyDraftOrder[]> {
  if (!isShopifyConnected()) {
    return [];
  }
  const first = opts.first ?? 50;
  const q = /* GraphQL */ `
    query ListDrafts($first: Int!, $after: String) {
      draftOrders(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
        edges {
          cursor
          node {
            id
            name
            status
            invoiceUrl
            createdAt
            totalPriceSet { shopMoney { amount currencyCode } }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  type Raw = {
    id: string;
    name: string;
    status: string;
    invoiceUrl: string | null;
    createdAt: string;
    totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  };
  const out: ShopifyDraftOrder[] = [];
  for await (const raw of shopifyPaginate<Raw>(
    q,
    { first },
    (data) => (data as { draftOrders: { edges: Array<{ node: Raw; cursor: string }>; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } }).draftOrders,
    { maxPages: opts.maxPages ?? 3 },
  )) {
    out.push({
      id: raw.id,
      name: raw.name,
      status: raw.status,
      invoiceUrl: raw.invoiceUrl,
      createdAt: raw.createdAt,
      totalPrice: raw.totalPriceSet.shopMoney.amount,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// URL redirects (SEO hygiene)
// ---------------------------------------------------------------------------

export interface ShopifyRedirect {
  id: string;
  path: string; // leading slash, e.g. /old-url
  target: string; // destination, e.g. /products/evari-tour
}

export async function listRedirects(
  opts: { first?: number; maxPages?: number } = {},
): Promise<ShopifyRedirect[]> {
  if (!isShopifyConnected()) {
    return [];
  }
  const first = opts.first ?? 100;
  const q = /* GraphQL */ `
    query ListRedirects($first: Int!, $after: String) {
      urlRedirects(first: $first, after: $after) {
        edges { cursor node { id path target } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  const out: ShopifyRedirect[] = [];
  for await (const node of shopifyPaginate<ShopifyRedirect>(
    q,
    { first },
    (data) => (data as { urlRedirects: { edges: Array<{ node: ShopifyRedirect; cursor: string }>; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } }).urlRedirects,
    { maxPages: opts.maxPages ?? 5 },
  )) {
    out.push(node);
  }
  return out;
}

export async function createRedirect(
  path: string,
  target: string,
): Promise<ShopifyRedirect> {
  if (!isShopifyConnected()) {
    return {
      id: `gid://shopify/UrlRedirect/mock-${Date.now()}`,
      path,
      target,
    };
  }
  const mutation = /* GraphQL */ `
    mutation CreateRedirect($urlRedirect: UrlRedirectInput!) {
      urlRedirectCreate(urlRedirect: $urlRedirect) {
        urlRedirect { id path target }
        userErrors { field message code }
      }
    }
  `;
  const payload = await shopifyMutation<{ urlRedirect: ShopifyRedirect }>(
    mutation,
    { urlRedirect: { path, target } },
    { payloadKey: 'urlRedirectCreate' },
  );
  return payload.urlRedirect;
}

export async function deleteRedirect(id: string): Promise<{ id: string }> {
  if (!isShopifyConnected()) {
    return { id };
  }
  const mutation = /* GraphQL */ `
    mutation DeleteRedirect($id: ID!) {
      urlRedirectDelete(id: $id) {
        deletedUrlRedirectId
        userErrors { field message code }
      }
    }
  `;
  const payload = await shopifyMutation<{ deletedUrlRedirectId: string }>(
    mutation,
    { id },
    { payloadKey: 'urlRedirectDelete' },
  );
  return { id: payload.deletedUrlRedirectId };
}

// ---------------------------------------------------------------------------
// Discounts (codes + automatic). Read-only listing today; create/disable
// flows live in the API route.
// ---------------------------------------------------------------------------

export interface ShopifyDiscount {
  id: string;
  title: string;
  /** "code" | "automatic" */
  kind: 'code' | 'automatic';
  /** Single primary code (codes only). */
  code: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'SCHEDULED';
  /** Free-form summary of the value (e.g. "10% off all", "£25 off £200+"). */
  summary: string;
  startsAt: string | null;
  endsAt: string | null;
  usageCount: number;
  usageLimit: number | null;
}

export async function listDiscounts(
  opts: { first?: number } = {},
): Promise<ShopifyDiscount[]> {
  if (!isShopifyConnected()) {
    return [
      {
        id: 'gid://shopify/DiscountCodeNode/mock-1',
        title: 'WELCOME10',
        kind: 'code',
        code: 'WELCOME10',
        status: 'ACTIVE',
        summary: '10% off first order',
        startsAt: new Date(Date.now() - 86400000 * 30).toISOString(),
        endsAt: null,
        usageCount: 47,
        usageLimit: null,
      },
      {
        id: 'gid://shopify/DiscountAutomaticNode/mock-2',
        title: 'Free shipping over £750',
        kind: 'automatic',
        code: null,
        status: 'ACTIVE',
        summary: 'Free standard shipping when subtotal ≥ £750',
        startsAt: new Date(Date.now() - 86400000 * 14).toISOString(),
        endsAt: null,
        usageCount: 122,
        usageLimit: null,
      },
    ];
  }
  const first = opts.first ?? 50;
  const query = /* GraphQL */ `
    query ListDiscounts($first: Int!) {
      discountNodes(first: $first, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            discount {
              __typename
              ... on DiscountCodeBasic {
                title
                status
                startsAt
                endsAt
                usageLimit
                asyncUsageCount
                codes(first: 1) { edges { node { code } } }
                customerGets { value { __typename ... on DiscountPercentage { percentage } ... on DiscountAmount { amount { amount currencyCode } } } }
              }
              ... on DiscountAutomaticBasic {
                title
                status
                startsAt
                endsAt
                asyncUsageCount
                customerGets { value { __typename ... on DiscountPercentage { percentage } ... on DiscountAmount { amount { amount currencyCode } } } }
              }
              ... on DiscountCodeFreeShipping {
                title
                status
                startsAt
                endsAt
                asyncUsageCount
                codes(first: 1) { edges { node { code } } }
              }
              ... on DiscountAutomaticFreeShipping {
                title
                status
                startsAt
                endsAt
                asyncUsageCount
              }
            }
          }
        }
      }
    }
  `;
  type GqlDiscount = {
    __typename: string;
    title: string;
    status: 'ACTIVE' | 'EXPIRED' | 'SCHEDULED';
    startsAt: string | null;
    endsAt: string | null;
    usageLimit?: number | null;
    asyncUsageCount: number;
    codes?: { edges: Array<{ node: { code: string } }> };
    customerGets?: {
      value: {
        __typename: string;
        percentage?: number;
        amount?: { amount: string; currencyCode: string };
      };
    };
  };
  const { data } = await shopifyGraphql<{
    discountNodes: { edges: Array<{ node: { id: string; discount: GqlDiscount } }> };
  }>(query, { first });
  return data.discountNodes.edges.map(({ node: n }) => {
    const d = n.discount;
    const code = d.codes?.edges[0]?.node.code ?? null;
    const isAutomatic = d.__typename.startsWith('DiscountAutomatic');
    const isFreeShipping = d.__typename.includes('FreeShipping');
    const value = d.customerGets?.value;
    let summary = '—';
    if (isFreeShipping) summary = 'Free shipping';
    else if (value?.__typename === 'DiscountPercentage' && value.percentage != null)
      summary = `${Math.round(value.percentage * 100)}% off`;
    else if (value?.__typename === 'DiscountAmount' && value.amount)
      summary = `${value.amount.currencyCode} ${value.amount.amount} off`;
    return {
      id: n.id,
      title: d.title,
      kind: isAutomatic ? 'automatic' : 'code',
      code,
      status: d.status,
      summary,
      startsAt: d.startsAt,
      endsAt: d.endsAt,
      usageCount: d.asyncUsageCount,
      usageLimit: d.usageLimit ?? null,
    };
  });
}

export interface CreateBasicDiscountInput {
  title: string;
  /** Required for code discounts; omitted for automatic. */
  code?: string;
  /** Either percentage or amount. Percentage in 0–1 range. */
  percentage?: number;
  amount?: { amount: string; currencyCode: string };
  startsAt?: string;
  endsAt?: string;
  /** Optional — limit total redemptions. */
  usageLimit?: number;
  /** Defaults to "ALL" — apply to every product. */
  appliesTo?: 'ALL';
}

/**
 * Create a basic discount code. Stays narrowly scoped — discount build
 * matrices on Shopify are huge but the dashboard only needs the common
 * "% off all" / "£X off all" cases for now. Returns the new node.
 */
export async function createBasicDiscountCode(
  input: CreateBasicDiscountInput,
): Promise<{ id: string; code: string | null }> {
  if (!isShopifyConnected()) {
    return {
      id: `gid://shopify/DiscountCodeNode/mock-${Date.now()}`,
      code: input.code ?? null,
    };
  }
  if (!input.code) {
    throw new Error('createBasicDiscountCode requires a code');
  }
  const value: Record<string, unknown> =
    input.percentage != null
      ? { percentage: input.percentage }
      : input.amount
      ? { discountAmount: { amount: input.amount.amount, appliesOnEachItem: false } }
      : (() => {
          throw new Error('Provide either percentage or amount');
        })();
  const mutation = /* GraphQL */ `
    mutation CreateDiscount($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode { id codeDiscount { ... on DiscountCodeBasic { codes(first: 1) { edges { node { code } } } } } }
        userErrors { field message code }
      }
    }
  `;
  const payload = await shopifyMutation<{
    codeDiscountNode: {
      id: string;
      codeDiscount: { codes: { edges: Array<{ node: { code: string } }> } };
    };
  }>(
    mutation,
    {
      basicCodeDiscount: {
        title: input.title,
        code: input.code,
        startsAt: input.startsAt ?? new Date().toISOString(),
        endsAt: input.endsAt,
        usageLimit: input.usageLimit,
        customerSelection: { all: true },
        customerGets: {
          appliesOnOneTimePurchase: true,
          appliesOnSubscription: false,
          items: { all: true },
          value,
        },
      },
    },
    { payloadKey: 'discountCodeBasicCreate' },
  );
  return {
    id: payload.codeDiscountNode.id,
    code: payload.codeDiscountNode.codeDiscount.codes.edges[0]?.node.code ?? null,
  };
}

// ---------------------------------------------------------------------------
// Abandoned-checkout recovery (REST: send recovery email)
// ---------------------------------------------------------------------------

/**
 * Trigger Shopify to send the abandoned-checkout recovery email for a
 * given checkout. There's no GraphQL equivalent — it's REST only.
 *
 * `checkoutId` may be the GID (`gid://shopify/AbandonedCheckout/12345`)
 * or the bare numeric id; we strip the prefix automatically.
 */
export async function sendAbandonedRecoveryEmail(
  checkoutId: string,
): Promise<{ ok: true }> {
  if (!isShopifyConnected()) {
    return { ok: true };
  }
  const numericId = checkoutId.startsWith('gid://')
    ? checkoutId.split('/').pop()!
    : checkoutId;
  // Lazy-import to keep the barrel out of this file.
  const { shopifyREST } = await import('@/lib/shopify');
  const res = await shopifyREST(`checkouts/${numericId}/send_recovery.json`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new ShopifyApiError(
      `Recovery email failed (${res.status}): ${await res.text()}`,
      { status: res.status },
    );
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Online-store navigation (read-only menu tree)
// ---------------------------------------------------------------------------

export interface ShopifyMenuItem {
  id: string;
  title: string;
  url: string;
  type: string;
  items: ShopifyMenuItem[];
}

export interface ShopifyMenu {
  id: string;
  handle: string;
  title: string;
  items: ShopifyMenuItem[];
}

export async function listMenus(): Promise<ShopifyMenu[]> {
  if (!isShopifyConnected()) {
    return [
      {
        id: 'gid://shopify/Menu/mock-1',
        handle: 'main-menu',
        title: 'Main menu',
        items: [
          { id: '1', title: 'Bikes', url: '/collections/bikes', type: 'COLLECTION', items: [
            { id: '1a', title: 'Tour', url: '/products/evari-tour', type: 'PRODUCT', items: [] },
            { id: '1b', title: 'Sport', url: '/products/evari-sport', type: 'PRODUCT', items: [] },
          ] },
          { id: '2', title: 'Finance', url: '/pages/finance', type: 'PAGE', items: [] },
          { id: '3', title: 'About', url: '/pages/about', type: 'PAGE', items: [] },
        ],
      },
      {
        id: 'gid://shopify/Menu/mock-2',
        handle: 'footer',
        title: 'Footer',
        items: [
          { id: 'f1', title: 'Contact', url: '/pages/contact', type: 'PAGE', items: [] },
          { id: 'f2', title: 'Returns', url: '/pages/returns', type: 'PAGE', items: [] },
        ],
      },
    ];
  }
  const query = /* GraphQL */ `
    query ListMenus {
      menus(first: 25) {
        edges {
          node {
            id
            handle
            title
            items {
              id title url type
              items {
                id title url type
                items { id title url type }
              }
            }
          }
        }
      }
    }
  `;
  const { data } = await shopifyGraphql<{
    menus: { edges: Array<{ node: ShopifyMenu }> };
  }>(query);
  return data.menus.edges.map((e) => e.node);
}

// ---------------------------------------------------------------------------
// Analytics — uses the `shopifyqlQuery` GraphQL endpoint when available,
// or falls back to deriving from listOrders.
// ---------------------------------------------------------------------------

export interface SalesPoint {
  date: string; // YYYY-MM-DD
  sales: number;
  orders: number;
}

export async function listSalesByDay(
  opts: { days?: number } = {},
): Promise<SalesPoint[]> {
  const days = opts.days ?? 30;
  const buckets = new Map<string, { sales: number; orders: number }>();
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    buckets.set(d.toISOString().slice(0, 10), { sales: 0, orders: 0 });
  }
  // No fabricated sales from mock orders — return empty buckets until the
  // store is connected with a real Admin token.
  if (!isShopifyConnected()) {
    return Array.from(buckets.entries()).map(([date, v]) => ({
      date,
      sales: v.sales,
      orders: v.orders,
    }));
  }
  // Query orders processed in this window. Cheap fallback approach that
  // works whether or not the merchant has Shopify Analytics ShopifyQL
  // enabled (it's a paid plan feature on some plans).
  const sinceISO = new Date(today.getTime() - days * 86400000)
    .toISOString()
    .slice(0, 10);
  const orders = await listOrders({
    first: 250,
    query: `processed_at:>=${sinceISO}`,
    maxPages: 4,
  });
  for (const o of orders) {
    const day = o.processedAt.slice(0, 10);
    const bucket = buckets.get(day);
    if (!bucket) continue;
    bucket.sales += Number(o.totalPriceSet.shopMoney.amount);
    bucket.orders += 1;
  }
  return Array.from(buckets.entries()).map(([date, v]) => ({
    date,
    sales: Math.round(v.sales * 100) / 100,
    orders: v.orders,
  }));
}
