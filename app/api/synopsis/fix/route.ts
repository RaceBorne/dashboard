import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { anthropic } from '@ai-sdk/anthropic';
import { buildSystemPrompt } from '@/lib/ai/gateway';
import {
  getProduct,
  listArticles,
  listShopifyPages,
  updateArticleMetadata,
  updatePageMetadata,
  updateProduct,
} from '@/lib/integrations/shopify';
import {
  brandVoiceInstruction,
  researchProductForSeo,
} from '@/lib/seo/productResearch';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

/**
 * POST /api/synopsis/fix
 *
 * Body: { kind: 'meta-title' | 'meta-desc', pageId: string, pageType: 'product' | 'page' | 'article' }
 *
 * One-click auto-fix for a missing meta title or meta description:
 *   1. Look up the entity in Shopify by id (with its current body / title /
 *      existing SEO fields).
 *   2. Ask Claude to generate a new title (50-60 chars) or description
 *      (120-160 chars) in Evari's voice, grounded in the entity's content.
 *   3. Write it back to Shopify via the right updater.
 *   4. Return { title?, description? } so the client can show what was set.
 *
 * Never uses em-dashes — the CLAUDE.md house rule is enforced in the prompt.
 */
interface Body {
  kind?: 'meta-title' | 'meta-desc';
  pageId?: string;
  pageType?: 'product' | 'page' | 'article';
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const { kind, pageId, pageType } = body;
  if (!kind || !pageId || !pageType) {
    return NextResponse.json(
      { ok: false, error: 'kind, pageId, pageType required' },
      { status: 400 },
    );
  }
  if (kind !== 'meta-title' && kind !== 'meta-desc') {
    return NextResponse.json(
      { ok: false, error: 'kind must be meta-title or meta-desc' },
      { status: 400 },
    );
  }

  // -------- 1. Resolve the entity from Shopify -----------------------------
  let entityTitle = '';
  let entityBody = '';
  let existingTitle = '';
  let existingDescription = '';
  let entityVendor = '';
  let entityHandle = '';
  try {
    if (pageType === 'product') {
      const p = await getProduct(pageId);
      if (!p) {
        return NextResponse.json(
          { ok: false, error: 'Product not found' },
          { status: 404 },
        );
      }
      entityTitle = p.title;
      entityBody = stripHtml(p.descriptionHtml || '');
      existingTitle = p.seo?.title ?? '';
      existingDescription = p.seo?.description ?? '';
      entityVendor = p.vendor ?? '';
      entityHandle = p.handle ?? '';
    } else if (pageType === 'page') {
      const list = await listShopifyPages({ first: 100, maxPages: 10 });
      const hit = list.find((x) => x.id === pageId);
      if (!hit) {
        return NextResponse.json(
          { ok: false, error: 'Page not found' },
          { status: 404 },
        );
      }
      entityTitle = hit.title;
      entityBody = stripHtml(hit.bodyHtml || '');
      existingTitle = hit.seo?.title ?? '';
      existingDescription = hit.seo?.description ?? '';
    } else {
      const list = await listArticles({ first: 100, maxPages: 10 });
      const hit = list.find((x) => x.id === pageId);
      if (!hit) {
        return NextResponse.json(
          { ok: false, error: 'Article not found' },
          { status: 404 },
        );
      }
      entityTitle = hit.title;
      entityBody = stripHtml(hit.bodyHtml || '');
      existingTitle = hit.seo?.title ?? '';
      existingDescription = hit.seo?.description ?? '';
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Shopify read failed' },
      { status: 500 },
    );
  }

  // -------- 2. Research the product, then ask Claude for the new copy ------
  // Evari resells third-party brands (Gtechniq, Shimano, Park Tool, etc.)
  // alongside its own 856 frames. For products we run a quick brand
  // classification + optional web-search pass, then feed the resulting
  // research bundle into the prompt so the model has factual context
  // for non-Evari items instead of refusing or guessing.
  const research =
    pageType === 'product'
      ? await researchProductForSeo({
          title: entityTitle,
          vendor: entityVendor,
          handle: entityHandle,
          bodyText: entityBody,
        })
      : null;

  const instruction =
    kind === 'meta-title'
      ? 'Write a meta title for this page. Target 50-60 characters (55 ideal). Must read naturally, front-load the primary term, no clickbait.'
      : 'Write a meta description for this page. Target 140-155 characters. Must stand alone as a SERP snippet, highlight the concrete value to the reader, end with a soft call to action when it fits. Do not pad.';

  const voiceLine = research
    ? brandVoiceInstruction(research.brandKind)
    : 'This is an Evari-store page. Use Evari voice if it is an Evari own-brand piece, otherwise write factually about the page topic.';

  const prompt = [
    'Page: ' + entityTitle,
    'Type: ' + pageType,
    research ? '' : '',
    research ? '# Product research' : '',
    research ? research.contextBlock : '',
    '',
    'Page body (first 1,500 chars):',
    entityBody.slice(0, 1500),
    '',
    existingTitle ? 'Existing meta title: ' + existingTitle : '',
    existingDescription ? 'Existing meta description: ' + existingDescription : '',
    '',
    '# Voice for this item',
    voiceLine,
    '',
    'House rules (strict):',
    '  - Never use em-dashes or en-dashes. Use commas, colons or full stops.',
    '  - Plain sentence case. No emoji.',
    '  - Output ONLY the meta text. No quotes, no prefix, no commentary.',
    '  - Never refuse: even if the product is not an Evari own-brand item, you are still authorised to write factual SEO meta describing it.',
    '',
    instruction,
  ]
    .filter(Boolean)
    .join('\n');

