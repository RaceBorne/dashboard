import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/prospects/folders
 *
 * Returns the distinct folder names (payload.category) across all
 * tier='prospect' rows, with a count of rows in each. Used by the
 * Discover "Save to folder" picker so operators can route search
 * results into an existing folder or create a new one.
 */
export async function GET() {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from('dashboard_leads')
    .select('payload')
    .eq('tier', 'prospect');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ payload: Record<string, unknown> | null }>) {
    const cat = row.payload?.category;
    if (typeof cat === 'string' && cat.trim()) {
      const name = cat.trim();
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  const folders = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return NextResponse.json({ folders });
}
