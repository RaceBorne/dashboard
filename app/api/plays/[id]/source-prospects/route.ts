import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay, upsertLead } from '@/lib/dashboard/repository';
import {
  isDataForSeoConnected,
  searchBusinessListings,
  type BusinessListing,
} from '@/lib/integrations/dataforseo';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import type { Lead, Play, PlaySourceRun } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/plays/[id]/source-prospects
 *
 * Streams Server-Sent Events (SSE) so the UI can show step-by-step progress
 * while the sourcing agent runs. Each event is a JSON object on a single
 * `data:` line.
 *
 * Phases emitted (in order):
 *   planning           — asking Claude to derive a DataForSEO search plan
 *   plan-ready         — plan decided (includes { description, locationName, limit })
 *   searching          — DataForSEO call in flight
 *   search-done        — DataForSEO returned (includes { found, costUsd })
 *   inserting          — writing Lead rows to Supabase (includes { total })
 *   inserted-progress  — progress tick (includes { done, total })
 *   done               — final success (includes { play, inserted, found, costUsd })
 *   error              — terminal failure (includes { message })
 *
 * Body: `{ candidates?: Lead[], search?: { description, locationName, limit } }`
 *  - If `candidates` is provided the route skips planning + DataForSEO and just
 *    inserts the pasted rows.
 *  - If `search` is provided it overrides the AI planner.
 */

interface SearchPlan {
  description: string;
  locationName: string;
  limit?: number;
}

interface CandidateBody {
  candidates?: Array<Partial<Lead>>;
  search?: Partial<SearchPlan>;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(event: Record<string, unknown>): void {
        controller.enqueue(
          encoder.encode('data: ' + JSON.stringify(event) + '\n\n'),
        );
      }
      function fail(message: string, status: number = 500): void {
        emit({ phase: 'error', message, status });
        controller.close();
      }

      const supabase = createSupabaseAdmin();
      if (!supabase) {
        fail('Supabase admin client unavailable');
        return;
      }
      const play = await getPlay(supabase, id);
      if (!play) {
        fail('Play not found', 404);
        return;
      }
      if (!play.scope) {
        fail(
          'Convert the strategy to a scope before sourcing prospects',
          400,
        );
        return;
      }

      let body: CandidateBody = {};
      try {
        body = (await req.json()) as CandidateBody;
      } catch {
        // empty body is fine — auto-source path
      }

      const cap = 500;
      const nowIso = new Date().toISOString();
      const category = play.category ?? play.title;

      // ---------------- Paste-list path ----------------------------------
      if (
        body.candidates &&
        Array.isArray(body.candidates) &&
        body.candidates.length > 0
      ) {
        const candidates = body.candidates.slice(0, cap);
        emit({
          phase: 'inserting',
          message: 'Inserting ' + candidates.length + ' pasted candidate(s)…',
          total: candidates.length,
        });
        const inserted = await insertCandidates(
          supabase,
          candidates,
          play,
          category,
          nowIso,
          (done, total) =>
            emit({ phase: 'inserted-progress', done, total }),
        );
        const run: PlaySourceRun = {
          at: nowIso,
          agent: 'paste',
          inserted,
          durationMs: Date.now() - startedAt,
        };
        const saved = await stampRun(supabase, play, run);
        emit({ phase: 'done', play: saved, inserted, agent: 'paste' });
        controller.close();
        return;
      }

      // ---------------- Auto-source path ---------------------------------
      if (!isDataForSeoConnected()) {
        const run: PlaySourceRun = {
          at: nowIso,
          agent: 'dataforseo',
          inserted: 0,
          error: 'DataForSEO not configured',
          durationMs: Date.now() - startedAt,
        };
        await stampRun(supabase, play, run);
        fail(
          'DataForSEO is not configured. Set DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD, or paste a candidate list.',
        );
        return;
      }

