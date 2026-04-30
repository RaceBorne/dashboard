import { NextResponse } from 'next/server';
import { generateText, stepCountIs, tool } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { buildSystemPrompt } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay } from '@/lib/dashboard/repository';
import { isDataForSeoConnected, webSearchQuery } from '@/lib/integrations/dataforseo';
import { lookupPeers, recordPeers } from '@/lib/brand/peerBrain';
import { getOrCreateBrief } from '@/lib/marketing/strategy';
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
  const url = new URL(req.url);
  const verify = url.searchParams.get('verify') === '1';
  const body = (await req.json().catch(() => ({}))) as Body;
  const domain = (body.domain ?? '').trim().toLowerCase();
  const seenDomains = Array.isArray(body.seenDomains) ? body.seenDomains : [];
  // Default 6 instead of 5; the new fast path handles this in one
  // round-trip so a slightly bigger ask costs almost nothing extra.
  const limit = Math.min(Math.max(body.limit ?? 6, 2), 10);

  if (!domain) {
    return NextResponse.json(
      { ok: false, error: 'domain required' },
      { status: 400 },
    );
  }

  // Pull the no-go list: global blocks PLUS per-play blocks for the
  // current venture. A domain blocked elsewhere stays available here
  // unless it was blocked globally or specifically for this play.
  // Also pull the stored reason for each so we can feed the most
  // recent rejections to the AI as negative examples ('don't suggest
  // things like these'). Helps the agent learn the operator's taste.
  const sbForBlocks = createSupabaseAdmin();
  let blockedDomains: string[] = [];
  let recentRejections: Array<{ domain: string; reason: string | null }> = [];
  if (sbForBlocks) {
    const { data } = await sbForBlocks
      .from('dashboard_blocked_domains')
      .select('domain, play_id, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(80);
    const rows = (data ?? []) as Array<{ domain: string; play_id: string | null; reason: string | null; created_at: string }>;
    const relevant = rows.filter((r) => r.play_id === null || r.play_id === body.playId);
    blockedDomains = relevant.map((r) => r.domain.toLowerCase());
    // Keep only entries that have a reason worth surfacing (the
    // generic 'Not relevant' default carries no signal). Take the
    // 20 most recent for the prompt.
    recentRejections = relevant
      .filter((r) => r.reason && r.reason.trim().length > 0 && !/^Not relevant from Similar/i.test(r.reason))
      .slice(0, 20)
      .map((r) => ({ domain: r.domain, reason: r.reason }));
  }
  const skipDomains = [...seenDomains, ...blockedDomains];

  // Peer Brain shortcut. If we have at least 5 peers in the brain
  // for this reference at confidence >= 0.6, return them in ~10ms
  // and skip the AI call entirely. Verify mode bypasses this so the
  // user can re-research with web search on demand.
  if (!verify) {
    const cached = await lookupPeers(domain, {
      limit: limit,
      skipDomains,
      minConfidence: 0.6,
    });
    if (cached.length >= 5) {
      const supabaseEarly = createSupabaseAdmin();
      const peersOut = await mapPeersWithListStatus(supabaseEarly, body.playId, cached.map((p) => ({
        domain: p.domain,
        name: p.name ?? p.domain,
        why: p.why ?? '',
        logoUrl: 'https://logo.clearbit.com/' + p.domain,
      })));
      return NextResponse.json({
        ok: true,
        peers: peersOut,
        reasoning: 'Peers from the brand brain (' + cached.length + ' cached, no AI call needed).',
        source: 'brain',
      });
    }
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

  // Venture context when a playId is provided. We pull both the play
  // (for title/strategy) and the strategy brief (for industries,
  // audience, geographies) so the model knows the actual prospecting
  // category, not just a vague description.
  let ventureBlock = '';
  if (body.playId && supabase) {
    try {
      const [play, brief] = await Promise.all([
        getPlay(supabase, body.playId),
        getOrCreateBrief(body.playId).catch(() => null),
      ]);
      if (play) {
        const lines = [
          'VENTURE CONTEXT (we are prospecting for this; PEERS MUST FIT THIS BRIEF):',
          '  Title: ' + play.title,
        ];
        if (play.strategyShort) lines.push('  Strategy: ' + play.strategyShort);
        if (play.strategy?.targetPersona) lines.push('  Target persona: ' + play.strategy.targetPersona);
        if (brief?.industries && brief.industries.length > 0) {
          lines.push('  Target industries (peers MUST be in one of these): ' + brief.industries.join(', '));
        }
        if (brief?.targetAudience && brief.targetAudience.length > 0) {
          lines.push('  Target audience: ' + brief.targetAudience.join(', '));
        }
        if (brief?.geographies && brief.geographies.length > 0) {
          lines.push('  Target geographies: ' + brief.geographies.join(', '));
        }
        if (brief?.idealCustomer) {
          lines.push('  Ideal customer: ' + brief.idealCustomer);
        }
        ventureBlock = lines.join('\n');
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
    'Find up to ' + limit + ' PEER companies that are TRUE peers of the reference brand. ' +
    'A true peer matches on THREE axes simultaneously: vertical (specific industry / category), ' +
    'audience (who they serve), and format (how they deliver value). Missing any one axis disqualifies ' +
    'the candidate.' +
    '\n\nNever use em-dashes or en-dashes. Use commas, semicolons, or full stops.' +
    '\n\nWORKED EXAMPLES of what a true peer looks like:' +
    '\n  Reference: Auto Vivendi (UK supercar members club).' +
    '\n    GOOD peers: Pistonheads Members, Auto Mobili, Curated Tracks, Ferrari Owners Club UK,' +
    '\n      Goodwood Road Racing Club. (All: car-focused + members club + UK-ish wealthy enthusiasts).' +
    '\n    BAD peers: Soho House (wrong vertical, just shares "members club" format).' +
    '\n    BAD peers: Quintessentially (wrong vertical, just shares "luxury services" tier).' +
    '\n    BAD peers: Aston Martin (wrong format, manufacturer not club).' +
    '\n  Reference: Rapha (premium cycling apparel, boutique brand).' +
    '\n    GOOD peers: Le Col, Pas Normal Studios, Cafe du Cycliste, Castelli, MAAP.' +
    '\n    BAD peers: Halfords (wrong tier), Evans Cycles (wrong tier), Lululemon (wrong vertical).' +
    '\n  Reference: Workham Hotels (London serviced apartments operator).' +
    '\n    GOOD peers: Cheval Collection, SACO Apartments, Native Places, Locke Hotels, edyn.' +
    '\n    BAD peers: The Savoy (wrong format, hotel not serviced apt), Airbnb (wrong format/scale),' +
    '\n      WeWork (wrong vertical).' +
    '\n\nProcess:' +
    '\n  1. ANALYSE the reference. In your head, complete these three sentences:' +
    '\n       - Vertical: "This is a ___" (be specific: "supercar members club", not "luxury experience")' +
    '\n       - Audience: "It serves ___" (be specific: "wealthy car enthusiasts", not "wealthy people")' +
    '\n       - Format: "It delivers value via ___" (e.g. "members-only access to track days and supercars")' +
    '\n  2. CHECK against the venture brief above. Peers MUST also align with the operator\'s target' +
    '\n     industries / audience / geography. If the brief says "supercar clubs" do NOT return generic' +
    '\n     luxury venues, even if they share an audience.' +
    (verify
      ? '\n  3. Run web_search to confirm peers if you are not already certain.'
      : '\n  3. Answer from your own training knowledge. Do NOT call any tools. Speed matters.' +
        '\n     If you genuinely do not know enough close peers, RETURN FEWER. Filler hurts.') +
    '\n  4. For each peer, in the "why" field, name which axis is the strongest match (vertical /' +
    '\n     audience / format) and one specific reason. e.g. "Vertical: same supercar club model,' +
    '\n     UK-based with similar membership tier."' +
    '\n  5. Output JSON only, no prose, no fences, no explanations outside the JSON:' +
    '\n  {' +
    '\n    "peers": [' +
    '\n      { "domain": "example.com", "name": "Example", "why": "one short sentence" }' +
    '\n    ],' +
    '\n    "reasoning": "one sentence: vertical + audience + format I anchored on"' +
    '\n  }' +
    '\n\nHARD RULES:' +
    '\n  - Domains must be bare (no https://, no www.).' +
    '\n  - Do NOT return the reference company itself.' +
    '\n  - Do NOT return any domain already in the skipList below.' +
    '\n  - DO NOT return peers that share only ONE axis. A "members club" alone is not enough if the' +
    '\n    reference is a "supercar club". The vertical must match.' +
    '\n  - DO NOT default to the most famous brand in the broader category just because you know it.' +
    '\n  - If you cannot find ' + limit + ' peers that pass all three checks, RETURN FEWER. Quality over' +
    '\n    quantity. 3 great peers beats 8 generic ones.';

  const rejectionBlock = recentRejections.length > 0
    ? [
        'OPERATOR HAS REJECTED these previously for this venture. Do NOT suggest brands that fit the same pattern, even if they are not on the skip list:',
        ...recentRejections.map((r) => '  - ' + r.domain + (r.reason ? ' — ' + r.reason : '')),
        '',
        'When you pick peers, actively avoid the axes that got rejected above. If the operator rejected something for being a generic members club, do not suggest other generic members clubs.',
      ].join('\n')
    : '';

  const prompt = [
    ventureBlock,
    '',
    referenceBlock,
    '',
    rejectionBlock,
    '',
    'Skip list (already in the operator\'s results or blocked, do not re-suggest):',
    skipDomains.slice(0, 60).map((d) => '  ' + d).join('\n') || '  (none)',
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

  // Default path is FAST: no tools, single round trip. ~2-4 seconds.
  // Verify path uses web_search and a wider step budget. ~15-30s.
  const callTools = verify ? tools : undefined;
  const stepCap = verify ? 8 : 1;

  let text: string;
  try {
    const res = await generateText({
      model: gateway(MODEL),
      system,
      prompt,
      tools: callTools,
      stopWhen: stepCountIs(stepCap),
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
        tools: callTools,
        stopWhen: stepCountIs(stepCap),
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

  const seen = new Set<string>([domain, ...skipDomains.map((d) => d.toLowerCase())]);
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

  // Write the AI's picks back to the brain so the next lookup for
  // this reference brand is instant. Confidence depends on whether
  // we used web verification.
  await recordPeers(
    domain,
    peers.map((p) => ({ domain: p.domain, name: p.name ?? null, why: p.why ?? null })),
    {
      source: verify ? 'verified' : 'ai',
      confidence: verify ? 0.7 : 0.5,
    },
  );

  const peersOut = await mapPeersWithListStatus(
    supabase,
    body.playId,
    peers.map((p) => ({
      domain: p.domain,
      name: p.name ?? p.domain,
      why: p.why ?? '',
      logoUrl: 'https://logo.clearbit.com/' + p.domain,
    })),
  );

  return NextResponse.json({
    ok: true,
    peers: peersOut,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    source: verify ? 'ai+web' : 'ai',
  });
}

/**
 * For each peer suggestion, look up whether it already has a row in
 * dashboard_play_shortlist for the given play. The client uses this
 * to render "Add to list" vs "Already in list" per peer.
 */
async function mapPeersWithListStatus(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  playId: string | undefined,
  peers: Array<{ domain: string; name: string; why: string; logoUrl: string }>,
): Promise<Array<{
  domain: string;
  name: string;
  why: string;
  logoUrl: string;
  rowId: string | null;
  status: string | null;
  alreadyInList: boolean;
}>> {
  if (!supabase || !playId || peers.length === 0) {
    return peers.map((p) => ({ ...p, rowId: null, status: null, alreadyInList: false }));
  }
  const peerDomains = peers.map((p) => p.domain.toLowerCase());
  const { data: existing } = await supabase
    .from('dashboard_play_shortlist')
    .select('id, domain, status')
    .eq('play_id', playId)
    .in('domain', peerDomains);
  const byDomain = new Map<string, { id: string; status: string | null }>();
  for (const r of (existing ?? []) as Array<{ id: string; domain: string; status: string | null }>) {
    byDomain.set(r.domain.toLowerCase(), { id: r.id, status: r.status });
  }
  return peers.map((p) => {
    const ex = byDomain.get(p.domain.toLowerCase());
    return {
      ...p,
      rowId: ex?.id ?? null,
      status: ex?.status ?? null,
      alreadyInList: !!ex,
    };
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
