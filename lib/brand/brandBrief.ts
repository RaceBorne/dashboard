/**
 * Brand-brief loader, cache, and prompt formatter.
 *
 * Every AI call in the app reads the brief through getBrandBriefForPrompt()
 * so Claude already knows Evari is Evari — not "a company" to ask questions
 * about. The brief is stored in Supabase (dashboard_brand_brief) and
 * seeded from content/brand/evari_brand_brief.json on first read.
 *
 * Refreshed weekly by /api/cron/brand-refresh.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { BrandBrief } from './types';

const TABLE = 'dashboard_brand_brief';
const ROW_ID = 'brand_brief';
const SEED_PATH = path.join(process.cwd(), 'Content', 'brand', 'evari_brand_brief.json');

// In-memory cache so we don't round-trip to Supabase on every AI call.
// 5 minutes is long enough to smooth out bursts during a conversation,
// short enough that edits in the admin UI show up quickly.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { brief: BrandBrief; expiresAt: number } | null = null;

export function invalidateBrandBriefCache() {
  cached = null;
}

/**
 * Load the brief. Falls back to the seed JSON if Supabase is unavailable
 * or empty — we never want an AI call to run without brand grounding.
 */
export async function getBrandBrief(
  supabase?: SupabaseClient | null,
): Promise<BrandBrief> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.brief;

  const client = supabase ?? createSupabaseAdmin();
  let brief: BrandBrief | null = null;

  if (client) {
    const { data } = await client
      .from(TABLE)
      .select('payload')
      .eq('id', ROW_ID)
      .maybeSingle();
    if (data && typeof data === 'object' && 'payload' in data) {
      const payload = (data as { payload: BrandBrief }).payload;
      if (payload && payload.company?.name) brief = payload;
    }
  }

  if (!brief) {
    brief = await loadSeedBrief();
    // Best-effort seed into Supabase so future reads hit the DB.
    if (client) {
      await client
        .from(TABLE)
        .upsert({ id: ROW_ID, payload: brief, updated_at: new Date().toISOString() });
    }
  }

  cached = { brief, expiresAt: now + CACHE_TTL_MS };
  return brief;
}

export async function upsertBrandBrief(
  next: BrandBrief,
  supabase?: SupabaseClient | null,
): Promise<BrandBrief> {
  const client = supabase ?? createSupabaseAdmin();
  if (!client) throw new Error('Supabase admin client unavailable');
  const payload: BrandBrief = {
    ...next,
    id: ROW_ID,
    updatedAt: new Date().toISOString(),
  };
  const { error } = await client
    .from(TABLE)
    .upsert({ id: ROW_ID, payload, updated_at: payload.updatedAt });
  if (error) throw new Error('Failed to upsert brand brief: ' + error.message);
  invalidateBrandBriefCache();
  return payload;
}

async function loadSeedBrief(): Promise<BrandBrief> {
  const raw = await fs.readFile(SEED_PATH, 'utf8');
  return JSON.parse(raw) as BrandBrief;
}

/**
 * Render the brief into a Markdown-ish block the system prompt can embed.
 * Intentionally compact — the AI doesn't need the raw JSON, it needs the
 * facts in a form it can reference conversationally.
 */
export function formatBrandBriefForPrompt(brief: BrandBrief): string {
  const c = brief.company;
  const p = brief.products;
  const lines: string[] = [];

  lines.push('# Evari brand grounding (always-true facts)');
  lines.push('');
  lines.push(`**Company:** ${c.name} (${c.legalName ?? c.name}). Founded ${c.founded ?? ''} in ${c.headquarters ?? ''}.`);
  if (c.founder) lines.push(`**Founder:** ${c.founder}.`);
  lines.push(`**Website:** ${brief.socialLinks.website}`);
  lines.push('');
  lines.push(`**One-liner:** ${brief.oneLiner}`);
  lines.push('');
  lines.push('**Positioning:**');
  lines.push(brief.positioning.summary);
  lines.push('');
  lines.push('Positioning pillars:');
  for (const pillar of brief.positioning.pillars) lines.push(`- ${pillar}`);
  lines.push('');
  lines.push('Not for:');
  for (const nf of brief.positioning.notFor) lines.push(`- ${nf}`);
  lines.push('');
  lines.push(`**Sole product line:** the ${p.sole}. Variants:`);
  for (const v of p.family) {
    const bits = [v.model];
    if (v.transmission) bits.push(v.transmission);
    if (v.finish) bits.push(v.finish);
    if (v.audience) bits.push(`→ ${v.audience}`);
    lines.push(`- ${bits.join(' — ')}`);
  }
  lines.push('');
  lines.push('Shared specs:');
  for (const [k, v] of Object.entries(p.sharedSpecs)) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push('');
  lines.push('**Voice — do:**');
  for (const d of brief.voice.do) lines.push(`- ${d}`);
  lines.push('**Voice — don\'t:**');
  for (const d of brief.voice.dont) lines.push(`- ${d}`);
  lines.push('');
  lines.push('**Audiences we sell to:**');
  for (const a of brief.audiences.primary) lines.push(`- ${a.label}: ${a.description}`);
  lines.push('');
  lines.push('Example account types we target:');
  for (const a of brief.audiences.accountExamples) lines.push(`- ${a}`);
  lines.push('');
  lines.push('**Differentiators:**');
  for (const d of brief.differentiators) lines.push(`- ${d}`);
  lines.push('');
  lines.push('**Hard outreach rules (never violate):**');
  for (const r of brief.outreachRules.whenWritingCopy) lines.push(`- ${r}`);
  for (const r of brief.outreachRules.whenSourcingProspects) lines.push(`- ${r}`);
  lines.push('');
  lines.push('**Operating rule for this dashboard:** you already know all of the above. Never ask Craig to explain what Evari is, what problem we solve, who our customer is, or what our wedge is. That is your grounding; his job is strategy direction, yours is execution and research.');
  return lines.join('\n');
}

/**
 * Convenience: load + format in one call. The gateway uses this so
 * callers don't have to plumb the brief through.
 */
export async function getBrandBriefForPrompt(
  supabase?: SupabaseClient | null,
): Promise<string> {
  try {
    const brief = await getBrandBrief(supabase);
    return formatBrandBriefForPrompt(brief);
  } catch (err) {
    // Never fail an AI call because the brief load failed — degrade to a
    // minimal inline fact block instead.
    const reason = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn('[brand] getBrandBriefForPrompt fallback:', reason);
    return [
      '# Evari brand grounding (fallback)',
      '',
      'Evari is a premium British e-bike brand. The sole product line is the 856 — a hand-built monocoque-carbon, fully-integrated all-road e-bike. Target: HNW UK buyers. Website: https://evari.cc. Never ask Craig to explain the company — that is your grounding.',
    ].join('\n');
  }
}
