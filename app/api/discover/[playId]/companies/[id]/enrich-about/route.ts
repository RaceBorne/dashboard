import { NextResponse } from 'next/server';
import { generateText, stepCountIs, tool } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { buildSystemPrompt } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { isDataForSeoConnected, webSearchQuery } from '@/lib/integrations/dataforseo';

export const runtime = 'nodejs';
export const maxDuration = 90;

const MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

/**
 * POST /api/discover/[playId]/companies/[id]/enrich-about
 *
 * Lazy-runs a small Claude+web_search pass for one shortlist row to
 * write a 60-90 word factual synopsis (the "About" paragraph in the
 * Discovery drawer) plus a small structured block of company facts
 * (address, phone, employee range, org type).
 *
 * Idempotent: returns the cached row if about_text already exists,
 * unless ?regenerate=1 is supplied.
 */

interface AboutMeta {
  address: string | null;
  phone: string | null;
  employeeRange: string | null;
  orgType: string | null;
  generatedAt: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ playId: string; id: string }> },
) {
  const { playId, id } = await params;
  const url = new URL(req.url);
  const regenerate = url.searchParams.get('regenerate') === '1';

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });
  }

  const { data: row, error: rowErr } = await supabase
    .from('dashboard_play_shortlist')
    .select('id, domain, name, industry, location, description, about_text, about_meta')
    .eq('id', id)
    .eq('play_id', playId)
    .maybeSingle();

  if (rowErr || !row) {
    return NextResponse.json(
      { ok: false, error: rowErr?.message ?? 'Row not found' },
      { status: 404 },
    );
  }

  if (!regenerate && row.about_text) {
    return NextResponse.json({
      ok: true,
      cached: true,
      aboutText: row.about_text as string,
      aboutMeta: (row.about_meta ?? {}) as AboutMeta,
    });
  }

  const websiteUrl = 'https://' + row.domain;

  const task =
    'Write a short, factual 60-90 word company synopsis suitable for a ' +
    'sales operator scanning a list of prospects. 3 to 4 sentences, plain ' +
    'prose, no bullets, no headings, no markdown. Cover what the company ' +
    'does, what kind of organisation it is (operator, agency, manufacturer, ' +
    'club, etc.), roughly where it operates, and its scale. Skip any field ' +
    'you cannot speak to with confidence. Do NOT mention the reader, do NOT ' +
    'flatter or speculate. Never use em-dashes or en-dashes ' +
    'in any output. Use commas, semicolons, or full stops instead.' +
    '\n\nProcess:' +
    '\n  1. Use web_search to confirm the basic facts (a couple of queries are' +
    '\n     usually enough). Look for the company\'s own site, About page, or' +
    '\n     trusted directory listings.' +
    '\n  2. Output the synopsis FIRST as plain prose.' +
    '\n  3. After the synopsis, on a NEW LINE, emit the literal delimiter' +
    '\n     <<<META>>> followed by a single JSON object on the next line:' +
    '\n  {' +
    '\n    "address": "1 Example Street, London EC1A 1AA" | null,' +
    '\n    "phone": "+44 20 1234 5678" | null,' +
    '\n    "employeeRange": "11-50" | "51-200" | "201-500" | "501-1000" | "1000+" | null,' +
    '\n    "orgType": "company" | "agency" | "club" | "nonprofit" | "manufacturer" | "operator" | "other"' +
    '\n  }' +
    '\n\nRules for the JSON:' +
    '\n  - Return ONLY what you can infer from the search results with high confidence.' +
    '\n  - Use null for any field you do not have a confident answer for. NEVER fabricate.' +
    '\n  - Do NOT wrap the JSON in markdown code fences.';

  const prompt = [
    'COMPANY:',
    '  Name: ' + (row.name ?? row.domain),
    '  Domain: ' + row.domain,
    '  Website: ' + websiteUrl,
    row.industry ? '  Industry tag from CRM: ' + row.industry : '',
    row.location ? '  Known location hint: ' + row.location : '',
    row.description ? '  Why we shortlisted them: ' + row.description : '',
  ]
    .filter(Boolean)
    .join('\n');

  const system = await buildSystemPrompt({ voice: 'analyst', task });

  const tools = {
    web_search: tool({
      description:
        "Google the open web for the company's own site, About page, " +
        'directory listings, or press coverage to confirm the synopsis facts.',
      inputSchema: z.object({
        query: z.string().min(2),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ query, limit }) => {
        if (!isDataForSeoConnected()) {
          return { error: 'DataForSEO not configured' };
        }
        const { hits } = await webSearchQuery({
          query,
          limit: Math.min(limit ?? 6, 10),
        });
        return {
          query,
          hits: hits.map((h) => ({
            rank: h.rank,
            title: h.title,
            url: h.url,
            domain: h.domain,
            snippet: h.snippet,
          })),
        };
      },
    }),
  };

  let raw = '';
  try {
    const res = await generateText({
      model: gateway(MODEL),
      system,
      prompt,
      tools,
      stopWhen: stepCountIs(6),
    });
    raw = res.text;
  } catch (gatewayErr) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No model available. Set AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY.',
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
        tools,
        stopWhen: stepCountIs(6),
      });
      raw = res.text;
    } catch (anthropicErr) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Both gateway and direct Anthropic failed.',
          detail:
            anthropicErr instanceof Error
              ? anthropicErr.message
              : String(anthropicErr),
        },
        { status: 502 },
      );
    }
  }

  const { aboutText, aboutMeta } = parseAbout(raw);
  if (!aboutText) {
    return NextResponse.json(
      { ok: false, error: 'Model returned no usable synopsis', raw },
      { status: 502 },
    );
  }

  // Sweep the synopsis for stray dashes — model occasionally drifts
  // even with explicit instructions. Replace with a comma + space.
  const cleanedAbout = aboutText.replace(/\s*[—–]\s*/g, ', ');

  const meta: AboutMeta = {
    address: aboutMeta.address,
    phone: aboutMeta.phone,
    employeeRange: aboutMeta.employeeRange,
    orgType: aboutMeta.orgType,
    generatedAt: new Date().toISOString(),
  };

  await supabase
    .from('dashboard_play_shortlist')
    .update({ about_text: cleanedAbout, about_meta: meta })
    .eq('id', id)
    .eq('play_id', playId);

  return NextResponse.json({
    ok: true,
    cached: false,
    aboutText: cleanedAbout,
    aboutMeta: meta,
  });
}

function parseAbout(raw: string): {
  aboutText: string;
  aboutMeta: { address: string | null; phone: string | null; employeeRange: string | null; orgType: string | null };
} {
  if (!raw) {
    return { aboutText: '', aboutMeta: { address: null, phone: null, employeeRange: null, orgType: null } };
  }
  const delimIdx = raw.indexOf('<<<META>>>');
  const synopsis = (delimIdx >= 0 ? raw.slice(0, delimIdx) : raw).trim();
  let address: string | null = null;
  let phone: string | null = null;
  let employeeRange: string | null = null;
  let orgType: string | null = null;
  if (delimIdx >= 0) {
    const jsonRaw = raw.slice(delimIdx + '<<<META>>>'.length).trim();
    const cleaned = jsonRaw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      address = pickString(parsed.address);
      phone = pickString(parsed.phone);
      employeeRange = pickString(parsed.employeeRange);
      orgType = pickString(parsed.orgType);
    } catch {
      // Non-fatal: keep nulls.
    }
  }
  return {
    aboutText: synopsis,
    aboutMeta: { address, phone, employeeRange, orgType },
  };
}

function pickString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'unknown') return null;
  return trimmed;
}
