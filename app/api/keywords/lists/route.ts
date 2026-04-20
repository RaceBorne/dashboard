import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/keywords/lists
 *   → list every active keyword list (with member count)
 * POST /api/keywords/lists
 *   → create a new list
 *     body: { label, kind, target_domain?, color_tone?, location_code?, language_code?, notes? }
 *   A matching slug is derived from label (lowercased, kebab-case).
 */

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export async function GET() {
  const supa = createSupabaseAdmin();
  if (!supa) {
    return NextResponse.json({ ok: false, error: 'Supabase admin unavailable' }, { status: 500 });
  }

  const { data, error } = await supa
    .from('dashboard_keyword_lists')
    .select(
      'id, slug, label, kind, target_domain, color_tone, location_code, language_code, notes, created_at, last_synced_at, last_sync_cost_usd',
    )
    .is('retired_at', null)
    .order('kind', { ascending: true }) // 'competitor' < 'own' alphabetically, so own ends up last by default
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Lightweight count join — cheap for <100 lists.
  const ids = (data ?? []).map((l) => l.id);
  const counts: Record<number, number> = {};
  if (ids.length > 0) {
    const { data: memRows } = await supa
      .from('dashboard_keyword_list_members')
      .select('list_id')
      .in('list_id', ids);
    for (const row of memRows ?? []) {
      counts[row.list_id] = (counts[row.list_id] ?? 0) + 1;
    }
  }

  // Sort: own lists first, then competitor lists alpha.
  const sorted = (data ?? []).slice().sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'own' ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return NextResponse.json({
    ok: true,
    lists: sorted.map((l) => ({ ...l, member_count: counts[l.id] ?? 0 })),
  });
}

export async function POST(req: Request) {
  const supa = createSupabaseAdmin();
  if (!supa) {
    return NextResponse.json({ ok: false, error: 'Supabase admin unavailable' }, { status: 500 });
  }

  let body: {
    label?: string;
    kind?: 'own' | 'competitor';
    target_domain?: string | null;
    color_tone?: string;
    location_code?: number;
    language_code?: string;
    notes?: string | null;
    slug?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const label = body.label?.trim();
  const kind = body.kind;
  if (!label || !kind) {
    return NextResponse.json(
      { ok: false, error: 'label and kind are required' },
      { status: 400 },
    );
  }
  if (kind !== 'own' && kind !== 'competitor') {
    return NextResponse.json(
      { ok: false, error: 'kind must be "own" or "competitor"' },
      { status: 400 },
    );
  }

  // Normalize target_domain for competitor lists; strip protocol/www.
  let targetDomain: string | null = null;
  if (kind === 'competitor') {
    const raw = body.target_domain?.trim();
    if (!raw) {
      return NextResponse.json(
        { ok: false, error: 'target_domain is required for competitor lists' },
        { status: 400 },
      );
    }
    targetDomain = raw.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '').toLowerCase();
  }

  // Slug: prefer the one the client sent; otherwise derive from label + domain
  // to avoid collisions when multiple competitor lists share a label.
  const baseSlug = body.slug?.trim() || slugify(targetDomain ?? label);
  if (!baseSlug) {
    return NextResponse.json({ ok: false, error: 'Unable to derive slug' }, { status: 400 });
  }

  // If the slug already exists, append a suffix until free. Cheap — <100 lists.
  let slug = baseSlug;
  for (let i = 2; i <= 50; i++) {
    const { data: existing } = await supa
      .from('dashboard_keyword_lists')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${i}`;
  }

  const { data, error } = await supa
    .from('dashboard_keyword_lists')
    .insert({
      slug,
      label,
      kind,
      target_domain: targetDomain,
      color_tone: body.color_tone ?? 'accent',
      location_code: body.location_code ?? 2826,
      language_code: body.language_code ?? 'en',
      notes: body.notes ?? null,
    })
    .select('id, slug, label, kind, target_domain, color_tone, location_code, language_code, notes, created_at')
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, list: data });
}
