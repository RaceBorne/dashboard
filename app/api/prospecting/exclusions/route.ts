import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Prospecting exclusions API. Wraps dashboard_blocked_domains for the
 * settings UI: list, add manually, remove. The same table is written
 * by the per-row "Not a fit" / "Not relevant" actions across Discovery
 * and the Similar tab.
 */

function normalizeDomain(d: string): string {
  return d
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}

interface AddBody {
  domain?: string;
  reason?: string;
}

export async function GET() {
  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });
  const { data, error } = await sb
    .from('dashboard_blocked_domains')
    .select('id, domain, reason, play_id, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    exclusions: (data ?? []) as Array<{
      id: string;
      domain: string;
      reason: string | null;
      play_id: string | null;
      created_at: string;
    }>,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AddBody;
  const domain = normalizeDomain(body.domain ?? '');
  if (!domain || !domain.includes('.')) {
    return NextResponse.json({ ok: false, error: 'valid domain required' }, { status: 400 });
  }
  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });
  // Manual add from Settings always lands as a global block.
  // Per-play blocks are created from inside a venture only.
  const { data: existing } = await sb
    .from('dashboard_blocked_domains')
    .select('id')
    .eq('domain', domain)
    .is('play_id', null)
    .limit(1);
  if (!existing || existing.length === 0) {
    const { error } = await sb
      .from('dashboard_blocked_domains')
      .insert({
        domain,
        reason: body.reason ?? 'Manually added in Settings',
        play_id: null,
      });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, domain });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const domain = normalizeDomain(url.searchParams.get('domain') ?? '');
  if (!id && !domain) {
    return NextResponse.json({ ok: false, error: 'id or domain required' }, { status: 400 });
  }
  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });
  const q = sb.from('dashboard_blocked_domains').delete();
  if (id) {
    const { error } = await q.eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  } else {
    // Legacy path: delete every row for this domain (both global + per-play).
    const { error } = await q.eq('domain', domain);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
