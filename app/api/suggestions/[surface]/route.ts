/**
 * GET  /api/suggestions/[surface]?refresh=1
 * POST /api/suggestions/[surface]            (force regenerate)
 *
 * AI-generated synopsis + actionable bullets for a given surface.
 * The first generation persists into dashboard_ai_suggestions; later
 * GETs serve the cached row if it's < STALE_AFTER_MS old. Manual
 * refresh forces a regeneration.
 *
 * Each bullet has shape:
 *   { title: string, description: string, priority: 'low'|'medium'|'high'|'urgent', category: string }
 *
 * Category maps directly to the tasks table category enum.
 */

import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { getTrafficSnapshot } from '@/lib/traffic/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

interface Bullet {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
}

interface Suggestions {
  synopsis: string;
  bullets: Bullet[];
}

async function buildContextForSurface(surface: string): Promise<{ ok: true; context: string } | { ok: false; error: string }> {
  if (surface === 'traffic') {
    try {
      const s = await getTrafficSnapshot();
      if (!s.connected) return { ok: false, error: 'GA4 not connected; cannot generate suggestions yet.' };
      if (!s.hasData) return { ok: false, error: 'GA4 connected but no data ingested yet. Click Sync now on the Traffic page.' };
      const lines = [
        `Window: ${s.windowStart} to ${s.windowEnd} (28 days)`,
        `Active users: ${s.kpi.activeUsers.value} (${(s.kpi.activeUsers.deltaPct * 100).toFixed(1)}% wow)`,
        `New users: ${s.kpi.newUsers.value} (${(s.kpi.newUsers.deltaPct * 100).toFixed(1)}% wow)`,
        `Sessions: ${s.kpi.sessions.value} (${(s.kpi.sessions.deltaPct * 100).toFixed(1)}% wow)`,
        `Events: ${s.kpi.events.value} (${(s.kpi.events.deltaPct * 100).toFixed(1)}% wow)`,
        '',
        'Top channels: ' + s.channels.slice(0, 5).map((c) => `${c.channel} ${c.sessions} sessions, ${c.conversions} conv`).join('; '),
        'Top pages: ' + s.pages.slice(0, 5).map((p) => `${p.pagePath} ${p.views} views, ${(p.bounceRate * 100).toFixed(0)}% bounce`).join('; '),
        'Top countries: ' + s.countries.slice(0, 5).map((c) => `${c.country} ${c.sessions}`).join('; '),
        'Top cities: ' + s.cities.slice(0, 5).map((c) => `${c.city} ${c.sessions}`).join('; '),
        'Devices: ' + s.devices.map((d) => `${d.device} ${d.sessions}`).join('; '),
        'Top sources: ' + s.sources.slice(0, 5).map((x) => `${x.source}/${x.medium} ${x.sessions}`).join('; '),
        'Top events: ' + s.events.slice(0, 5).map((e) => `${e.eventName} ${e.eventCount}`).join('; '),
      ];
      return { ok: true, context: lines.join('\n') };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'failed to load traffic snapshot' };
    }
  }
  return { ok: false, error: `surface "${surface}" is not yet wired for AI suggestions.` };
}

function categoryForSurface(surface: string): string {
  // Maps surface → tasks.category enum value. Must match TASK_CATEGORY_META.
  switch (surface) {
    case 'traffic': return 'shopify'; // traffic improvements are usually Shopify-side
    case 'seo': return 'seo';
    case 'pages': return 'seo';
    case 'backlinks': return 'seo';
    case 'keywords': return 'seo';
    default: return 'shopify';
  }
}

const PRIORITY_VALUES: ReadonlyArray<Bullet['priority']> = ['low', 'medium', 'high', 'urgent'];