      let plan: SearchPlan;
      if (body.search?.description && body.search?.locationName) {
        plan = {
          description: body.search.description,
          locationName: body.search.locationName,
          limit: body.search.limit ?? 50,
        };
        emit({
          phase: 'plan-ready',
          message: 'Using operator-supplied search plan',
          plan,
        });
      } else {
        if (!hasAIGatewayCredentials()) {
          const run: PlaySourceRun = {
            at: nowIso,
            agent: 'dataforseo',
            inserted: 0,
            error: 'AI gateway not configured',
            durationMs: Date.now() - startedAt,
          };
          await stampRun(supabase, play, run);
          fail(
            'AI gateway not configured. Send { search: { description, locationName } } to bypass AI planning.',
          );
          return;
        }
        emit({
          phase: 'planning',
          message: 'Asking Claude to derive a search plan from your scope…',
        });
        try {
          plan = await derivePlan(play);
        } catch (err) {
          const msg = (err as Error).message;
          const run: PlaySourceRun = {
            at: nowIso,
            agent: 'dataforseo',
            inserted: 0,
            error: 'Search planner failed: ' + msg,
            durationMs: Date.now() - startedAt,
          };
          await stampRun(supabase, play, run);
          fail('Search planner failed: ' + msg);
          return;
        }
        emit({
          phase: 'plan-ready',
          message:
            'Plan: "' + plan.description + '" in ' + plan.locationName,
          plan,
        });
      }

      emit({
        phase: 'searching',
        message: 'Calling DataForSEO business listings…',
      });
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
        const msg = (err as Error).message;
        const run: PlaySourceRun = {
          at: nowIso,
          agent: 'dataforseo',
          description: plan.description,
          locationName: plan.locationName,
          inserted: 0,
          error: 'DataForSEO call failed: ' + msg,
          durationMs: Date.now() - startedAt,
        };
        await stampRun(supabase, play, run);
        fail('DataForSEO call failed: ' + msg, 502);
        return;
      }
      emit({
        phase: 'search-done',
        message:
          'Found ' + listings.length + ' listing(s). Cost $' + cost.toFixed(3),
        found: listings.length,
        costUsd: cost,
      });

      const candidates: Array<Partial<Lead>> = listings.map((l) =>
        listingToLead(l, play, category),
      );
      emit({
        phase: 'inserting',
        message: 'Writing ' + candidates.length + ' prospect row(s) to the funnel…',
        total: candidates.length,
      });
      const inserted = await insertCandidates(
        supabase,
        candidates,
        play,
        category,
        nowIso,
        (done, total) =>
          emit({ phase: 'inserted-progress', done, total }),
      );

      const run: PlaySourceRun = {
        at: nowIso,
        agent: 'dataforseo',
        description: plan.description,
        locationName: plan.locationName,
        found: listings.length,
        inserted,
        costUsd: cost,
        durationMs: Date.now() - startedAt,
      };
      const saved = await stampRun(supabase, play, run);
      emit({
        phase: 'done',
        play: saved,
        inserted,
        found: listings.length,
        agent: 'dataforseo',
        plan,
        costUsd: cost,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
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
  return 'info@' + domain;
}

async function insertCandidates(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  candidates: Array<Partial<Lead>>,
  play: Play,
  category: string,
  nowIso: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  let inserted = 0;
  const total = candidates.length;
  let done = 0;
  for (const c of candidates) {
    done += 1;
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
    // Tick every 5 rows or on the last row so the UI shows motion without
    // flooding the stream.
    if (onProgress && (done % 5 === 0 || done === total)) {
      onProgress(done, total);
    }
  }
  return inserted;
}

async function stampRun(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  play: Play,
  run: PlaySourceRun,
): Promise<Play> {
  const nowIso = run.at;
  const category = play.category ?? play.title;
  const nextScope = {
    ...(play.scope ?? { summary: '', bullets: [], updatedAt: nowIso }),
    sourcedAt: nowIso,
    sourcedCount: (play.scope?.sourcedCount ?? 0) + run.inserted,
    lastSourceRun: run,
    updatedAt: nowIso,
  };
  const summary = run.error
    ? 'Source Prospects (' + run.agent + ') failed: ' + run.error
    : run.inserted > 0
      ? 'Source Prospects (' +
        run.agent +
        '): ' +
        run.inserted +
        ' row(s) added to funnel "' +
        category +
        '"'
      : 'Source Prospects (' + run.agent + ') ran — no rows added';
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
  await supabase.from('dashboard_plays').update({ payload: next }).eq('id', next.id);
  return next;
}
