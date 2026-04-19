import { NextResponse } from 'next/server';
import {
  generateMetaTitle,
  generateMetaDescription,
  generateAltText,
  type GenerateContext,
} from '@/lib/ai/evari-seo';
import { hasAIGatewayCredentials } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/seo/generate
 *
 * Body shape:
 *   {
 *     field: 'title' | 'meta' | 'alt',
 *     entity: { type, title, body?, productType?, vendor?, tags? },
 *     // for alt only:
 *     image?: { url?: string, position?: string },
 *   }
 *
 * Returns `{ value, attempts, regenerated, modelUsed }` on success.
 *
 * The route is a thin pass-through to `lib/ai/evari-seo` so the same
 * generator runs from the SEO drawer and the SEO Health auto-fix queue.
 */
export async function POST(req: Request) {
  if (!hasAIGatewayCredentials()) {
    return NextResponse.json(
      {
        error:
          'AI Gateway not configured. Set AI_GATEWAY_API_KEY or deploy with Vercel OIDC.',
      },
      { status: 503 },
    );
  }

  interface IncomingEntity {
    type?: GenerateContext['entityType'];
    title?: string;
    body?: string;
    productType?: string;
    vendor?: string;
    tags?: string[];
    variantsSummary?: string;
  }
  let body: {
    field?: 'title' | 'meta' | 'alt';
    entity?: IncomingEntity;
    image?: { url?: string; position?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const field = body.field;
  if (field !== 'title' && field !== 'meta' && field !== 'alt') {
    return NextResponse.json(
      { error: 'field must be "title", "meta", or "alt"' },
      { status: 400 },
    );
  }

  const entity = body.entity;
  if (!entity?.type || !entity?.title) {
    return NextResponse.json(
      { error: 'entity.type and entity.title are required' },
      { status: 400 },
    );
  }

  try {
    if (field === 'alt') {
      const result = await generateAltText({
        productTitle: entity.title,
        imageUrl: body.image?.url,
        positionLabel: body.image?.position,
      });
      return NextResponse.json(result);
    }

    const ctx: GenerateContext = {
      entityType: entity.type,
      title: entity.title,
      productType: entity.productType,
      vendor: entity.vendor,
      tags: entity.tags,
      body: entity.body,
      variantsSummary: entity.variantsSummary,
    };

    const result =
      field === 'title'
        ? await generateMetaTitle(ctx)
        : await generateMetaDescription(ctx);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