  // For third-party products we use the analyst voice so the Evari brand
  // skill does not pull the copy back into Evari own-brand framing.
  const system = await buildSystemPrompt({
    voice: research && research.brandKind === 'third-party' ? 'analyst' : 'evari',
    task: instruction,
  });

  let text: string;
  try {
    const res = await generateText({ model: gateway(MODEL), system, prompt });
    text = res.text.trim();
  } catch (gatewayErr) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'No model available. Set AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY in Vercel env.',
          detail: gatewayErr instanceof Error ? gatewayErr.message : String(gatewayErr),
        },
        { status: 502 },
      );
    }
    try {
      const bareModel = MODEL.replace(/^anthropic\//, '');
      const res = await generateText({
        model: anthropic(bareModel),
        system,
        prompt,
      });
      text = res.text.trim();
    } catch (anthropicErr) {
      return NextResponse.json(
        { ok: false, error: anthropicErr instanceof Error ? anthropicErr.message : 'AI failed' },
        { status: 502 },
      );
    }
  }

  // Strip stray surrounding quotes Claude sometimes adds.
  const cleaned = text
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[—–]/g, ',')  // Defensive: replace any stray em/en-dashes with commas.
    .trim();

  if (!cleaned) {
    return NextResponse.json(
      { ok: false, error: 'Model returned no text' },
      { status: 502 },
    );
  }

  // -------- 3. Write back to Shopify + verify -----------------------------
  // For products we trust the mutation response itself (productUpdate
  // returns the freshly-updated product, which is the only authoritative
  // post-write value, a separate product(id:) query is subject to a
  // brief read-after-write inconsistency window where Shopify can echo
  // the pre-write SEO state for ~5s after the mutation succeeds, which
  // produced a false-negative "did not change" 502 for fixes that had
  // actually persisted. For pages and articles we still re-read because
  // the metafieldsSet path doesn't echo the merged Page/Article value.
  let verifiedTitle: string | null | undefined = undefined;
  let verifiedDesc: string | null | undefined = undefined;
  try {
    if (pageType === 'product') {
      const updated = await updateProduct({
        id: pageId,
        ...(kind === 'meta-title' ? { seoTitle: cleaned } : { seoDescription: cleaned }),
      });
      verifiedTitle = updated.seo?.title ?? null;
      verifiedDesc = updated.seo?.description ?? null;
    } else if (pageType === 'page') {
      await updatePageMetadata({
        pageId,
        ...(kind === 'meta-title' ? { metaTitle: cleaned } : { metaDescription: cleaned }),
      });
      // Brief settle so the metafields read isn't stale.
      await new Promise((r) => setTimeout(r, 750));
      const list = await listShopifyPages({ first: 250, maxPages: 20 });
      const hit = list.find((x) => x.id === pageId);
      verifiedTitle = hit?.seo?.title ?? null;
      verifiedDesc = hit?.seo?.description ?? null;
    } else {
      await updateArticleMetadata({
        articleId: pageId,
        ...(kind === 'meta-title' ? { metaTitle: cleaned } : { metaDescription: cleaned }),
      });
      await new Promise((r) => setTimeout(r, 750));
      const list = await listArticles({ first: 250, maxPages: 20 });
      const hit = list.find((x) => x.id === pageId);
      verifiedTitle = hit?.seo?.title ?? null;
      verifiedDesc = hit?.seo?.description ?? null;
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Shopify write failed', generated: cleaned },
      { status: 502 },
    );
  }

  // Did the write actually stick? Compare what we sent vs what Shopify
  // returns on a fresh read.
  const verifiedValue = kind === 'meta-title' ? verifiedTitle : verifiedDesc;
  const stuck = typeof verifiedValue === 'string' && verifiedValue.trim() === cleaned.trim();

  // Log for Vercel runtime-log visibility. Both sent and returned so we
  // can tell whether the mutation was silently dropped.
  // eslint-disable-next-line no-console
  console.log(
    '[synopsis/fix] ' + pageType + ':' + pageId + ' ' + kind +
      ' sent=' + JSON.stringify(cleaned.slice(0, 80)) +
      ' verified=' + JSON.stringify((verifiedValue ?? null) && String(verifiedValue).slice(0, 80)) +
      ' stuck=' + stuck,
  );

  if (!stuck) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Shopify accepted the mutation but the ' +
          kind +
          ' did not change. Current value: ' +
          JSON.stringify(verifiedValue) +
          '. See server logs for full sent/returned dump.',
        generated: cleaned,
        verified: verifiedValue,
        pageType,
        pageId,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    kind,
    pageId,
    verified: verifiedValue,
    ...(kind === 'meta-title' ? { title: cleaned } : { description: cleaned }),
  });
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
