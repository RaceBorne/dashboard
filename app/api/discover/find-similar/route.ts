import { NextResponse } from 'next/server';
import { generateText, stepCountIs, tool } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { buildSystemPrompt } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay } from '@/lib/dashboard/repository';
import { isDataForSeoConnected, webSearchQuery } from '@/lib/integrations/dataforseo';
import type { DiscoveredCompany } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

/**
 * POST /api/discover/find-similar
 *
 * Body: { domain: string, playId?: string, seenDomains?: string[], limit?: number }
 *
 * Asks Claude to find N peer companies at the same tier / audience /
 * brand ethos as the reference company. "Tier" matters more than raw
 * category — Rapha's peer is Le Col, not generic 'cycling apparel'.
 *
 * Uses the company's cached enrichment (name, description, category,
 * HQ, employeeBand, keywords) as the anchor. Claude has web_search to
 * confirm peers that it isn't certain about. Returns the list of
 * peer domains so the client can batch-enrich them.
 */
interface Body {
  domain?: string;
  playId?: string;
  seenDomains?: string[];
  limit?: number;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const domain = (body.domain ?? '').trim().toLowerCase();
  const seenDomains = Array.isArray(body.seenDomains) ? body.seenDomains : [];
  const limit = Math.min(Math.max(body.limit ?? 5, 2), 10);

  if (!domain) {
    return NextResponse.json(
      { ok: false, error: 'domain required' },
      { status: 400 },
    );
  }
  const supabase = createSupabaseAdmin();

  // Reference company context. First try the legacy enrichment table
  // (rich profile), then fall back to the shortlist row (always
  // populated by auto-scan) so this endpoint works on freshly-scanned
  // companies that haven't been deeply enriched yet.
  let reference: DiscoveredCompany | null = null;
  type ShortlistRef = { name: string | null; industry: string | null; location: string | null; description: string | null };
  let shortlistRef: ShortlistRef | null = null;
  if (supabase) {
    const { data } = await supabase
      .from('dashboard_discovered_companies')
      .select('payload')
      .eq('domain', domain)
      .maybeSingle();
    reference = (data?.payload ?? null) as DiscoveredCompany | null;
    if (!reference && body.playId) {
      const { data: slRow } = await supabase
        .from('dashboard_play_shortlist')
        .select('name, industry, location, description')
        .eq('play_id', body.playId)
        .eq('domain', domain)
        .maybeSingle();
      shortlistRef = (slRow ?? null) as ShortlistRef | null;
    }
  }

  // Venture context when a playId is provided — helps Claude stay
  // on-target for the current brief rather than wandering off the
  // reference company's entire industry.
  let ventureBlock = '';
  if (body.playId && supabase) {
    try {
      const play = await getPlay(supabase, body.playId);
      if (play) {
        ventureBlock = [
          'VENTURE CONTEXT (we are prospecting for this):',
          '  Title: ' + play.title,
          play.strategyShort ? '  Strategy: ' + play.strategyShort : '',
          play.strategy?.targetPersona
            ? '  Target persona: ' + play.strategy.targetPersona
            : '',
        ]
          .filter(Boolean)
          .join('\n');
      }
    } catch {
      // Non-fatal: venture context is a bonus.
    }
  }

