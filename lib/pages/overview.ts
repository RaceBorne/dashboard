/**
 * Pages overview — the data model behind `/pages`.
 *
 * Joins every Shopify entity (product, Online-Store page, blog article)
 * with the findings from the latest SEO Health scan so the UI can render
 * one row per URL with per-entity issue counts, meta-length stats, etc.
 *
 * When GSC + GA4 are wired up this is the layer where impressions /
 * clicks / avg-position / sessions land — the client already reserves the
 * columns, so flipping them on is a matter of filling these fields in.
 */

import {
  getStorefrontBaseUrl,
  isShopifyConnected,
  listArticles,
  listProducts,
  listShopifyPages,
} from '@/lib/integrations/shopify';
import { ensureScanHydrated, getCachedScan } from '@/lib/seo/scan';
import type {
  CheckSeverity,
  EntityType,
  ScanFinding,
} from '@/lib/seo/types';

export interface PageOverviewRow {
  /** Shopify gid for the entity. Stable across scans. */
  id: string;
  type: EntityType;
  title: string;
  handle: string;
  /** Storefront path, e.g. `/products/evari-tour`. */
  path: string;
  /** Full storefront URL including origin. */
  url: string;
  /** ACTIVE / DRAFT / ARCHIVED / PUBLISHED. */
  status: string;
  metaTitle: string | null;
  metaTitleLen: number;
  metaDescription: string | null;
  metaDescriptionLen: number;
  hasFeaturedImage: boolean;
  imageAltText: string | null;
  createdAt: string;
  updatedAt: string;
  /** All scan findings attached to this entity. */
  findings: ScanFinding[];
  totalIssues: number;
  issuesBySeverity: Record<CheckSeverity, number>;
  /** GSC columns — null until the OAuth ingest lands. */
  gsc: GscStubColumns;
}

/**
 * Placeholder shape for the Google Search Console numbers. The client
 * renders "—" with a gentle Connect-Google nudge when `connected` is
 * false; once the ingest lands the same fields carry real values.
 */
export interface GscStubColumns {
  connected: boolean;
  impressions28d: number | null;
  clicks28d: number | null;
  avgPosition28d: number | null;
  ctr28d: number | null;
}

export interface PagesOverviewTotals {
  total: number;
  products: number;
  pages: number;
  articles: number;
  withIssues: number;
  missingMetaTitle: number;
  missingMetaDesc: number;
  avgMetaTitleLen: number;
  avgMetaDescLen: number;
  bySeverity: Record<CheckSeverity, number>;
}

export interface PagesOverview {
  connected: boolean;
  gscConnected: boolean;
  scannedAt: string | null;
  scanScore: number | null;
  rows: PageOverviewRow[];
  totals: PagesOverviewTotals;
  warnings: string[];
}

