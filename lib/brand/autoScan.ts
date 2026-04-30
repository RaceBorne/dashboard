/**
 * Auto-scan: populate a freshly-created Play's funnel with candidate
 * companies, in the background.
 *
 * The Play POST route schedules this via Next.js `after()`. We don't block
 * the response on it — Craig gets the Play id immediately and the funnel
 * fills in asynchronously. Status transitions are persisted on
 * `play.autoScan` so the UI can render a "Scanning…" pill that self-resolves
 * once the scan finishes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import {
  isDataForSeoConnected,
  searchBusinessListings,
  type BusinessListing,
} from '@/lib/integrations/dataforseo';
import { upsertLead } from '@/lib/dashboard/repository';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getOrCreateBrief } from '@/lib/marketing/strategy';
import type { Lead, Play, PlayAutoScanStatus, PlaySourceRun } from '@/lib/types';

interface SearchPlan {
  description: string;
  locationName: string;
  limit?: number;
}

export interface AutoScanResult {
  inserted: number;
  found: number;
  agent: 'dataforseo' | 'skipped';
  query?: SearchPlan;
  costUsd?: number;
  skipReason?: string;
}

/**
 * Main entry. Called from POST /api/plays via `after()`.
 */
export async function autoScanForPlay(
  supabase: SupabaseClient,
  play: Play,
  opts?: { limit?: number },
): Promise<AutoScanResult> {
  const startedAt = new Date().toISOString();
  await setStatus(supabase, play, {
    status: 'running',
    startedAt,
  });

  if (!isDataForSeoConnected()) {
    await finish(
      supabase,
      play,
      {
        status: 'skipped',
        startedAt,
        finishedAt: new Date().toISOString(),
        skipReason: 'DataForSEO not configured',
      },
      'Auto-scan skipped: DataForSEO not configured.',
    );
    return { inserted: 0, found: 0, agent: 'skipped', skipReason: 'no-dataforseo' };
  }
  if (!hasAIGatewayCredentials()) {
    await finish(
      supabase,
      play,
      {
        status: 'skipped',
        startedAt,
        finishedAt: new Date().toISOString(),
        skipReason: 'AI gateway not configured',
      },
      'Auto-scan skipped: AI gateway not configured.',
    );
    return { inserted: 0, found: 0, agent: 'skipped', skipReason: 'no-ai' };
  }

  let plans: SearchPlan[];
  try {
    plans = await derivePlansFromPlay(supabase, play, opts?.limit);
  } catch (err) {
    await finish(
      supabase,
      play,
      {
        status: 'error',
        startedAt,
        finishedAt: new Date().toISOString(),
        error: 'Plan failed: ' + (err as Error).message,
      },
      'Auto-scan skipped: could not derive search plan, ' + (err as Error).message,
    );
    return { inserted: 0, found: 0, agent: 'skipped', skipReason: 'plan-failed' };
  }

  // Run every search plan in parallel and merge the results, deduped
  // by domain so the same yacht builder can't show up twice across
  // different keyword variants.
  let listings: BusinessListing[] = [];
  let cost = 0;
  try {
    const settled = await Promise.allSettled(
      plans.map((p) =>
        searchBusinessListings({
          description: p.description,
          locationName: p.locationName,
          limit: p.limit ?? 100,
        }),
      ),
    );
    const seen = new Set<string>();
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue;
      cost += r.value.cost;
      for (const l of r.value.listings) {
        const key = (l.domain || l.url || l.title).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        listings.push(l);
      }
    }
    if (listings.length === 0) {
      // All searches failed or returned nothing. Surface the first
      // error so the Discovery banner shows something useful.
      const firstErr = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (firstErr) {
        throw firstErr.reason;
      }
    }
  } catch (err) {
    await finish(
      supabase,
      play,
      {
        status: 'error',
        startedAt,
        finishedAt: new Date().toISOString(),
        description: plans.map((p) => p.description).join(' | '),
        locationName: plans[0]?.locationName ?? '',
        error: 'DataForSEO call failed: ' + (err as Error).message,
      },
      'Auto-scan skipped: DataForSEO call failed, ' + (err as Error).message,
    );
    return { inserted: 0, found: 0, agent: 'skipped', skipReason: 'dfs-failed' };
  }

  const nowIso = new Date().toISOString();
  const category = play.category ?? play.title;
  let inserted = 0;

  for (const l of listings) {
    const row = listingToLead(l, play, category, nowIso);
    const out = await upsertLead(supabase, row);
    if (out) inserted += 1;
    // Also write a shortlist row so the Discovery dashboard surfaces
    // the company. The leads table is the canonical prospect record;
    // the shortlist is the per-play scoring + curation surface that
    // /api/discover/[playId]/dashboard reads from.
    await upsertShortlistFromListing(supabase, l, play.id);
  }

  const finishedAt = new Date().toISOString();
  const planSummary = plans.map((p) => p.description).join(', ');
  await finish(
    supabase,
    play,
    {
      status: 'done',
      startedAt,
      finishedAt,
      inserted,
      found: listings.length,
      description: planSummary,
      locationName: plans[0]?.locationName ?? '',
      costUsd: cost,
    },
    'Auto-scan sourced ' +
      inserted +
      ' candidate(s) across ' +
      plans.length +
      ' searches (DataForSEO, $' +
      cost.toFixed(3) +
      ').',
    // Also stamp scope.lastSourceRun so the detail panel's "Last run"
    // card shows the auto-scan result even before Craig runs Source
    // Prospects manually.
    {
      at: finishedAt,
      agent: 'auto-scan',
      description: planSummary,
      locationName: plans[0]?.locationName ?? '',
      found: listings.length,
      inserted,
      costUsd: cost,
    },
  );

  return {
    inserted,
    found: listings.length,
    agent: 'dataforseo',
    query: plans[0],
    costUsd: cost,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function derivePlansFromPlay(
  supabase: SupabaseClient,
  play: Play,
  limit: number | undefined,
): Promise<SearchPlan[]> {
  // Strategy brief drives the matrix when present: every sector
  // crossed with every geography (capped at 8 queries to keep cost
  // sane). Falls back to a single AI-generated plan otherwise.
  const brief = await getOrCreateBrief(play.id).catch(() => null);
  if (brief && brief.industries.length > 0) {
    const geos = brief.geographies && brief.geographies.length > 0
      ? brief.geographies
      : (brief.geography ? [brief.geography] : ['United Kingdom']);
    const queries: SearchPlan[] = [];
    for (const sector of brief.industries) {
      for (const geo of geos) {
        queries.push({
          description: sector,
          locationName: normaliseLocation(geo),
          limit: limit ?? 100,
        });
        if (queries.length >= 8) break;
      }
      if (queries.length >= 8) break;
    }
    if (queries.length > 0) return queries;
  }
  // Fallback: single AI-generated plan.
  const single = await deriveSinglePlanFromPlay(play, limit ?? 50);
  return [single];
}

/**
 * Map free-form geography strings to a DataForSEO-friendly location
 * name. DataForSEO accepts country names ("United Kingdom"), region/
 * city pairs ("Southampton, England, United Kingdom"), and similar.
 * Anything we can't confidently re-format gets the country prefix
 * appended.
 */
function normaliseLocation(geo: string): string {
  const trimmed = geo.trim();
  if (!trimmed) return 'United Kingdom';
  // If they typed something with the country already, leave it alone.
  if (/united\s*kingdom|england|scotland|wales|usa|united\s*states|canada|australia|france|germany|italy|spain/i.test(trimmed)) {
    return trimmed;
  }
  // Strip parenthetical detail like 'South Coast (Solent, ...)' so
  // DataForSEO doesn't choke. Take what's outside the parens, append
  // 'United Kingdom' as the country anchor.
  const noParens = trimmed.replace(/\([^)]*\)/g, '').trim();
  return noParens + ', United Kingdom';
}

