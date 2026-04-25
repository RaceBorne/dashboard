import { NextResponse } from 'next/server';

import { buildSystemPrompt, generateTextWithFallback } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/journals/ai-seo
 *
 * Body: { title, summary, blocks }
 *
 * Returns:
 *   {
 *     ok: true,
 *     tags: string[],              // 5-8 short tags
 *     metaTitle: string,           // 50-60 chars
 *     metaDescription: string,     // 150-160 chars
 *     focusKeyword: string,        // primary search term
 *     secondaryKeywords: string[], // 3-5 supporting terms
 *     rationale: {
 *       focusKeyword: string,
 *       secondaryKeywords: string,
 *       tags: string,
 *       metaTitle: string,
 *       metaDescription: string,
 *     }
 *   }
 *
 * Recommendations are built by Claude Haiku based on:
 *   1. Article title + body (subject signal)
 *   2. Evari brand voice (e-bikes, premium, cycling lifestyle)
 *   3. Shopify SEO best practices (length caps, brand suffix,
 *      action-oriented descriptions, focus keyword in first words)
 *   4. Search-intent matching: "informational" for guides,
 *      "commercial" for product/edition launches, "navigational"
 *      for brand/event coverage.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    title?: string;
    summary?: string;
    blocks?: Array<{ type: string; data: Record<string, unknown> }>;
  } | null;

  if (!body || !body.title) {
    return NextResponse.json(
      { ok: false, error: 'Missing title' },
      { status: 400 },
    );
  }

  // Roll the body blocks into plain text so the model has subject context.
  const articleText = (body.blocks ?? [])
    .map((b) => {
      const d = b.data ?? {};
      // pull every plausible text field so headers, paragraphs, quotes,
      // captions, list items all contribute.
      const fields = ['text', 'caption', 'quote', 'title', 'level'];
      const parts: string[] = [];
      for (const f of fields) {
        const v = (d as Record<string, unknown>)[f];
        if (typeof v === 'string') parts.push(v);
      }
      const items = (d as { items?: unknown }).items;
      if (Array.isArray(items)) {
        for (const it of items) {
          if (typeof it === 'string') parts.push(it);
        }
      }
      return parts.join(' ');
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, 4000);

  const system = await buildSystemPrompt({
    voice: 'evari',
    task: `You are an SEO assistant for the Evari blog (premium British e-bike brand at evari.cc). Generate SEO metadata for a Shopify blog article. Output STRICT JSON only — no commentary, no markdown fences, no prose around the JSON. The shape is:

{
  "tags": ["..."],                // 5-8 lowercase short tags
  "metaTitle": "...",             // 50-60 chars, ending with " | Evari"
  "metaDescription": "...",       // 150-160 chars, action-oriented
  "focusKeyword": "...",          // 2-4 words, primary search term
  "secondaryKeywords": ["..."],   // 3-5 supporting search terms
  "rationale": {
    "focusKeyword": "...",        // 1 sentence why this keyword
    "secondaryKeywords": "...",   // 1 sentence
    "tags": "...",                // 1 sentence
    "metaTitle": "...",           // 1 sentence
    "metaDescription": "..."      // 1 sentence
  }
}

Rules:
 - Focus keyword: pick the search term a buyer/enthusiast would type to find this article.
 - Secondary keywords: long-tail variations and related terms.
 - Tags: short, lowercase, hyphenated for multi-word ("british-racing-green").
 - Meta title: front-load the focus keyword, end with " | Evari".
 - Meta description: lead with a benefit or hook, include the focus keyword once, end with a soft CTA where natural. Avoid em-dashes.
 - Rationale: one sentence per item explaining the SEO reasoning ("targets buyers researching X", "matches search intent Y", etc).`,
  });

  const userPrompt = [
    `Article title: ${body.title}`,
    body.summary ? `Summary: ${body.summary}` : '',
    '',
    'Article body:',
    articleText || '(empty)',
  ]
    .filter(Boolean)
    .join('\n');

  let raw: string;
  try {
    const { text } = await generateTextWithFallback({
      model: process.env.AI_MODEL || 'anthropic/claude-haiku-4-5',
      system,
      prompt: userPrompt,
      temperature: 0.3,
    });
    raw = text;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'AI call failed' },
      { status: 500 },
    );
  }

  // Strip any accidental markdown code fence from the model output.
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json(
      { ok: false, error: 'AI returned invalid JSON', raw: cleaned.slice(0, 500) },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, ...(parsed as object) });
}