async function generate(surface: string): Promise<{ ok: true; data: Suggestions } | { ok: false; error: string }> {
  if (!hasAIGatewayCredentials()) {
    return { ok: false, error: 'AI gateway not configured (no ANTHROPIC_API_KEY or AI_GATEWAY_API_KEY).' };
  }
  const ctx = await buildContextForSurface(surface);
  if (!ctx.ok) return ctx;

  const defaultCategory = categoryForSurface(surface);

  const prompt = [
    `Surface: ${surface}`,
    `Default task category for any actions on this surface: ${defaultCategory}`,
    '',
    'Live data:',
    ctx.context,
    '',
    'Write a short JSON object that is BOTH a synopsis and a set of actionable suggestions. Output VALID JSON only, no markdown fences, no commentary.',
    '',
    'Shape:',
    '{',
    '  "synopsis": "One sentence describing the current outlook in plain English. No buzzwords. No em-dashes. Cite one or two real numbers.",',
    '  "bullets": [',
    '    { "title": "Short imperative title, like a task", "description": "One sentence of why and what to do.", "priority": "low|medium|high|urgent", "category": "' + defaultCategory + '" }',
    '  ]',
    '}',
    '',
    'Constraints:',
    '- 3 to 5 bullets, no more.',
    '- Each title is an imperative action the operator could put on a to-do list (e.g. "Audit hero image on /products/evari-tour").',
    '- Each description explains the why in one short sentence.',
    '- Priority should reflect business impact: traffic crashes are high/urgent, optimisations are medium, exploratory work is low.',
    '- All bullets should use category "' + defaultCategory + '" unless an obvious better fit applies. Valid categories are exactly: seo, shopify, lead-gen, social, content, medical-rehab, conversations, commerce, infra, ai-automation, general. Do NOT invent other category names.',
    '- Output JSON only.',
  ].join('\n');

  const text = await generateBriefing({
    task: 'ai-suggestions-' + surface,
    voice: 'analyst',
    prompt,
  });

  // Strip code fences if the model adds them anyway.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: 'Model did not return valid JSON.' };
  }
  const obj = parsed as { synopsis?: unknown; bullets?: unknown };
  if (typeof obj.synopsis !== 'string' || !Array.isArray(obj.bullets)) {
    return { ok: false, error: 'Model JSON missing synopsis or bullets.' };
  }
  const bullets: Bullet[] = obj.bullets
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
    .slice(0, 5)
    .map((b) => {
      const title = typeof b.title === 'string' ? b.title.trim() : '';
      const description = typeof b.description === 'string' ? b.description.trim() : '';
      const priorityRaw = typeof b.priority === 'string' ? b.priority.toLowerCase() : 'medium';
      const priority = (PRIORITY_VALUES as ReadonlyArray<string>).includes(priorityRaw)
        ? (priorityRaw as Bullet['priority'])
        : 'medium';
      const VALID_CATS = ['seo', 'shopify', 'lead-gen', 'social', 'content', 'medical-rehab', 'conversations', 'commerce', 'infra', 'ai-automation', 'general'];
      let category = typeof b.category === 'string' ? b.category : defaultCategory;
      if (!VALID_CATS.includes(category)) category = defaultCategory;
      return { title, description, priority, category };
    })
    .filter((b) => b.title.length > 0);

  return { ok: true, data: { synopsis: obj.synopsis, bullets } };
}

async function persist(surface: string, data: Suggestions) {
  const sb = createSupabaseAdmin();
  if (!sb) return;
  await sb
    .from('dashboard_ai_suggestions')
    .upsert(
      {
        surface,
        synopsis: data.synopsis,
        bullets: data.bullets,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'surface' },
    );
}

async function readCached(surface: string): Promise<{ data: Suggestions; generatedAt: string } | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_ai_suggestions')
    .select('synopsis, bullets, generated_at')
    .eq('surface', surface)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { synopsis: string; bullets: Bullet[]; generated_at: string };
  return { data: { synopsis: row.synopsis, bullets: row.bullets }, generatedAt: row.generated_at };
}

export async function GET(_req: Request, { params }: { params: Promise<{ surface: string }> }) {
  const { surface } = await params;
  const cached = await readCached(surface);
  if (cached) {
    const age = Date.now() - new Date(cached.generatedAt).getTime();
    if (age < STALE_AFTER_MS) {
      return NextResponse.json({ ok: true, ...cached.data, cached: true, ageMinutes: Math.round(age / 60000) });
    }
  }
  const r = await generate(surface);
  if (!r.ok) {
    if (cached) {
      // Stale cache is better than nothing if regen fails.
      return NextResponse.json({ ok: true, ...cached.data, cached: true, stale: true, error: r.error });
    }
    return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
  }
  await persist(surface, r.data);
  return NextResponse.json({ ok: true, ...r.data, cached: false, ageMinutes: 0 });
}

export async function POST(_req: Request, { params }: { params: Promise<{ surface: string }> }) {
  const { surface } = await params;
  const r = await generate(surface);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
  await persist(surface, r.data);
  return NextResponse.json({ ok: true, ...r.data, cached: false });
}