export async function getPagesOverview(): Promise<PagesOverview> {
  // Load the scan so we can join findings on each row. Force a fresh read
  // on every page render — the SEO Health workflow mutates the cache and
  // we want Pages to reflect the latest state without requiring a
  // full rescan.
  await ensureScanHydrated({ force: true });
  const scan = getCachedScan();

  const connected = isShopifyConnected();
  const gscConnected = false; // TODO: flip when OAuth ingest lands.
  const warnings: string[] = [];

  const storeBase = await getStorefrontBaseUrl().catch(() => {
    warnings.push('Could not resolve storefront base URL; using evari.cc');
    return 'https://evari.cc';
  });

  // Pull the three entity types in parallel so a flaky one doesn't stall
  // the others. allSettled because an article schema drift shouldn't
  // blank the whole page — we'd rather show products + pages + a warning.
  const [productsR, pagesR, articlesR] = await Promise.allSettled([
    listProducts({ first: 100, maxPages: 10 }),
    listShopifyPages({ first: 100, maxPages: 10 }),
    listArticles({ first: 100, maxPages: 10 }),
  ]);

  const products = productsR.status === 'fulfilled' ? productsR.value : [];
  const pages = pagesR.status === 'fulfilled' ? pagesR.value : [];
  const articles = articlesR.status === 'fulfilled' ? articlesR.value : [];

  if (productsR.status === 'rejected')
    warnings.push(`Products: ${errMsg(productsR.reason)}`);
  if (pagesR.status === 'rejected')
    warnings.push(`Pages: ${errMsg(pagesR.reason)}`);
  if (articlesR.status === 'rejected')
    warnings.push(`Articles: ${errMsg(articlesR.reason)}`);

  // Index findings by entity id for O(1) join.
  const findingsByEntity = new Map<string, ScanFinding[]>();
  if (scan) {
    for (const f of scan.findings) {
      const arr = findingsByEntity.get(f.entity.id) ?? [];
      arr.push(f);
      findingsByEntity.set(f.entity.id, arr);
    }
  }

  const rows: PageOverviewRow[] = [];
  const gscStub: GscStubColumns = {
    connected: false,
    impressions28d: null,
    clicks28d: null,
    avgPosition28d: null,
    ctr28d: null,
  };

  for (const p of products) {
    const path = `/products/${p.handle}`;
    const findings = findingsByEntity.get(p.id) ?? [];
    rows.push({
      id: p.id,
      type: 'product',
      title: p.title,
      handle: p.handle,
      path,
      url: p.onlineStoreUrl ?? `${storeBase}${path}`,
      status: p.status,
      metaTitle: p.seo?.title ?? null,
      metaTitleLen: p.seo?.title?.length ?? 0,
      metaDescription: p.seo?.description ?? null,
      metaDescriptionLen: p.seo?.description?.length ?? 0,
      hasFeaturedImage: Boolean(p.featuredImage),
      imageAltText: p.featuredImage?.altText ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      findings,
      ...summarizeFindings(findings),
      gsc: gscStub,
    });
  }

  for (const p of pages) {
    const path = `/pages/${p.handle}`;
    const findings = findingsByEntity.get(p.id) ?? [];
    rows.push({
      id: p.id,
      type: 'page',
      title: p.title,
      handle: p.handle,
      path,
      url: `${storeBase}${path}`,
      status: p.isPublished ? 'PUBLISHED' : 'DRAFT',
      metaTitle: p.seo?.title ?? null,
      metaTitleLen: p.seo?.title?.length ?? 0,
      metaDescription: p.seo?.description ?? null,
      metaDescriptionLen: p.seo?.description?.length ?? 0,
      hasFeaturedImage: false,
      imageAltText: null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      findings,
      ...summarizeFindings(findings),
      gsc: gscStub,
    });
  }

  for (const a of articles) {
    const path = `/blogs/${a.blog.handle}/${a.handle}`;
    const findings = findingsByEntity.get(a.id) ?? [];
    rows.push({
      id: a.id,
      type: 'article',
      title: a.title,
      handle: a.handle,
      path,
      url: `${storeBase}${path}`,
      status: a.isPublished ? 'PUBLISHED' : 'DRAFT',
      metaTitle: a.seo?.title ?? null,
      metaTitleLen: a.seo?.title?.length ?? 0,
      metaDescription: a.seo?.description ?? null,
      metaDescriptionLen: a.seo?.description?.length ?? 0,
      hasFeaturedImage: Boolean(a.image),
      imageAltText: a.image?.altText ?? null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      findings,
      ...summarizeFindings(findings),
      gsc: gscStub,
    });
  }

  const withIssues = rows.filter((r) => r.totalIssues > 0).length;
  const missingMetaTitle = rows.filter((r) => !r.metaTitle).length;
  const missingMetaDesc = rows.filter((r) => !r.metaDescription).length;
  const metaTitleLens = rows
    .filter((r) => r.metaTitleLen > 0)
    .map((r) => r.metaTitleLen);
  const metaDescLens = rows
    .filter((r) => r.metaDescriptionLen > 0)
    .map((r) => r.metaDescriptionLen);
  const avgMetaTitleLen =
    metaTitleLens.length > 0
      ? Math.round(metaTitleLens.reduce((a, b) => a + b, 0) / metaTitleLens.length)
      : 0;
  const avgMetaDescLen =
    metaDescLens.length > 0
      ? Math.round(metaDescLens.reduce((a, b) => a + b, 0) / metaDescLens.length)
      : 0;
  const bySeverity = rows.reduce<Record<CheckSeverity, number>>(
    (acc, r) => {
      acc.A += r.issuesBySeverity.A;
      acc.B += r.issuesBySeverity.B;
      acc.C += r.issuesBySeverity.C;
      return acc;
    },
    { A: 0, B: 0, C: 0 },
  );

  return {
    connected,
    gscConnected,
    scannedAt: scan?.finishedAt ?? null,
    scanScore: scan?.score ?? null,
    rows,
    totals: {
      total: rows.length,
      products: products.length,
      pages: pages.length,
      articles: articles.length,
      withIssues,
      missingMetaTitle,
      missingMetaDesc,
      avgMetaTitleLen,
      avgMetaDescLen,
      bySeverity,
    },
    warnings,
  };
}

function summarizeFindings(findings: ScanFinding[]): {
  totalIssues: number;
  issuesBySeverity: Record<CheckSeverity, number>;
} {
  const issuesBySeverity: Record<CheckSeverity, number> = { A: 0, B: 0, C: 0 };
  for (const f of findings) {
    issuesBySeverity[f.check.severity] += 1;
  }
  return { totalIssues: findings.length, issuesBySeverity };
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
