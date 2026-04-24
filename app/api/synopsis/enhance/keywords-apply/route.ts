import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/synopsis/enhance/keywords-apply
 *
 * Takes a confirmed shortlist from the keywords-research modal and:
 *   1. Creates a competitor keyword list per approved competitor (if it
 *      doesn't already exist).
 *   2. Seeds each competitor list with the proposed seed keywords.
 *   3. Adds the union of all approved seed keywords to Evari's own list
 *      (creating it first if the workspace is empty).
 *
 * Idempotent — re-running with the same input is a no-op thanks to the
 * upsert on (list_id, keyword).
 */

interface ApplyBody {
  competitors?: Array<{
    name?: string;
    domain?: string;
    seedKeywords?: string[];
  }>;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normaliseDomain(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .trim();
}

export async function POST(req: Request) {
  const supa = createSupabaseAdmin();
  if (!supa) {
    return NextResponse.json({ ok: false, error: 'Supabase admin unavailable' }, { status: 500 });
  }

  let body: ApplyBody;
  try {
    body = (await req.json()) as ApplyBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const approved = (body.competitors ?? [])
    .map((c) => ({
      name: (c.name ?? '').trim(),
      domain: normaliseDomain(c.domain ?? ''),
      seedKeywords: Array.isArray(c.seedKeywords)
        ? c.seedKeywords
            .filter((k): k is string => typeof k === 'string')
            .map((k) => k.toLowerCase().trim())
            .filter(Boolean)
        : [],
    }))
    .filter((c) => c.name && c.domain);
  if (approved.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No valid competitors in body' },
      { status: 400 },
    );
  }

  // ---- 1. Make sure Evari's own list exists. ----
  let ownListId: number | null = null;
  {
    const { data: existing } = await supa
      .from('dashboard_keyword_lists')
      .select('id')
      .eq('kind', 'own')
      .is('retired_at', null)
      .maybeSingle();
    if (existing) {
      ownListId = existing.id;
    } else {
      const { data: created, error } = await supa
        .from('dashboard_keyword_lists')
        .insert({
          slug: 'evari',
          label: 'Evari',
          kind: 'own',
          target_domain: 'evari.cc',
          color_tone: 'gold',
          location_code: 2826,
          language_code: 'en',
          notes: 'Auto-created by Synopsis enhance.',
        })
        .select('id')
        .single();
      if (error) {
        return NextResponse.json(
          { ok: false, error: 'Could not create own list: ' + error.message },
          { status: 500 },
        );
      }
      ownListId = created.id;
    }
  }

  const created: Array<{ domain: string; listId: number; keywordsAdded: number }> = [];
  const ownKeywords = new Set<string>();

  // ---- 2. For each approved competitor, ensure a list + seed keywords ----
  for (const c of approved) {
    // Find-or-create the competitor list.
    let listId: number;
    const { data: existing } = await supa
      .from('dashboard_keyword_lists')
      .select('id')
      .eq('kind', 'competitor')
      .eq('target_domain', c.domain)
      .is('retired_at', null)
      .maybeSingle();

    if (existing) {
      listId = existing.id;
    } else {
      // Derive a unique slug based on the bare domain.
      const baseSlug = slugify(c.domain.replace(/\.[a-z.]+$/, ''));
      let slug = baseSlug || slugify(c.name);
      for (let i = 2; i <= 50; i++) {
        const { data: collide } = await supa
          .from('dashboard_keyword_lists')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();
        if (!collide) break;
        slug = (baseSlug || slugify(c.name)) + '-' + i;
      }
      const { data: row, error } = await supa
        .from('dashboard_keyword_lists')
        .insert({
          slug,
          label: c.name,
          kind: 'competitor',
          target_domain: c.domain,
          color_tone: 'accent',
          location_code: 2826,
          language_code: 'en',
          notes: 'Added by Synopsis enhance.',
        })
        .select('id')
        .single();
      if (error) {
        return NextResponse.json(
          { ok: false, error: 'Could not create competitor list for ' + c.domain + ': ' + error.message },
          { status: 500 },
        );
      }
      listId = row.id;
    }

    // Seed the competitor list with the proposed keywords.
    if (c.seedKeywords.length > 0) {
      const rows = c.seedKeywords.map((kw) => ({
        list_id: listId,
        keyword: kw,
        source: 'auto' as const,
        priority: 0,
      }));
      const { error } = await supa
        .from('dashboard_keyword_list_members')
        .upsert(rows, { onConflict: 'list_id,keyword', ignoreDuplicates: true });
      if (error) {
        return NextResponse.json(
          { ok: false, error: 'Could not seed keywords for ' + c.domain + ': ' + error.message },
          { status: 500 },
        );
      }
    }

    for (const kw of c.seedKeywords) ownKeywords.add(kw);
    created.push({ domain: c.domain, listId, keywordsAdded: c.seedKeywords.length });
  }

  // ---- 3. Mirror the union onto Evari's own list so we can SERP-track them ----
  let ownAdded = 0;
  if (ownListId && ownKeywords.size > 0) {
    const rows = Array.from(ownKeywords).map((kw) => ({
      list_id: ownListId,
      keyword: kw,
      source: 'auto' as const,
      priority: 0,
    }));
    const { error } = await supa
      .from('dashboard_keyword_list_members')
      .upsert(rows, { onConflict: 'list_id,keyword', ignoreDuplicates: true });
    if (error) {
      return NextResponse.json(
        { ok: false, error: 'Could not mirror onto own list: ' + error.message },
        { status: 500 },
      );
    }
    ownAdded = ownKeywords.size;
  }

  return NextResponse.json({
    ok: true,
    competitorLists: created,
    ownKeywordsAdded: ownAdded,
  });
}