  const referenceBlock = reference
    ? [
        'REFERENCE COMPANY (we want more like this):',
        '  Domain: ' + domain,
        '  Name: ' + (reference.name ?? domain),
        reference.description ? '  Description: ' + reference.description : '',
        reference.category ? '  Category: ' + reference.category : '',
        reference.orgType ? '  Org type: ' + reference.orgType : '',
        reference.employeeBand
          ? '  Size band: ' + reference.employeeBand
          : '',
        reference.hq?.full ? '  HQ: ' + reference.hq.full : '',
        reference.keywords && reference.keywords.length > 0
          ? '  Keywords: ' + reference.keywords.join(', ')
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : shortlistRef
    ? [
        'REFERENCE COMPANY (we want more like this):',
        '  Domain: ' + domain,
        '  Name: ' + (shortlistRef.name ?? domain),
        shortlistRef.industry ? '  Industry: ' + shortlistRef.industry : '',
        shortlistRef.location ? '  Location: ' + shortlistRef.location : '',
        shortlistRef.description ? '  Notes: ' + shortlistRef.description : '',
      ]
        .filter(Boolean)
        .join('\n')
    : [
        'REFERENCE COMPANY:',
        '  Domain: ' + domain,
        '  (No cached enrichment — do a quick web_search to sketch out',
        '   the company before hunting peers.)',
      ].join('\n');

  const task =
    'Find ' +
    limit +
    ' PEER companies at the same tier / audience / brand ethos as the reference company. ' +
    'This is NOT "same industry" — tier and audience matter more than generic category. ' +
    'If the reference is Rapha (premium cycling apparel, boutique brand energy), valid peers ' +
    'are Le Col, Pas Normal Studios, Cafe du Cycliste, Castelli. NOT Halfords. NOT Evans Cycles. ' +
    'Match the operator\'s taste.' +
    '\n\nNever use em-dashes or en-dashes in any output. Use commas or semicolons.' +
    '\n\nProcess:' +
    '\n  1. Read the reference company carefully. What makes this brand who it is? Price tier,' +
    '\n     audience age and income, aesthetic, channel strategy, scale.' +
    '\n  2. Run web_search to confirm peers if you are not already certain.' +
    '\n  3. Output JSON only, no prose, no fences, no explanations outside the JSON:' +
    '\n  {' +
    '\n    "peers": [' +
    '\n      { "domain": "example.com", "name": "Example", "why": "one short sentence, why they are a peer" }' +
    '\n    ],' +
    '\n    "reasoning": "one sentence summarising the tier you targeted"' +
    '\n  }' +
    '\n\nHard rules:' +
    '\n  - Domains must be bare (no https://, no www.).' +
    '\n  - Do NOT return the reference company itself.' +
    '\n  - Do NOT return any domain already in the skipList below.' +
    '\n  - If you cannot find ' + limit + ', return fewer rather than filler.';

  const prompt = [
    ventureBlock,
    '',
    referenceBlock,
    '',
    'Skip list (already in the operator\'s results, do not re-suggest):',
    seenDomains.slice(0, 40).map((d) => '  ' + d).join('\n') || '  (none)',
  ]
    .filter((s) => s !== '')
    .join('\n');

  const system = await buildSystemPrompt({ voice: 'analyst', task });

  const tools = {
    web_search: tool({
      description:
        'Google the open web for peer brands, comparisons, listicles, or ' +
        'press coverage of the reference brand to confirm peers.',
      inputSchema: z.object({
        query: z.string().min(2),
        limit: z.number().int().min(1).max(15).optional(),
      }),
      execute: async ({ query, limit }) => {
        if (!isDataForSeoConnected()) {
          return { error: 'DataForSEO not configured' };
        }
        const { hits } = await webSearchQuery({
          query,
          limit: Math.min(limit ?? 10, 15),
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

  let text: string;
  try {
    const res = await generateText({
      model: gateway(MODEL),
      system,
      prompt,
      tools,
      stopWhen: stepCountIs(8),
    });
    text = res.text;
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
        tools,
        stopWhen: stepCountIs(8),
      });
      text = res.text;
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

  const parsed = parseJson(text);
  if (!parsed || !Array.isArray(parsed.peers)) {
    return NextResponse.json(
      { ok: false, error: 'Model returned no usable peers', raw: text },
      { status: 502 },
    );
  }

  const seen = new Set<string>([domain, ...seenDomains.map((d) => d.toLowerCase())]);
  const peers: Array<{ domain: string; name?: string; why?: string }> = [];
  for (const p of parsed.peers as unknown[]) {
    if (!p || typeof p !== 'object') continue;
    const po = p as Record<string, unknown>;
    const d = (typeof po.domain === 'string' ? po.domain : '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
    if (!d || !d.includes('.')) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    peers.push({
      domain: d,
      name: typeof po.name === 'string' ? po.name : undefined,
      why: typeof po.why === 'string' ? po.why : undefined,
    });
    if (peers.length >= limit) break;
  }

  // Peers are SUGGESTIONS only. We do NOT auto-add them to the play's
  // list. The user clicks Add to list (or Send to shortlist) per peer
  // in the Similar tab. To support that UX we look up which peer
  // domains already have a row for this play so the client can show
  // "Already in list" instead of an Add button.
  const peerDomains = peers.map((p) => p.domain.toLowerCase());
  const existingByDomain = new Map<string, { id: string; status: string | null }>();
  if (supabase && body.playId && peerDomains.length > 0) {
    const { data: existing } = await supabase
      .from('dashboard_play_shortlist')
      .select('id, domain, status')
      .eq('play_id', body.playId)
      .in('domain', peerDomains);
    for (const r of (existing ?? []) as Array<{ id: string; domain: string; status: string | null }>) {
      existingByDomain.set(r.domain.toLowerCase(), { id: r.id, status: r.status });
    }
  }

  const peersOut = peers.map((p) => {
    const existing = existingByDomain.get(p.domain.toLowerCase());
    return {
      domain: p.domain,
      name: p.name ?? p.domain,
      why: p.why ?? '',
      logoUrl: 'https://logo.clearbit.com/' + p.domain,
      rowId: existing?.id ?? null,
      status: existing?.status ?? null,
      alreadyInList: !!existing,
    };
  });

  return NextResponse.json({
    ok: true,
    peers: peersOut,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
  });
}

function parseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced
    ? fenced[1].trim()
    : (() => {
        const first = raw.indexOf('{');
        const last = raw.lastIndexOf('}');
        if (first >= 0 && last > first) return raw.slice(first, last + 1);
        return raw;
      })();
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
}
