import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/theme/branding
 *   Returns { ok, logoLight, logoDark } where each is a data URL or null.
 *   Used by ThemeProvider on mount to hydrate the logo state from Supabase.
 *
 * POST /api/theme/branding
 *   Body: { which: 'light' | 'dark', dataUrl: string | null }
 *   When dataUrl is null, clears that slot. Otherwise stores the data URL
 *   on the singleton branding row. We keep this as a data URL rather than
 *   a Storage upload because the uploader already caps at 1MB and the
 *   row is only ever read once per page load — trade bytes for zero-op.
 */

const BUCKET_ID = 'singleton';
const MAX_BYTES = 1_400_000; // ~1MB image + base64 overhead

export async function GET() {
  const supa = createSupabaseAdmin();
  if (!supa) {
    return NextResponse.json({ ok: true, logoLight: null, logoDark: null });
  }
  const { data, error } = await supa
    .from('dashboard_branding')
    .select('logo_light_data_url, logo_dark_data_url')
    .eq('id', BUCKET_ID)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, logoLight: null, logoDark: null },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    logoLight: data?.logo_light_data_url ?? null,
    logoDark: data?.logo_dark_data_url ?? null,
  });
}

interface PostBody {
  which?: 'light' | 'dark';
  dataUrl?: string | null;
}

export async function POST(req: Request) {
  const supa = createSupabaseAdmin();
  if (!supa) {
    return NextResponse.json({ ok: false, error: 'Supabase admin unavailable' }, { status: 500 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const which = body.which;
  if (which !== 'light' && which !== 'dark') {
    return NextResponse.json(
      { ok: false, error: 'which must be "light" or "dark"' },
      { status: 400 },
    );
  }

  const raw = body.dataUrl;
  let dataUrl: string | null = null;
  if (typeof raw === 'string' && raw.trim()) {
    if (!raw.startsWith('data:image/')) {
      return NextResponse.json(
        { ok: false, error: 'dataUrl must start with data:image/' },
        { status: 400 },
      );
    }
    if (raw.length > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'Logo too large (>1MB). Optimise and try again.' },
        { status: 400 },
      );
    }
    dataUrl = raw;
  }

  const column = which === 'light' ? 'logo_light_data_url' : 'logo_dark_data_url';

  // Upsert so we don't rely on the migration insert being applied yet
  // (useful when running against a fresh Supabase instance).
  const { error } = await supa
    .from('dashboard_branding')
    .upsert(
      { id: BUCKET_ID, [column]: dataUrl, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, which, cleared: dataUrl === null });
}