async function deriveSinglePlanFromPlay(play: Play, limit: number): Promise<SearchPlan> {
  const prompt = [
    'You are translating a freshly-named Evari outreach Play into a DataForSEO Business Listings search.',
    'The Play has JUST been created, so it may only have a title and a short brief.',
    '',
    'Play title: ' + play.title,
    'Brief: ' + (play.brief ?? ''),
    'Category: ' + (play.category ?? play.title),
    '',
    'Your grounding already tells you what Evari sells, who buys it, and the hard outreach rules. Use that grounding to pick the right keyword + location.',
    '',
    'Emit a single JSON object, nothing else:',
    '{',
    '  "description": string,    // short Google-style keyword for Business Listings',
    '  "locationName": string,   // DataForSEO location (e.g. "United Kingdom", "London, England, United Kingdom")',
    '  "limit": number           // 1..50',
    '}',
    '',
    'Rules:',
    '- The description should be concrete (what kind of business are we targeting) and as specific as the Play title allows.',
    '- Default location is "United Kingdom" unless the title implies a specific city/region.',
    '- Prefer 100 as the default limit, capped at 200.',
    '- Never target generic bike shops. Prefer HNW / luxury-adjacent categories consistent with the brand grounding.',
    '- Return raw JSON only — no prose, no markdown fences.',
  ].join('\n');

  const raw = await generateBriefing({
    task: 'auto-scan-plan',
    voice: 'analyst',
    prompt,
  });
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
  const locationName =
    typeof parsed.locationName === 'string' && parsed.locationName.trim().length > 0
      ? parsed.locationName.trim()
      : 'United Kingdom';
  const lim =
    typeof parsed.limit === 'number' && parsed.limit > 0 && parsed.limit <= 50
      ? Math.floor(parsed.limit)
      : limit;
  if (!description) throw new Error('empty description');
  return { description, locationName, limit: lim };
}

