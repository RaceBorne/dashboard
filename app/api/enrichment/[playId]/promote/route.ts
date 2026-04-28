/**
 * POST /api/enrichment/[playId]/promote
 *
 * Body: { ids: string[]; groupId?: string | null }
 *
 * Promote enrichment contacts into real marketing contacts. For each
 * row: create or update dashboard_mkt_contacts on lower(email), copy
 * over first/last/company/job_title/linkedin_url; if groupId is
 * provided, add to that list as approved. Mark the enrichment row
 * as 'archived' so it stops appearing in the enrichment inbox.
 *
 * Idempotent — running twice is safe.
 */

import { NextResponse } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { setEnrichmentStatus } from '@/lib/marketing/enrichment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EnrichmentRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  job_title: string | null;
  company_name: string | null;
  linkedin_url: string | null;
  domain: string | null;
}

export async function POST(req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  const body = (await req.json().catch(() => null)) as { ids?: unknown; groupId?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? (body!.ids as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const groupId = typeof body?.groupId === 'string' ? body.groupId : null;
  if (ids.length === 0) return NextResponse.json({ ok: false, error: 'ids required' }, { status: 400 });

  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  const { data: rows } = await sb
    .from('dashboard_enrichment_contacts')
    .select('id, email, first_name, last_name, full_name, job_title, company_name, linkedin_url, domain')
    .in('id', ids);

  let promoted = 0;
  let skipped = 0;
  const promotedContactIds: string[] = [];

  for (const r of (rows ?? []) as EnrichmentRow[]) {
    if (!r.email) { skipped++; continue; }
    const email = r.email.trim().toLowerCase();
    if (!email) { skipped++; continue; }

    // Upsert on lower(email).
    const { data: existing } = await sb
      .from('dashboard_mkt_contacts')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    let contactId: string | null = null;
    if (existing) {
      contactId = (existing as { id: string }).id;
      await sb.from('dashboard_mkt_contacts').update({
        first_name: r.first_name,
        last_name: r.last_name,
        company: r.company_name,
        updated_at: new Date().toISOString(),
      }).eq('id', contactId);
    } else {
      const { data: inserted } = await sb.from('dashboard_mkt_contacts').insert({
        email,
        first_name: r.first_name,
        last_name: r.last_name,
        company: r.company_name,
        source: 'enrichment',
        status: 'active',
      }).select('id').single();
      contactId = (inserted as { id: string } | null)?.id ?? null;
    }

    if (!contactId) { skipped++; continue; }
    promoted++;
    promotedContactIds.push(contactId);

    if (groupId) {
      await sb.from('dashboard_mkt_contact_groups').upsert({
        contact_id: contactId,
        group_id: groupId,
        status: 'approved',
        added_by_source: 'enrichment',
      }, { onConflict: 'contact_id,group_id' });
    }
  }

  // Archive the source enrichment rows so they don't reappear.
  await setEnrichmentStatus(playId, ids, 'archived');

  return NextResponse.json({ ok: true, promoted, skipped, contactIds: promotedContactIds });
}
