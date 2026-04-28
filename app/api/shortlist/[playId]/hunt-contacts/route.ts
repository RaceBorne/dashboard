/**
 * POST /api/shortlist/[playId]/hunt-contacts
 *
 * Body: { shortlistId: string, limit?: number }
 *
 * Looks up candidate contacts at a shortlisted company via the active
 * contact provider (mock/apollo/clearbit/hunter — see lib/marketing/
 * contactProvider). Each candidate gets written into
 * dashboard_enrichment_contacts as needs_review with whatever fields
 * the provider returned (emails when available, generic role names
 * otherwise).
 */

import { NextResponse } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { findContactsAtCompany } from '@/lib/marketing/contactProvider';
import { addEnrichmentContact } from '@/lib/marketing/enrichment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  const body = (await req.json().catch(() => null)) as { shortlistId?: string; limit?: number } | null;
  if (!body?.shortlistId) return NextResponse.json({ ok: false, error: 'shortlistId required' }, { status: 400 });

  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  const { data: row } = await sb
    .from('dashboard_play_shortlist')
    .select('id, name, domain, industry, description')
    .eq('id', body.shortlistId)
    .eq('play_id', playId)
    .maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: 'Not in shortlist' }, { status: 404 });
  const r = row as { id: string; name: string; domain: string; industry: string | null; description: string | null };

  const candidates = await findContactsAtCompany(r.domain, r.name, {
    industry: r.industry,
    description: r.description,
    limit: typeof body.limit === 'number' ? body.limit : 5,
  });

  const added: unknown[] = [];
  for (const c of candidates) {
    const e = await addEnrichmentContact({
      playId,
      shortlistId: r.id,
      domain: r.domain,
      companyName: r.name,
      fullName: c.fullName,
      jobTitle: c.jobTitle,
      email: c.email,
      linkedinUrl: c.linkedinUrl,
      fitScore: c.fitScore,
      aiSummary: c.reason,
    });
    if (e) added.push(e);
  }
  return NextResponse.json({ ok: true, added, provider: candidates[0]?.source ?? 'mock' });
}
