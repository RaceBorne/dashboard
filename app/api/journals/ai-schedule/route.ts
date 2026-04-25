import { NextResponse } from 'next/server';

import { buildSystemPrompt, generateTextWithFallback } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

interface ScheduleRequest {
  /** Lane label so the AI knows whether this is a CS+ build write-up
   *  (audience leans technical, weekend gear browsers) vs a general
   *  blog post. */
  laneLabel?: string;
  /** Optional article context — the AI may pick a slot based on
   *  topic (e.g. a launch piece skews to weekday morning). */
  articleTitle?: string;
  articleSummary?: string;
}

export interface ScheduleSuggestion {
  /** Full ISO timestamp (UTC) the user can pass straight to a
   *  PATCH /api/journals/[id] body. */
  iso: string;
  /** Short label for the pill, e.g. "Tuesday 9:00 AM". */
  label: string;
  /** One-sentence rationale shown beneath the label. */
  reasoning: string;
}

interface ScheduleResponse {
  ok: true;
  suggestions: ScheduleSuggestion[];
  /** Frequency hint banner shown above the pills. */
  frequencyHint: string;
}

/**
 * POST /api/journals/ai-schedule
 *
 * Returns three optimal send windows for an Evari blog article,
 * plus a frequency hint. Used by the Departure Lounge schedule
 * dialog to render one-click pills.
 *
 * The model is given the brand brief (via buildSystemPrompt's
 * 'evari' voice), the current UTC timestamp, the lane, and the
 * article context. It returns a strict JSON shape:
 *
 *   {
 *     "frequencyHint": "Aim for 1-2 articles per week …",
 *     "suggestions": [
 *       { "iso": "2026-04-28T08:00:00Z", "label": "Tuesday 9 AM",
 *         "reasoning": "Peak commute browsing for UK e-bike audience" },
 *       …
 *     ]
 *   }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as ScheduleRequest;
  const lane = body.laneLabel ?? 'Blogs';
  const title = (body.articleTitle ?? '').trim();
  const summary = (body.articleSummary ?? '').trim();

  const now = new Date();
  const nowIso = now.toISOString();
  // Easy reference for the model: today's day-of-week and an
  // explicit floor date so it doesn't suggest yesterday by accident.
  const today = now.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });

  const system = await buildSystemPrompt({
    voice: 'evari',
    task:
      "You are an editorial scheduler for Evari's Shopify blog. " +
      'Output a strict JSON object with this shape and nothing else: ' +
      '{ "frequencyHint": string, "suggestions": [' +
      '{ "iso": string, "label": string, "reasoning": string }, ' +
      '{ "iso": string, "label": string, "reasoning": string }, ' +
      '{ "iso": string, "label": string, "reasoning": string } ] }. ' +
      'No commentary, no markdown fences, no prefix.',
  });

  const promptLines: string[] = [];
  promptLines.push(`Now (Europe/London): ${today}`);
  promptLines.push(`Now (UTC ISO): ${nowIso}`);
  promptLines.push(`Lane: ${lane}`);
  if (title) promptLines.push(`Article title: ${title}`);
  if (summary) promptLines.push(`Article summary: ${summary}`);
  promptLines.push('');
  promptLines.push('Audience:');
  promptLines.push('  - UK consumer e-bike buyers and gear enthusiasts.');
  promptLines.push('  - Mostly visiting from desktop on weekday mornings, mobile in evenings, mix on weekends.');
  promptLines.push('');
  promptLines.push('Pick three send slots in the next 14 days that suit this article + audience. They should be different days/times so the user has real choice. Each slot:');
  promptLines.push('  - iso: full UTC ISO timestamp (e.g. 2026-04-29T08:00:00Z). Must be in the future, on or after the given Now.');
  promptLines.push('  - label: short human label like "Tuesday 9:00 AM" (London time).');
  promptLines.push('  - reasoning: one sentence on why this slot suits the audience or article.');
  promptLines.push('');
  promptLines.push('Also give a frequencyHint: a one-sentence cadence recommendation like "Aim for 1-2 long-form posts per week to stay top-of-feed without saturating subscribers."');
  promptLines.push('');
  promptLines.push('Output the JSON object only. No commentary, no fences.');

  let text: string;
  try {
    const out = await generateTextWithFallback({
      model: MODEL,
      system,
      prompt: promptLines.join('\n'),
      temperature: 0.5,
    });
    text = out.text;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'AI failed' },
      { status: 500 },
    );
  }

  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    console.error('[ai-schedule] JSON parse failed', err, stripped.slice(0, 300));
    return NextResponse.json(
      { ok: false, error: 'AI returned malformed JSON' },
      { status: 500 },
    );
  }
  const obj = parsed as Partial<ScheduleResponse>;
  const rawSuggestions = Array.isArray(obj.suggestions) ? obj.suggestions : [];
  // Validate + clamp every suggestion. Drop any whose iso is in the
  // past or unparseable. Cap at three.
  const suggestions: ScheduleSuggestion[] = rawSuggestions
    .map((s): ScheduleSuggestion | null => {
      if (!s || typeof s !== 'object') return null;
      const iso = String((s as { iso?: unknown }).iso ?? '');
      const label = String((s as { label?: unknown }).label ?? '');
      const reasoning = String((s as { reasoning?: unknown }).reasoning ?? '');
      const t = Date.parse(iso);
      if (!iso || Number.isNaN(t)) return null;
      if (t < Date.now()) return null;
      return { iso, label: label || formatLabel(new Date(t)), reasoning };
    })
    .filter((s): s is ScheduleSuggestion => s !== null)
    .slice(0, 3);

  const frequencyHint =
    typeof obj.frequencyHint === 'string' && obj.frequencyHint.trim().length > 0
      ? obj.frequencyHint.replace(/[—–]/g, ',')
      : 'Aim for 1 to 2 long-form posts per week to stay top-of-feed without saturating readers.';

  // If the model returned nothing usable, fall back to a sensible
  // hard-coded set so the dialog always has pills.
  const finalSuggestions =
    suggestions.length > 0 ? suggestions : defaultSuggestions();

  const res: ScheduleResponse = {
    ok: true,
    suggestions: finalSuggestions,
    frequencyHint,
  };
  return NextResponse.json(res);
}

function formatLabel(d: Date): string {
  return d.toLocaleString('en-GB', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Europe/London',
  });
}

/**
 * Fallback suggestions when the AI returns nothing usable. Three
 * sensible defaults for a UK consumer e-commerce audience: Tuesday
 * commute morning, Thursday lunch, Saturday weekend browse.
 */
function defaultSuggestions(): ScheduleSuggestion[] {
  const out: ScheduleSuggestion[] = [];
  const make = (daysAhead: number, hour: number, reasoning: string) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    out.push({
      iso: d.toISOString(),
      label: formatLabel(d),
      reasoning,
    });
  };
  // Find next Tuesday / Thursday / Saturday.
  const today = new Date().getDay();
  const next = (target: number) => (target - today + 7) % 7 || 7;
  make(next(2), 9, 'Peak weekday browsing, commute window for UK readers.');
  make(next(4), 13, 'Thursday lunch break, desktop traffic spike.');
  make(next(6), 10, 'Saturday morning lifestyle reading time.');
  return out;
}
