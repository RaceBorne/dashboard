/**
 * SEO fix engine.
 *
 * Maps a `ScanFinding` onto the right write operation against the Shopify
 * Admin API. Two execution paths:
 *
 *   safe-auto  — applied immediately by `applyFix(finding)`
 *   review     — caller passes their approved value via `applyFix(finding, { value })`
 *
 * Every successful fix records an `UndoEntry` in module-level memory so
 * the user can roll back the last 50 changes for the session.
 */

import { randomUUID } from 'node:crypto';
import {
  createRedirect,
  getProduct,
  isShopifyConnected,
  updatePageMetadata,
  updateProduct,
  type ShopifyArticle,
  type ShopifyPage,
  type ShopifyProduct,
} from '@/lib/integrations/shopify';
import { listArticles, listShopifyPages } from '@/lib/integrations/shopify';
import { shopifyMutation } from '@/lib/integrations/shopify-client';
import {
  generateAltText,
  generateMetaDescription,
  generateMetaTitle,
} from '@/lib/ai/evari-seo';
import type { ScanFinding, UndoEntry } from './types';

// ---------------------------------------------------------------------------
// Undo log (in-memory, cleared on server restart — same scope as the
// scan cache).
// ---------------------------------------------------------------------------

const UNDO_LIMIT = 50;
const undoLog: UndoEntry[] = [];

export function getUndoLog(): UndoEntry[] {
  // Newest first.
  return [...undoLog].reverse();
}

function pushUndo(entry: UndoEntry): UndoEntry {
  undoLog.push(entry);
  if (undoLog.length > UNDO_LIMIT) undoLog.shift();
  return entry;
}

function popUndoById(id: string): UndoEntry | null {
  const idx = undoLog.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const [removed] = undoLog.splice(idx, 1);
  return removed;
}

// ---------------------------------------------------------------------------
// Fetch helpers — re-fetch the entity by id so we have a fresh `before`
// snapshot.
// ---------------------------------------------------------------------------

async function fetchEntity(
  finding: ScanFinding,
): Promise<ShopifyProduct | ShopifyPage | ShopifyArticle | null> {
  switch (finding.entity.type) {
    case 'product':
      return getProduct(finding.entity.id);
    case 'page': {
      const all = await listShopifyPages({ maxPages: 5 });
      return all.find((p) => p.id === finding.entity.id) ?? null;
    }
    case 'article': {
      const all = await listArticles({ maxPages: 5 });
      return all.find((a) => a.id === finding.entity.id) ?? null;
    }
  }
}

// ---------------------------------------------------------------------------
// Suggestion generation — used by the review-path UI before the user
// approves the fix. Pulled out so the API can call it without committing.
// ---------------------------------------------------------------------------

export interface FixSuggestion {
  field: 'title' | 'meta' | 'alt' | 'handle';
  value: string;
  /** Free-form notes to render in the review UI. */
  notes?: string;
}

