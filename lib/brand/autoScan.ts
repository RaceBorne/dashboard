/**
 * Auto-scan: populate a freshly-created Play's funnel with candidate
 * companies, in the background.
 *
 * The Play POST route schedules this via Next.js `after()`. We don't block
 * the response on it — Craig gets the Play id immediately and the funnel
 * fills in asynchronously. If the gateway / DataForSEO is offline, we
 * quietly stamp the Play activity with a note and exit.
 *
 * This intentionally does NOT require a Play.scope — the whole point of
 * auto-scan is to surface candidates *before* strategy is committed, so
 * Craig has something concrete to react to in the Spitball chat.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import {
  isDataForSeoConnected,
  searchBusinessListings,
  type BusinessListing,
} from '@/lib/integrations/dataforseo';
import { upsertLead } from '@/lib/dashboard/repository';
import type { Lead, Play } from '@/lib/types';

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
  if (!isDataForSeoConnected()) {
    await stampActivity(supabase, play, 'Auto-scan skipped: DataForSEO not configured.');
    return { inserted: 0, found: 0, agent: 'skipped', skipReason: 'no-dataforseo' };
  }
  if (!hasAIGatewayCredentials()) {
    await stampActivity(supabase, play, 'Auto-scan skipped: AI gateway not configured.');
    return { inserted: 0, found: 0, agent: 'skipped', skipReason: 'no-ai' };
  }

  let plan: SearchPlan;
  try {
    plan = await derivePlanFromPlay(play, opts?.limit ?? 25);
  } catch (err) {
    await stampActivity(
      supabase,
      play,
      'Auto-scan skipped: could not derive search plan — ' + (err as Error).message,
    );
    return { inserted: 0, found: 0, agent: 'skipped', skipReason: 'plan-failed' };
  }

  let listings: BusinessListing[] = [];
  let cost = 0;
  try {
    const res = await searchBusinessListings({
      description: plan.description,
      locationName: plan.locationName,
      limit: plan.limit ?? 25,
    });
    listings = res.listings;
    cost = res.cost;
  } catch (err) {
    await stampActivity(
      supabase,
      play,
      'Auto-scan skipped: DataForSEO call failed — ' + (err as Error).message,
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
  }

  await stampActivity(
    supabase,
    play,
    'Auto-scan sourced ' +
      inserted +
      ' candidate(s) for "' +
      plan.description +
      '" in ' +
      plan.locationName +
      ' (DataForSEO, $' +
      cost.toFixed(3) +
      ').',
  );

  return {
    inserted,
    found: listings.length,
    agent: 'dataforseo',
    query: plan,
    costUsd: cost,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function derivePlanFromPlay(play: Play, limit: number): Promise<SearchPlan> {
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
    '- Prefer 25 as the default limit.',
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

function deriveDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url.startsWith('http') ? url : 'https://' + url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

async function stampActivity(
  supabase: SupabaseClient,
  play: Play,
  summary: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const next: Play = {
    ...play,
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
