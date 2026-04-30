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
    .select('domain, reason, blocked_by_play, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    exclusions: (data ?? []) as Array<{
      domain: string;
      reason: string | null;
      blocked_by_play: string | null;
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
  const { error } = await sb
    .from('dashboard_blocked_domains')
    .upsert(
      { domain, reason: body.reason ?? 'Manually added in Settings' },
      { onConflict: 'domain', ignoreDuplicates: true },
    );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, domain });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const domain = normalizeDomain(url.searchParams.get('domain') ?? '');
  if (!domain) {
    return NextResponse.json({ ok: false, error: 'domain required' }, { status: 400 });
  }
  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });
  const { error } = await sb
    .from('dashboard_blocked_domains')
    .delete()
    .eq('domain', domain);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, domain });
}
