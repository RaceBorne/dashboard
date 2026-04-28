/**
 * POST /api/ai/draft
 *
 * Body:
 *   {
 *     field: 'subject' | 'body' | 'list_name' | 'list_description' | 'lead_note' | 'free';
 *     mode: 'draft' | 'rewrite-warmer' | 'shorten' | 'rewrite-brand' | 'expand';
 *     value?: string;       // current value the user wants rewritten
 *     context?: string;     // free-form context (audience, product, etc)
 *     variants?: number;    // 1 (default) or 2-5 for "give me options"
 *   }
 *
 * Returns:
 *   { ok: true, suggestions: string[] }
 *
 * Uses the existing buildSystemPrompt('evari' voice) so every draft
 * is grounded in the brand brief + evari-copy skill.
 */

import { NextResponse } from 'next/server';

import { buildSystemPrompt, generateTextWithFallback, hasAIGatewayCredentials } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FIELD_HINTS: Record<string, string> = {
  subject: 'You are writing a single email subject line. Hard cap 80 characters. No em-dashes or en-dashes. Concrete over clever. Sentence case. No emoji unless explicitly asked.',
  body: 'You are writing the body of a marketing or outreach email. No em-dashes or en-dashes. Short paragraphs. Lead with what the reader gets. Sound like Craig at his desk, not a brand campaign.',
  list_name: 'You are naming a contact list. Three to seven words, sentence case. Describe who is in the list, not the campaign goal.',
  list_description: 'You are writing a one-sentence description of a contact list. Plain prose, no bullets, ends with a full stop.',
  lead_note: 'You are writing a private CRM note about a lead, for the founder, in the founder\'s voice. Concise, factual, no marketing voice.',
  free: 'Write the requested copy.',
};

const MODE_HINTS: Record<string, string> = {
  draft: 'Draft this from scratch.',
  'rewrite-warmer': 'Rewrite the value below to sound warmer and more human, while staying short.',
  'shorten': 'Rewrite the value below to be noticeably shorter while keeping the meaning.',
  'rewrite-brand': 'Rewrite the value below in the Evari voice, true to the brand brief.',
  'expand': 'Expand the value below into a fuller version, keeping intent.',
};

function clampVariants(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, Math.floor(n)));
}

function parseSuggestions(raw: string, expected: number): string[] {
  const text = raw.trim();
  // Strip code fences if any.
  const stripped = text.replace(/^```(?:json|text)?/i, '').replace(/```$/i, '').trim();

  // Try a JSON array first.
  if (stripped.startsWith('[')) {
    try {
      const arr = JSON.parse(stripped);
      if (Array.isArray(arr)) return arr.map((x) => String(x)).slice(0, expected);
    } catch { /* fall through */ }
  }

  // Numbered list ("1. foo", "2. bar")
  const numbered = stripped.split(/\n+/).map((l) => l.replace(/^\s*\d+[).]\s*/, '').trim()).filter(Boolean);
  if (expected > 1 && numbered.length >= expected) return numbered.slice(0, expected);
  // Fall back to single suggestion.
  return [stripped];
}

export async function POST(req: Request) {
  if (!hasAIGatewayCredentials()) {
    return NextResponse.json({ ok: false, error: 'AI not configured' }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as {
    field?: string; mode?: string; value?: string; context?: string; variants?: number;
  } | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });

  const field = typeof body.field === 'string' && FIELD_HINTS[body.field] ? body.field : 'free';
  const mode = typeof body.mode === 'string' && MODE_HINTS[body.mode] ? body.mode : 'draft';
  const value = typeof body.value === 'string' ? body.value : '';
  const context = typeof body.context === 'string' ? body.context : '';
  const variants = clampVariants(body.variants);

  const system = await buildSystemPrompt({
    voice: 'evari',
    task: `Drafting ${field.replace('_', ' ')} copy for a marketing surface inside the Evari Dashboard. Mode: ${mode}.`,
  });

  const lines: string[] = [];
  lines.push(FIELD_HINTS[field]);
  lines.push(MODE_HINTS[mode]);
  if (context) lines.push(`\nCONTEXT (audience, product, situation):\n${context}`);
  if (value && (mode === 'rewrite-warmer' || mode === 'shorten' || mode === 'rewrite-brand' || mode === 'expand')) {
    lines.push(`\nVALUE TO REWRITE:\n${value}`);
  } else if (value) {
    lines.push(`\nUSER NOTES:\n${value}`);
  }
  if (variants > 1) {
    lines.push(`\nReturn ${variants} distinct options as a JSON array of strings, no other text. No keys, just the array.`);
  } else {
    lines.push('\nReturn only the suggested copy. No commentary, no quotes wrapping it, no markdown.');
  }

  const { text } = await generateTextWithFallback({
    model: process.env.AI_DRAFT_MODEL || 'anthropic/claude-haiku-4-5',
    system,
    prompt: lines.join('\n'),
    temperature: 0.7,
  });

  const suggestions = parseSuggestions(text, variants);
  return NextResponse.json({ ok: true, suggestions });
}
