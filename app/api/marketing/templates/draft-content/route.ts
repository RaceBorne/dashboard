/**
 * AI draft content for the email designer. Walks the design's text
 * blocks (heading + text), passes them as context to the LLM along
 * with the user's prompt, and asks the model to return a JSON map of
 * { blockId: newHtml }. We then patch those into the design and
 * return the updated copy. Image / button / divider blocks are
 * preserved exactly.
 */

import { NextResponse } from 'next/server';
import { generateTextWithFallback } from '@/lib/ai/gateway';
import { getBrand } from '@/lib/marketing/brand';
import type { EmailBlock, EmailDesign } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { design?: EmailDesign; prompt?: string } | null;
  if (!body?.design || !body?.prompt) {
    return NextResponse.json({ ok: false, error: 'design + prompt required' }, { status: 400 });
  }
  const design = body.design;
  const prompt = body.prompt.trim().slice(0, 1000);
  if (!prompt) return NextResponse.json({ ok: false, error: 'prompt empty' }, { status: 400 });

  const brand = await getBrand();
  const editable = design.blocks.filter((b): b is Extract<EmailBlock, { type: 'heading' | 'text' | 'button' }> =>
    b.type === 'heading' || b.type === 'text' || b.type === 'button',
  );
  if (editable.length === 0) {
    return NextResponse.json({ ok: false, error: 'No editable text blocks in this design.' }, { status: 400 });
  }

  // Compact reference of the current text content for the model to rewrite.
  const reference = editable.map((b) => {
    if (b.type === 'button') return { id: b.id, kind: 'button', label: b.label };
    return { id: b.id, kind: b.type, html: b.html };
  });

  const system = `You write marketing email copy in the brand voice of ${brand.companyName ?? 'the company'}.
Rules:
- Output ONLY a JSON object. No prose, no markdown fences.
- Keys are block ids exactly as given. Values are the rewritten content.
- For 'heading' and 'text' blocks, value is the HTML body (you may use <strong>, <em>, <a href>, <br>, basic tags only).
- For 'button' blocks, value is a short call-to-action label (max 4 words).
- Preserve any merge tokens already in the source (e.g. {{firstName}}).
- Match the tone: warm, considered, direct. No exclamation points unless the source had them.
- Don't invent product claims, prices, dates, or commitments.`;

  const userPrompt = `Brief from the operator:
"""
${prompt}
"""

Current blocks (rewrite these):
${JSON.stringify(reference, null, 2)}

Reply with JSON only.`;

  let text = '';
  try {
    const result = await generateTextWithFallback({
      model: MODEL,
      system,
      prompt: userPrompt,
      temperature: 0.7,
    });
    text = result.text;
  } catch (err) {
    console.error('[mkt.templates.draft]', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'AI call failed' }, { status: 500 });
  }

  // Tolerate fenced output: extract first {...} block.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ ok: false, error: 'AI did not return JSON', raw: text }, { status: 502 });
  let updates: Record<string, string>;
  try { updates = JSON.parse(match[0]) as Record<string, string>; }
  catch { return NextResponse.json({ ok: false, error: 'AI JSON parse failed', raw: text }, { status: 502 }); }

  const next: EmailDesign = {
    ...design,
    blocks: design.blocks.map((b) => {
      const v = updates[b.id];
      if (typeof v !== 'string') return b;
      if (b.type === 'heading' || b.type === 'text') return { ...b, html: v };
      if (b.type === 'button') return { ...b, label: v };
      return b;
    }),
  };

  return NextResponse.json({ ok: true, design: next, updatedCount: Object.keys(updates).length });
}
