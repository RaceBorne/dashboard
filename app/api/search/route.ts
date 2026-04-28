/**
 * GET /api/search?q=foo&limit=20
 *
 * Fans a single string query out to every searchable surface in
 * parallel. Each surface returns a small, uniform { id, kind,
 * title, subtitle, href } shape so the palette can render every
 * result in one mixed list.
 *
 * Surfaces searched:
 *   - leads           (dashboard_leads.payload->>'name', email, company)
 *   - mkt_contacts    (first_name, last_name, email, company)
 *   - campaigns       (name, subject)
 *   - groups          (name, description)
 *   - segments        (name)
 *   - templates       (name)
 *   - suppressions    (email)
 *
 * Each surface caps at ~5 hits so the palette is browsable. Errors
 * on one surface don't kill the whole response.
 */

import { NextResponse } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface SearchHit {
  id: string;
  kind: 'lead' | 'contact' | 'campaign' | 'list' | 'segment' | 'template' | 'suppression';
  title: string;
  subtitle?: string;
  href: string;
}

const PER_KIND = 5;

async function safe<T>(p: Promise<T[]>): Promise<T[]> {
  try { return await p; } catch (e) { console.error('[search.surface]', e); return []; }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 1) return NextResponse.json({ ok: true, hits: [] as SearchHit[] });

  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;

  // Use Promise.allSettled-ish via safe() so any surface erroring just empties.
  const [leads, contacts, campaigns, groups, segments, templates, suppressions] = await Promise.all([
    safe((async () => {
      const { data } = await sb
        .from('dashboard_leads')
        .select('id, payload')
        .or(`payload->>name.ilike.${like},payload->>email.ilike.${like},payload->>company.ilike.${like}`)
        .limit(PER_KIND);
      return ((data ?? []) as Array<{ id: string; payload: Record<string, unknown> }>).map<SearchHit>((r) => {
        const p = r.payload ?? {};
        return {
          id: r.id,
          kind: 'lead',
          title: (p.name as string) || (p.company as string) || (p.email as string) || 'Lead',
          subtitle: (p.email as string) || (p.company as string) || '',
          href: `/leads?id=${encodeURIComponent(r.id)}`,
        };
      });
    })()),
    safe((async () => {
      const { data } = await sb
        .from('dashboard_mkt_contacts')
        .select('id, first_name, last_name, email, company, lead_id')
        .or(`email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like}`)
        .limit(PER_KIND);
      return ((data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string; company: string | null; lead_id: string | null }>).map<SearchHit>((r) => ({
        id: r.id,
        kind: 'contact',
        title: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || r.email,
        subtitle: r.email,
        href: r.lead_id ? `/leads?id=${encodeURIComponent(r.lead_id)}` : '/email/audience',
      }));
    })()),
    safe((async () => {
      const { data } = await sb
        .from('dashboard_mkt_campaigns')
        .select('id, name, subject, status')
        .or(`name.ilike.${like},subject.ilike.${like}`)
        .limit(PER_KIND);
      return ((data ?? []) as Array<{ id: string; name: string; subject: string; status: string }>).map<SearchHit>((r) => ({
        id: r.id,
        kind: 'campaign',
        title: r.name || '(untitled)',
        subtitle: `${r.status} · ${r.subject || 'no subject'}`,
        href: `/email/campaigns/${r.id}`,
      }));
    })()),
    safe((async () => {
      const { data } = await sb
        .from('dashboard_mkt_groups')
        .select('id, name, description')
        .or(`name.ilike.${like},description.ilike.${like}`)
        .limit(PER_KIND);
      return ((data ?? []) as Array<{ id: string; name: string; description: string | null }>).map<SearchHit>((r) => ({
        id: r.id,
        kind: 'list',
        title: r.name,
        subtitle: r.description ?? 'List',
        href: `/leads?listId=${encodeURIComponent(r.id)}`,
      }));
    })()),
    safe((async () => {
      const { data } = await sb
        .from('dashboard_mkt_segments')
        .select('id, name')
        .ilike('name', like)
        .limit(PER_KIND);
      return ((data ?? []) as Array<{ id: string; name: string }>).map<SearchHit>((r) => ({
        id: r.id,
        kind: 'segment',
        title: r.name,
        subtitle: 'Segment',
        href: `/email/audience`,
      }));
    })()),
    safe((async () => {
      const { data } = await sb
        .from('dashboard_mkt_templates')
        .select('id, name')
        .ilike('name', like)
        .limit(PER_KIND);
      return ((data ?? []) as Array<{ id: string; name: string }>).map<SearchHit>((r) => ({
        id: r.id,
        kind: 'template',
        title: r.name,
        subtitle: 'Template',
        href: `/email/templates/${r.id}`,
      }));
    })()),
    safe((async () => {
      const { data } = await sb
        .from('dashboard_suppressions')
        .select('id, email')
        .ilike('email', like)
        .limit(PER_KIND);
      return ((data ?? []) as Array<{ id: string; email: string }>).map<SearchHit>((r) => ({
        id: r.id,
        kind: 'suppression',
        title: r.email,
        subtitle: 'Suppressed',
        href: '/email/suppressions',
      }));
    })()),
  ]);

  const hits = [...leads, ...contacts, ...campaigns, ...groups, ...segments, ...templates, ...suppressions];
  return NextResponse.json({ ok: true, hits });
}
