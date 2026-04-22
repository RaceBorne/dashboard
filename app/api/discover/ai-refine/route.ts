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
      'Replace the Discover filter state with the provided values. Always include ALL filters you want to end up with — this overwrites the previous state.',
    inputSchema: FiltersSchema,
    execute: async (input) => {
      captured = input as DiscoverFilters;
      return { ok: true };
    },
  });

  const system = [
    'You edit the filter state of an Apollo-style company discovery UI.',
    'You receive the current filter JSON plus a natural-language instruction.',
    'Call the `set_filters` tool exactly once with the final, complete filter state.',
    'Rules:',
    '- Preserve any existing filters the user did not ask to change.',
    '- Lists of include / exclude strings are case-insensitive substrings (locations like "London", industries like "Sports Teams").',
    '- `sizeBands` values are human-readable bands from ["1-10","11-50","51-200","201-500","501-1000","1001-5000","5000+"].',
    '- `companyType.include` values are from ["corporation","club","nonprofit","practice","other"].',
    '- `similarTo` is a list of seed domains (lowercased, no protocol).',
    '- Only set fields you want to keep. Leave empty arrays out.',
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
