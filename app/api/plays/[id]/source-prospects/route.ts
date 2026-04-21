import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay, upsertLead } from '@/lib/dashboard/repository';
import {
  isDataForSeoConnected,
  searchBusinessListings,
  type BusinessListing,
} from '@/lib/integrations/dataforseo';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import type { Lead, Play } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/plays/[id]/source-prospects
 *
 * Fills the Play's funnel with prospect rows. Two paths:
 *
 *   1. Paste-list — POST { candidates: Partial<Lead>[] } to seed rows manually.
 *      Capped at 500. Useful for testing or when a human has a list already.
 *
 *   2. Auto-source (default when no candidates supplied) —
 *      Uses Claude to derive a DataForSEO business-listings search from the
 *      Play's scope + strategy, runs the search, converts each listing into a
 *      Lead row with tier='prospect'. If the AI gateway or DataForSEO isn't
 *      configured, falls back to returning a stub note so the UI can recover
 *      gracefully.
 */

interface SearchPlan {
  description: string;
  locationName: string;
  limit?: number;
}

interface CandidateBody {
  candidates?: Array<Partial<Lead>>;
  /** Optional override — if the user already knows what to search for. */
  search?: Partial<SearchPlan>;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }
  const play = await getPlay(supabase, id);
  if (!play) {
    return NextResponse.json({ ok: false, error: 'Play not found' }, { status: 404 });
  }
  if (!play.scope) {
    return NextResponse.json(
      { ok: false, error: 'Convert the strategy to a scope before sourcing prospects' },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as CandidateBody;
  const cap = 500;
  const nowIso = new Date().toISOString();
  const category = play.category ?? play.title;

  // --- Path 1: paste-list --------------------------------------------------
  if (body.candidates && Array.isArray(body.candidates) && body.candidates.length > 0) {
    const candidates = body.candidates.slice(0, cap);
    const inserted = await insertCandidates(supabase, candidates, play, category, nowIso);
    const saved = await stampScope(supabase, play, inserted, nowIso, 'paste');
    return NextResponse.json({
      ok: true,
      play: saved,
      inserted,
      agent: 'paste',
    });
  }

  // --- Path 2: auto-source via DataForSEO ---------------------------------
  if (!isDataForSeoConnected()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'DataForSEO is not configured. Set DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD, or paste a candidate list.',
      },
      { status: 500 },
    );
  }

  let plan: SearchPlan;
  if (body.search?.description && body.search?.locationName) {
    plan = {
      description: body.search.description,
      locationName: body.search.locationName,
      limit: body.search.limit ?? 50,
    };
  } else {
    if (!hasAIGatewayCredentials()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'AI gateway not configured. Send { search: { description, locationName } } to bypass AI planning.',
        },
        { status: 500 },
      );
    }
    try {
      plan = await derivePlan(play);
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: 'Search planner failed: ' + (err as Error).message },
        { status: 502 },
      );
    }
  }

  let listings: BusinessListing[] = [];
  let cost = 0;
  try {
    const res = await searchBusinessListings({
      description: plan.description,
      locationName: plan.locationName,
      limit: Math.min(plan.limit ?? 50, cap),
    });
    listings = res.listings;
    cost = res.cost;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'DataForSEO call failed: ' + (err as Error).message },
      { status: 502 },
    );
  }

  const candidates: Array<Partial<Lead>> = listings.map((l) =>
    listingToLead(l, play, category),
  );
  const inserted = await insertCandidates(supabase, candidates, play, category, nowIso);
  const saved = await stampScope(supabase, play, inserted, nowIso, 'dataforseo', {
    query: plan,
    cost,
    found: listings.length,
  });

  return NextResponse.json({
    ok: true,
    play: saved,
    inserted,
    found: listings.length,
    agent: 'dataforseo',
    query: plan,
    costUsd: cost,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function derivePlan(play: Play): Promise<SearchPlan> {
  const prompt = [
    'You are translating a marketing Play into a DataForSEO Business Listings search.',
    '',
    'Play title: ' + play.title,
    'Category: ' + (play.category ?? play.title),
    'Strategy: ' + JSON.stringify(play.strategy ?? {}, null, 2),
    'Scope: ' + JSON.stringify(play.scope ?? {}, null, 2),
    '',
    'Emit a single JSON object with exactly:',
    '{',
    '  "description": string,    // keyword query in the tone of a Google search',
    '  "locationName": string,   // DataForSEO location string (e.g. "United Kingdom")',
    '  "limit": number           // how many to fetch (1-200, default 50)',
    '}',
    '',
    'Rules:',
    '- The description should be concrete and geographic where possible.',
    '- Prefer the most specific location that still returns a useful pool.',
    '- If the Play is UK-focused, use "United Kingdom" unless a city is implied.',
    '- Return raw JSON only — no prose, no markdown fences.',
  ].join('\n');

  const markdown = await generateBriefing({
    task: 'source-prospects-plan',
    voice: 'analyst',
    prompt,
  });
  const cleaned = markdown
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const description = typeof parsed.description === 'string' ? parsed.description : '';
  const locationName =
    typeof parsed.locationName === 'string' ? parsed.locationName : 'United Kingdom';
  const limit =
    typeof parsed.limit === 'number' && parsed.limit > 0 && parsed.limit < 500
      ? Math.floor(parsed.limit)
      : 50;
  if (!description) {
    throw new Error('AI planner returned empty description');
  }
  return { description, locationName, limit };
}

function listingToLead(
  l: BusinessListing,
  play: Play,
  category: string,
): Partial<Lead> {
  const slug = slugify(l.title) || Math.random().toString(36).slice(2, 10);
  const id = 'prospect-' + (play.id + '-' + slug).slice(0, 80);
  const domain = l.domain || deriveDomain(l.url);
  const inferredEmail = inferEmail(domain);
  return {
    id,
    fullName: l.title,
    companyName: l.title,
    companyUrl: l.url,
    address: l.address,
    phone: l.phone,
    email: inferredEmail ?? '',
    emailInferred: Boolean(inferredEmail),
    sourceDetail:
      'DataForSEO: ' +
      (l.category ?? 'business listings') +
      (l.address ? ' — ' + l.address : ''),
    category,
    playId: play.id,
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function deriveDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url.startsWith('http') ? url : 'https://' + url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function inferEmail(domain: string | undefined): string | undefined {
  if (!domain) return undefined;
  // Low-confidence first-touch inference. The UI marks these as inferred so
  // the operator knows to verify before sending.
  return 'info@' + domain;
}

async function insertCandidates(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  candidates: Array<Partial<Lead>>,
  play: Play,
  category: string,
  nowIso: string,
): Promise<number> {
  let inserted = 0;
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    const lead: Lead = {
      id: c.id ?? 'prospect-' + Math.random().toString(36).slice(2, 12),
      fullName: (c.fullName ?? '').toString().trim() || 'Unknown contact',
      email: (c.email ?? '').toString().trim(),
      phone: c.phone,
      companyName: c.companyName,
      companyUrl: c.companyUrl,
      jobTitle: c.jobTitle,
      linkedinUrl: c.linkedinUrl,
      address: c.address,
      emailInferred: c.emailInferred === true,
      relatedContacts: c.relatedContacts,
      source: 'outreach_agent',
      sourceCategory: 'outreach',
      sourceDetail: c.sourceDetail ?? 'Play: ' + play.title,
      stage: 'new',
      intent: 'unknown',
      firstSeenAt: nowIso,
      lastTouchAt: nowIso,
      tags: [],
      activity: [],
      tier: 'prospect',
      category: c.category ?? category,
      playId: play.id,
      prospectStatus: 'pending',
    };
    const out = await upsertLead(supabase, lead);
    if (out) inserted += 1;
  }
  return inserted;
}

async function stampScope(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  play: Play,
  inserted: number,
  nowIso: string,
  agent: 'paste' | 'dataforseo',
  meta?: Record<string, unknown>,
): Promise<Play> {
  const category = play.category ?? play.title;
  const nextScope = {
    ...(play.scope ?? { summary: '', bullets: [], updatedAt: nowIso }),
    sourcedAt: nowIso,
    sourcedCount: (play.scope?.sourcedCount ?? 0) + inserted,
    updatedAt: nowIso,
  };
  const summary =
    inserted > 0
      ? 'Source Prospects (' +
        agent +
        '): ' +
        inserted +
        ' row(s) added to funnel "' +
        category +
        '"'
      : 'Source Prospects (' + agent + ') ran — no rows added';
  const next: Play = {
    ...play,
    scope: nextScope,
    updatedAt: nowIso,
    activity: [
      ...play.activity,
      {
        id: 'act-' + Date.now(),
        at: nowIso,
        type: 'note',
        summary,
      },
    ],
  };
  void meta; // reserved for future activity-meta persistence
  await supabase.from('dashboard_plays').update({ payload: next }).eq('id', next.id);
  return next;
}
