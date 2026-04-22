import { NextResponse } from 'next/server';
import { gateway } from '@ai-sdk/gateway';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import type { DiscoverFilters } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/discover/ai-refine
 *
 * Body: { filters: DiscoverFilters, prompt: string }
 *
 * Uses a single `set_filters` tool to let Claude return a fully-normalised
 * DiscoverFilters shape given the current filters + a natural-language
 * instruction ("Drop London, add Leeds and Bristol, and give me 50-500 people
 * only").
 */
interface IncomingBody {
  filters: DiscoverFilters;
  prompt: string;
}

const FilterGroupSchema = z
  .object({
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
  })
  .partial();

const FiltersSchema = z
  .object({
    location: FilterGroupSchema.optional(),
    industry: FilterGroupSchema.optional(),
    keywords: FilterGroupSchema.optional(),
    companyName: FilterGroupSchema.optional(),
    companyType: FilterGroupSchema.optional(),
    similarTo: z.array(z.string()).optional(),
    sizeBands: z.array(z.string()).optional(),
    foundedYearMin: z.number().int().optional(),
    foundedYearMax: z.number().int().optional(),
    technologies: z.array(z.string()).optional(),
    savedOnly: z.boolean().optional(),
  })
  .partial();

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<IncomingBody>;
  const current = body.filters ?? {};
  const prompt = (body.prompt ?? '').trim();
  if (!prompt) {
    return NextResponse.json({ ok: false, error: 'prompt required' }, { status: 400 });
  }

  let captured: DiscoverFilters | null = null;

  const setFilters = tool({
    description:
      'Set the final Discover filter state. Include EVERY filter you want kept (existing + new) — this overwrites the previous state, so always merge rather than replace.',
    inputSchema: FiltersSchema,
    execute: async (input) => {
      captured = input as DiscoverFilters;
      return { ok: true };
    },
  });

  const system = [
    'You edit the filter state of a DataForSEO-backed company discovery UI used by Evari,',
    'a UK-based premium urban + e-cargo bike brand. Operators type natural-language prompts',
    'and you turn them into a rich, merged filter state that surfaces the right companies.',
    '',
    'Call the `set_filters` tool exactly once with the final, complete filter state.',
    '',
    'Reasoning principles:',
    '- MERGE with the current filters. Never drop a filter the user did not explicitly ask to remove.',
    '- Expand vague asks into MULTIPLE concrete include keywords and industry terms so the search',
    '  actually finds what the operator means. A single keyword rarely lands good results.',
    '    • "premium urban bike shops"  → industry: ["bicycle shops", "sporting goods stores"];',
    '      keywords: ["urban commuter", "e-cargo", "premium cycling", "boutique bike store"].',
    '    • "owners clubs for cyclists" → industry: ["associations", "membership organizations",',
    '      "sports clubs"]; keywords: ["cycling club", "bike owners", "rider community"].',
    '    • "private knee-surgery clinics" → industry: ["orthopedic clinics", "private healthcare",',
    '      "surgical practices"]; keywords: ["knee replacement", "orthopaedic surgeon", "private clinic"].',
    '- Adjectives ("boutique", "premium", "independent", "specialist") go into keywords, not industry.',
    '- Always add the country/region into location.include when the user mentions one',
    '  ("UK" / "United Kingdom", "USA" / "United States", etc.). Regional phrases like',
    '  "North West" should be added BOTH as-is and with the parent country.',
    '- When the user says "drop X" / "exclude X", move that value to the relevant `.exclude` list',
    '  (create one if needed) and remove it from `.include`.',
    '- Keep each include/exclude array tight: 2–6 specific strings. Prefer concrete over generic.',
    '',
    'Field reference:',
    '- include / exclude lists are case-insensitive substring matches.',
    '- `sizeBands` values ∈ ["1-10","11-50","51-200","201-500","501-1000","1001-5000","5000+"].',
    '  "small teams" → ["1-10","11-50"]. "mid-sized" → ["51-200","201-500"]. "enterprise" → ["1001-5000","5000+"].',
    '- `companyType.include` values ∈ ["corporation","club","nonprofit","practice","other"].',
    '- `similarTo` is a list of seed domains (lowercased, no protocol).',
    '- `savedOnly` → true only if the user explicitly asks for saved companies.',
  ].join('\n');

  const user = [
    'Current filters:',
    '```json',
    JSON.stringify(current, null, 2),
    '```',
    '',
    'Instruction:',
    prompt,
  ].join('\n');

  async function runOnce(modelId: 'gateway' | 'direct') {
    const model =
      modelId === 'gateway'
        ? gateway('anthropic/claude-sonnet-4-5')
        : anthropic('claude-sonnet-4-5');
    await generateText({
      model,
      system,
      prompt: user,
      tools: { set_filters: setFilters },
      toolChoice: 'required',
      stopWhen: stepCountIs(2),
    });
  }

  try {
    try {
      await runOnce('gateway');
    } catch (err) {
      if (!isRetryable(err)) throw err;
      await runOnce('direct');
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'AI refine failed' },
      { status: 500 },
    );
  }

  if (!captured) {
    return NextResponse.json({ ok: false, error: 'No filters returned' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, filters: captured });
}

function isRetryable(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /429|5\d\d|timeout|fetch failed|network|overloaded|rate limit/i.test(msg) ||
    /gateway/i.test(msg)
  );
}