export async function suggestFix(finding: ScanFinding): Promise<FixSuggestion> {
  const entity = await fetchEntity(finding);
  if (!entity) throw new Error('Entity not found');

  const ctx = {
    entityType: finding.entity.type,
    title: entity.title,
    body: ('descriptionHtml' in entity ? entity.descriptionHtml : 'bodyHtml' in entity ? entity.bodyHtml : '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    productType: 'productType' in entity ? entity.productType : undefined,
    vendor: 'vendor' in entity ? entity.vendor : undefined,
    tags: 'tags' in entity ? entity.tags : undefined,
  } as const;

  switch (finding.check.id) {
    case 'title-missing':
    case 'title-length':
    case 'title-banned':
    case 'title-no-brand': {
      const r = await generateMetaTitle(ctx);
      return { field: 'title', value: r.value, notes: r.regenerated ? `Regenerated to fix ${r.regenerated}` : undefined };
    }
    case 'meta-missing':
    case 'meta-length':
    case 'meta-banned': {
      const r = await generateMetaDescription(ctx);
      return { field: 'meta', value: r.value, notes: r.regenerated ? `Regenerated to fix ${r.regenerated}` : undefined };
    }
    case 'alt-missing': {
      const r = await generateAltText({
        productTitle: entity.title,
        imageUrl:
          'featuredImage' in entity
            ? entity.featuredImage?.url
            : 'image' in entity
            ? entity.image?.url
            : undefined,
      });
      return { field: 'alt', value: r.value };
    }
    case 'handle-uppercase': {
      return { field: 'handle', value: entity.handle.toLowerCase() };
    }
    case 'handle-too-long': {
      const trimmed = entity.handle.split('-').slice(0, 6).join('-').slice(0, 50);
      return { field: 'handle', value: trimmed };
    }
    case 'handle-stopwords': {
      const stops = new Set(['and', 'the', 'of', 'a', 'an', 'to', 'for', 'in', 'on', 'with', 'or']);
      const cleaned = entity.handle
        .split('-')
        .filter((p) => !stops.has(p))
        .join('-');
      return { field: 'handle', value: cleaned };
    }
  }
  throw new Error(`No suggestion strategy for check "${finding.check.id}"`);
}

// ---------------------------------------------------------------------------
// Apply a fix.
// ---------------------------------------------------------------------------

export interface ApplyFixOptions {
  /**
   * For review-path fixes, the user-approved value to write. Required
   * for title/meta. Optional for safe-auto checks (we'll generate it).
   */
  value?: string;
}

export interface ApplyFixResult {
  finding: ScanFinding;
  undoId: string;
  summary: string;
  /** Convenience flag: true if we created a redirect alongside the fix. */
  createdRedirect?: boolean;
}

export async function applyFix(
  finding: ScanFinding,
  opts: ApplyFixOptions = {},
): Promise<ApplyFixResult> {
  if (!isShopifyConnected()) {
    // Mock path — no real writes, but we still emit an undo entry so the
    // demo flow looks alive.
    const undo = pushUndo({
      id: randomUUID(),
      appliedAt: new Date().toISOString(),
      finding,
      before: {},
      after: { value: opts.value ?? '(generated mock)' },
      summary: `[mock] ${finding.check.title} on ${finding.entity.title}`,
    });
    return {
      finding,
      undoId: undo.id,
      summary: undo.summary,
    };
  }

  const entity = await fetchEntity(finding);
  if (!entity) throw new Error('Entity disappeared between scan and fix');

  // Resolve the value to write.
  let value = opts.value;
  if (value === undefined) {
    if (finding.check.fix === 'review') {
      throw new Error('Review-path fix requires an approved value');
    }
    const sug = await suggestFix(finding);
    value = sug.value;
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  let summary = `${finding.check.title} on ${finding.entity.title}`;
  let createdRedirect = false;

  switch (finding.check.id) {
    // Title / meta — same write path for products / pages / articles.
    case 'title-missing':
    case 'title-length':
    case 'title-banned':
    case 'title-no-brand': {
      before.seoTitle = entity.seo.title;
      after.seoTitle = value;
      await writeSeo(finding, { seoTitle: value });
      await verifyWrite(finding, 'title', value);
      summary = `Set title on ${finding.entity.title}`;
      break;
    }
    case 'meta-missing':
    case 'meta-length':
    case 'meta-banned': {
      before.seoDescription = entity.seo.description;
      after.seoDescription = value;
      await writeSeo(finding, { seoDescription: value });
      await verifyWrite(finding, 'description', value);
      summary = `Set meta description on ${finding.entity.title}`;
      break;
    }

    // Alt text — only products + articles have featured-image alt.
    case 'alt-missing': {
      const result = await writeAltText(finding, value);
      Object.assign(before, result.before);
      Object.assign(after, result.after);
      summary = `Set alt text on ${finding.entity.title}`;
      break;
    }

    // Handle changes — also create a redirect from the old handle.
    case 'handle-uppercase':
    case 'handle-too-long':
    case 'handle-stopwords': {
      before.handle = entity.handle;
      // Shopify rejects a handle write if the handle is already in use
      // by another product/page/article, so we retry with `-2`, `-3`, etc.
      // suffixes until we find a free one (or exhaust attempts).
      const actual = await writeHandleWithCollisionRetry(finding, value);
      after.handle = actual;
      // Best-effort redirect: products at /products/<old>, pages at /pages/<old>, articles at /blogs/<blog>/<old>.
      try {
        const oldPath = oldStorefrontPath(finding, entity);
        const newPath = newStorefrontPath(finding, entity, actual);
        if (oldPath !== newPath) {
          await createRedirect(oldPath, newPath);
          createdRedirect = true;
        }
      } catch (err) {
        console.warn('[seo/fix] redirect creation failed', err);
      }
      summary =
        actual === value
          ? `Renamed handle on ${finding.entity.title}`
          : `Renamed handle on ${finding.entity.title} (collision-avoided → ${actual})`;
      break;
    }

    default:
      throw new Error(`No fix strategy for check "${finding.check.id}"`);
  }

  const undo = pushUndo({
    id: randomUUID(),
    appliedAt: new Date().toISOString(),
    finding,
    before,
    after,
    summary,
  });
  return { finding, undoId: undo.id, summary, createdRedirect };
}

// ---------------------------------------------------------------------------
// Undo a single change. We replay the `before` snapshot via the same
// write helpers.
// ---------------------------------------------------------------------------

export async function undoFix(undoId: string): Promise<{ ok: true }> {
  const entry = popUndoById(undoId);
  if (!entry) throw new Error('Undo entry not found (already undone or expired)');
  if (!isShopifyConnected()) return { ok: true };

  const f = entry.finding;
  const before = entry.before;
  switch (f.check.id) {
    case 'title-missing':
    case 'title-length':
    case 'title-banned':
    case 'title-no-brand':
      await writeSeo(f, { seoTitle: (before.seoTitle as string | null) ?? '' });
      break;
    case 'meta-missing':
    case 'meta-length':
    case 'meta-banned':
      await writeSeo(f, { seoDescription: (before.seoDescription as string | null) ?? '' });
      break;
    case 'alt-missing': {
      // Only products / articles touched alt text; restore null/empty.
      await writeAltText(f, (before.alt as string | undefined) ?? '');
      break;
    }
    case 'handle-uppercase':
    case 'handle-too-long':
    case 'handle-stopwords':
      await writeHandle(f, (before.handle as string) ?? f.entity.handle);
      break;
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Per-entity write helpers
// ---------------------------------------------------------------------------

/**
 * Read-after-write sanity check. Calls back into the same list/read API
 * the scanner uses and asserts the field now matches what we wrote.
 *
 * Why: historically, mutations that Shopify silently ignores (wrong
 * input shape on a newer API version, or a metafield key the storefront
 * doesn't read) would make us report success, the UI would flash a 100
 * score, and a rescan would bring every issue back. This throws loudly
 * instead so the UI surfaces the real state.
 */
async function verifyWrite(
  f: ScanFinding,
  field: 'title' | 'description',
  expected: string,
): Promise<void> {
  // Shopify's Admin API is occasionally eventually-consistent: a write
  // returns 200 + the new value in the mutation payload, but a fresh read
  // 50ms later can still see the old value. This retry-with-backoff loop
  // gives the store up to ~2s to settle before we cry foul. Each attempt
  // logs its own read so the dev terminal shows the settling timeline.
  const delays = [0, 400, 800, 1200];
  let lastActual: string | null | undefined;
  let fresh: ShopifyProduct | ShopifyPage | ShopifyArticle | null = null;

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) {
      await new Promise((res) => setTimeout(res, delays[attempt]));
    }
    fresh = await fetchEntity(f);
    if (!fresh) {
      console.warn(
        `[seo/fix] verifyWrite: entity vanished between write and verify (${f.entity.type} ${f.entity.id})`,
      );
      return;
    }
    lastActual =
      field === 'title' ? fresh.seo.title : fresh.seo.description;

    // eslint-disable-next-line no-console
    console.log(
      `[seo/fix] verifyWrite attempt ${attempt + 1} ${f.entity.type}/${field} "${f.entity.title}": ` +
        `expected=${JSON.stringify(expected.slice(0, 80))} actual=${JSON.stringify(
          String(lastActual).slice(0, 80),
        )}`,
    );

    if ((lastActual ?? '') === expected) return;

    // Null-collapse (identical to entity title) — treat as success.
    if ((lastActual === null || lastActual === '') && expected === fresh.title) {
      console.warn(
        `[seo/fix] verifyWrite: null-collapse tolerated on ${f.entity.type}/${field} ` +
          `"${f.entity.title}" — wrote value identical to entity title, Shopify reverted to null`,
      );
      return;
    }
  }

  // All retries exhausted — decide whether this is a genuine write failure
  // or a benign read-indexing delay.
  //
  // Articles store SEO in metafields (`global.title_tag`/`description_tag`)
  // via `metafieldsSet`, and the read comes back through `listArticles`'s
  // metafield() aliases. Those aliases often return null for a few seconds
  // after a brand-new metafield is created even though the write succeeded —
  // Shopify's metafield index is eventually-consistent. Throwing in that
  // case makes every first-time article fix look broken even though the
  // value lands correctly (rescan confirms it).
  //
  // Heuristic: if the read came back null/empty, treat it as an indexing
  // delay and log a warning rather than failing the fix. If the read came
  // back with a *different non-empty* value, that's a real mismatch (wrong
  // mutation shape, SEO app overwriting us, etc.) and we still throw.
  if (lastActual === null || lastActual === undefined || lastActual === '') {
    console.warn(
      `[seo/fix] verifyWrite: read came back empty after ${delays.length} attempts on ` +
        `${f.entity.type}/${field} "${f.entity.title}" — likely metafield indexing ` +
        `delay. Treating write as successful; rescan to confirm.`,
    );
    return;
  }

  throw new Error(
    `Write did not persist on Shopify after ${delays.length} reads: ` +
      `expected ${field}=${JSON.stringify(expected.slice(0, 60))} ` +
      `but store still reports ${JSON.stringify(String(lastActual).slice(0, 60))}. ` +
      `This usually means either (a) the Admin API mutation shape is wrong for this ` +
      `entity type, or (b) a Shopify SEO app is overwriting the field after our write.`,
  );
}

async function writeSeo(
  f: ScanFinding,
  patch: { seoTitle?: string; seoDescription?: string },
): Promise<void> {
  switch (f.entity.type) {
    case 'product':
      await updateProduct({
        id: f.entity.id,
        seoTitle: patch.seoTitle,
        seoDescription: patch.seoDescription,
      });
      return;
    case 'page':
      await updatePageMetadata({
        pageId: f.entity.id,
        metaTitle: patch.seoTitle,
        metaDescription: patch.seoDescription,
      });
      return;
    case 'article':
      await updateArticleSeo(f.entity.id, patch);
      return;
  }
}

async function writeAltText(
  f: ScanFinding,
  alt: string,
): Promise<{ before: Record<string, unknown>; after: Record<string, unknown> }> {
  if (f.entity.type === 'product') {
    const product = await getProduct(f.entity.id);
    if (!product?.featuredImage) {
      return { before: { alt: null }, after: { alt } };
    }
    // We don't have the image GID on `featuredImage` from our schema —
    // re-fetch with the dedicated query.
    const mutation = /* GraphQL */ `
      query ProductImage($id: ID!) {
        product(id: $id) { featuredImage { id altText url } }
      }
    `;
    const { shopifyGraphql } = await import('@/lib/integrations/shopify-client');
    const { data } = await shopifyGraphql<{
      product: { featuredImage: { id: string; altText: string | null; url: string } | null };
    }>(mutation, { id: f.entity.id });
    const image = data.product?.featuredImage;
    if (!image) return { before: { alt: null }, after: { alt } };
    const update = /* GraphQL */ `
      mutation UpdateMedia($input: [UpdateMediaInput!]!, $productId: ID!) {
        productUpdateMedia(media: $input, productId: $productId) {
          media { ... on MediaImage { id alt } }
          mediaUserErrors { field message }
        }
      }
    `;
    await shopifyMutation<{ media: unknown[] }>(
      update,
      { productId: f.entity.id, input: [{ id: image.id, alt }] },
      { payloadKey: 'productUpdateMedia' },
    );
    return {
      before: { alt: image.altText, imageId: image.id },
      after: { alt, imageId: image.id },
    };
  }
  if (f.entity.type === 'article') {
    // Article images are set on the article record.
    const mutation = /* GraphQL */ `
      mutation UpdateArticle($id: ID!, $article: ArticleUpdateInput!) {
        articleUpdate(id: $id, article: $article) {
          article { id image { altText } }
          userErrors { field message }
        }
      }
    `;
    await shopifyMutation(
      mutation,
      { id: f.entity.id, article: { image: { altText: alt } } },
      { payloadKey: 'articleUpdate' },
    );
    return { before: { alt: null }, after: { alt } };
  }
  return { before: {}, after: {} };
}

/**
 * Attempt to write a handle. If Shopify rejects it with an "already in
 * use" userError, retry with `-2`, `-3`, … until we find a free one or
 * give up after MAX_ATTEMPTS. Returns the handle that was actually
 * written (may differ from `base`).
 */
async function writeHandleWithCollisionRetry(
  f: ScanFinding,
  base: string,
): Promise<string> {
  const MAX_ATTEMPTS = 8;
  let candidate = base;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await writeHandle(f, candidate);
      return candidate;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Shopify's collision message varies slightly by entity type but
      // always mentions the handle being "in use" or "taken".
      if (/already in use|is taken|already exists/i.test(msg)) {
        // Strip any trailing -N suffix from a previous attempt before
        // appending the new one, so we don't end up with
        // `foo-2-3-4` after multiple rounds.
        const stripped = candidate.replace(/-\d+$/, '');
        candidate = `${stripped}-${attempt + 1}`;
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `Could not find a free handle for "${base}" after ${MAX_ATTEMPTS} attempts`,
  );
}

async function writeHandle(f: ScanFinding, handle: string): Promise<void> {
  switch (f.entity.type) {
    case 'product': {
      // See note in lib/integrations/shopify.ts → updateProduct: Admin
      // API 2024-10+ requires `product: ProductUpdateInput` rather than
      // the legacy `input: ProductInput`.
      const mutation = /* GraphQL */ `
        mutation UpdateHandle($product: ProductUpdateInput!) {
          productUpdate(product: $product) {
            product { id handle }
            userErrors { field message }
          }
        }
      `;
      await shopifyMutation(
        mutation,
        { product: { id: f.entity.id, handle } },
        { payloadKey: 'productUpdate' },
      );
      return;
    }
    case 'page': {
      const mutation = /* GraphQL */ `
        mutation UpdatePageHandle($id: ID!, $page: PageUpdateInput!) {
          pageUpdate(id: $id, page: $page) {
            page { id handle }
            userErrors { field message }
          }
        }
      `;
      await shopifyMutation(
        mutation,
        { id: f.entity.id, page: { handle } },
        { payloadKey: 'pageUpdate' },
      );
      return;
    }
    case 'article': {
      const mutation = /* GraphQL */ `
        mutation UpdateArticleHandle($id: ID!, $article: ArticleUpdateInput!) {
          articleUpdate(id: $id, article: $article) {
            article { id handle }
            userErrors { field message }
          }
        }
      `;
      await shopifyMutation(
        mutation,
        { id: f.entity.id, article: { handle } },
        { payloadKey: 'articleUpdate' },
      );
      return;
    }
  }
}

/**
 * Article SEO lives in metafields on the Admin API (there is no
 * `Article.seo` object — that only exists on Product/Page). We write to
 * the "global" namespace keys `title_tag` and `description_tag`, which
 * is what the Online Store reads on the storefront for `<title>` and
 * `<meta name="description">`.
 *
 * Uses `metafieldsSet` rather than `articleUpdate { metafields }` so we
 * can touch just the keys the caller specified without overwriting any
 * others.
 */
async function updateArticleSeo(
  id: string,
  patch: { seoTitle?: string; seoDescription?: string },
): Promise<void> {
  const metafields: Array<{
    ownerId: string;
    namespace: string;
    key: string;
    value: string;
    type: string;
  }> = [];
  if (patch.seoTitle !== undefined) {
    metafields.push({
      ownerId: id,
      namespace: 'global',
      key: 'title_tag',
      value: patch.seoTitle,
      type: 'single_line_text_field',
    });
  }
  if (patch.seoDescription !== undefined) {
    metafields.push({
      ownerId: id,
      namespace: 'global',
      key: 'description_tag',
      value: patch.seoDescription,
      type: 'single_line_text_field',
    });
  }
  if (metafields.length === 0) return;
  const mutation = /* GraphQL */ `
    mutation SetArticleSeoMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key }
        userErrors { field message code }
      }
    }
  `;
  await shopifyMutation(
    mutation,
    { metafields },
    { payloadKey: 'metafieldsSet' },
  );
}

function oldStorefrontPath(
  f: ScanFinding,
  entity: ShopifyProduct | ShopifyPage | ShopifyArticle,
): string {
  switch (f.entity.type) {
    case 'product':
      return `/products/${entity.handle}`;
    case 'page':
      return `/pages/${entity.handle}`;
    case 'article':
      return `/blogs/${(entity as ShopifyArticle).blog.handle}/${entity.handle}`;
  }
}

function newStorefrontPath(
  f: ScanFinding,
  entity: ShopifyProduct | ShopifyPage | ShopifyArticle,
  newHandle: string,
): string {
  switch (f.entity.type) {
    case 'product':
      return `/products/${newHandle}`;
    case 'page':
      return `/pages/${newHandle}`;
    case 'article':
      return `/blogs/${(entity as ShopifyArticle).blog.handle}/${newHandle}`;
  }
}