function listingToLead(
  l: BusinessListing,
  play: Play,
  category: string,
  nowIso: string,
): Lead {
  const slug = slugify(l.title) || Math.random().toString(36).slice(2, 10);
  const id = 'prospect-' + (play.id + '-' + slug).slice(0, 80);
  const domain = l.domain || deriveDomain(l.url);
  const inferredEmail = domain ? 'info@' + domain : '';
  return {
    id,
    fullName: l.title,
    companyName: l.title,
    companyUrl: l.url,
    address: l.address,
    phone: l.phone,
    email: inferredEmail,
    emailInferred: Boolean(inferredEmail),
    source: 'outreach_agent',
    sourceCategory: 'outreach',
    sourceDetail:
      'Auto-scan (DataForSEO): ' +
      (l.category ?? 'business listings') +
      (l.address ? ' — ' + l.address : ''),
    stage: 'new',
    intent: 'unknown',
    firstSeenAt: nowIso,
    lastTouchAt: nowIso,
    tags: [],
    activity: [],
    tier: 'prospect',
    category,
    playId: play.id,
    prospectStatus: 'pending',
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function upsertShortlistFromListing(
  supabase: ReturnType<typeof createSupabaseAdmin> extends infer T ? T : never,
  l: BusinessListing,
  playId: string,
): Promise<void> {
  if (!supabase) return;
  const domain = l.domain || deriveDomain(l.url) || (l.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.unknown');
  // Upsert by (play_id, domain) so re-running the auto-scan doesn't
  // duplicate companies that DataForSEO surfaces again.
  await supabase
    .from('dashboard_play_shortlist')
    .upsert(
      {
        play_id: playId,
        domain,
        name: l.title,
        industry: l.category ?? null,
        location: l.address ?? null,
        description: l.category
          ? 'Auto-scan (DataForSEO): ' + l.category + (l.address ? ', ' + l.address : '')
          : (l.address ?? null),
        // Default fit_score of 60 (good band) until the scoring rubric
        // kicks in or the operator overrides it.
        fit_score: 60,
        fit_band: 'good',
        status: 'candidate',
      },
      { onConflict: 'play_id,domain', ignoreDuplicates: false },
    );
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

/**
 * Merge a new autoScan status into the Play row. Never touches
 * `activity` / `scope` — call `finish()` for terminal transitions that need
 * to stamp those too.
 */
async function setStatus(
  supabase: SupabaseClient,
  play: Play,
  autoScan: PlayAutoScanStatus,
): Promise<void> {
  const next: Play = {
    ...play,
    autoScan: { ...(play.autoScan ?? { status: 'pending' }), ...autoScan },
    updatedAt: new Date().toISOString(),
  };
  await supabase.from('dashboard_plays').update({ payload: next }).eq('id', play.id);
}

/**
 * Terminal status write + activity stamp. Optionally also writes
 * `scope.lastSourceRun` so the UI's "Last run" card reflects the auto-scan.
 */
async function finish(
  supabase: SupabaseClient,
  play: Play,
  autoScan: PlayAutoScanStatus,
  summary: string,
  lastSourceRun?: PlaySourceRun,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const nextScope =
    lastSourceRun && play.scope
      ? {
          ...play.scope,
          sourcedAt: lastSourceRun.at,
          sourcedCount:
            (play.scope.sourcedCount ?? 0) + lastSourceRun.inserted,
          lastSourceRun,
          updatedAt: nowIso,
        }
      : play.scope;
  const next: Play = {
    ...play,
    autoScan: { ...(play.autoScan ?? { status: 'pending' }), ...autoScan },
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
  await supabase.from('dashboard_plays').update({ payload: next }).eq('id', play.id);
}
